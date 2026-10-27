-- ============================================================================
-- COMPRATELOSV — 004 · Corrección: el trigger de montos bloqueaba la RPC
-- ============================================================================
-- PROBLEMA DETECTADO EN PRUEBAS
--   La migración 003 añadió el trigger trg_shop_ped_montos para impedir que un
--   administrador altere subtotal/total/descuento/envio de un pedido ya creado.
--   Pero ese trigger también se disparaba en el UPDATE interno de
--   shop_crear_pedido(), que es precisamente el que CALCULA esos montos.
--   Resultado: ningún pedido nuevo se podía crear.
--     ERROR: "Los montos del pedido no se pueden modificar"
--
-- SOLUCIÓN
--   Marca de contexto transaccional (GUC local):
--     · La RPC activa  shop.permitir_montos = 'on'  justo antes de escribir.
--     · El trigger permite la escritura solo si esa marca está activa.
--     · Cualquier otro UPDATE (panel admin, cliente, API) sigue bloqueado.
--   La marca es local a la transacción (`is_local = true`), así que no se filtra
--   a otras conexiones ni a operaciones posteriores.
--
-- IDEMPOTENTE.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Trigger de montos con la excepción controlada
-- ---------------------------------------------------------------------------
create or replace function public.shop_proteger_montos_pedido()
returns trigger
language plpgsql
as $$
begin
  -- Solo la RPC de creación puede fijar los montos.
  if current_setting('shop.permitir_montos', true) = 'on' then
    return new;
  end if;

  if new.subtotal   is distinct from old.subtotal
     or new.total      is distinct from old.total
     or new.descuento  is distinct from old.descuento
     or new.envio      is distinct from old.envio then
    raise exception 'Los montos del pedido no se pueden modificar';
  end if;

  return new;
end $$;

comment on function public.shop_proteger_montos_pedido() is
  'Impide alterar montos salvo durante la creación atómica del pedido (shop.permitir_montos).';

-- ---------------------------------------------------------------------------
-- 2. RPC de creación con la marca activada
-- ---------------------------------------------------------------------------
create or replace function public.shop_crear_pedido(
  p_items           jsonb,
  p_nombre          text,
  p_telefono        text,
  p_email           text default null,
  p_tipo_entrega    text default 'casa',
  p_direccion       text default null,
  p_departamento    text default null,
  p_municipio       text default null,
  p_referencia      text default null,
  p_cupon_codigo    text default null,
  p_metodo_pago     text default 'contraentrega',
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cliente_id  uuid := auth.uid();
  v_subtotal    numeric(10,2) := 0;
  v_descuento   numeric(10,2) := 0;
  v_envio       numeric(10,2) := 0;
  v_total       numeric(10,2) := 0;
  v_pedido_id   uuid;
  v_numero      text;
  v_item        jsonb;
  v_prod        record;
  v_cant        int;
  v_cupon       record;
  v_existente   record;
begin
  -- Idempotencia: devolver el pedido existente completo.
  if p_idempotency_key is not null then
    select id, numero, subtotal, descuento, envio, total
      into v_existente
      from public.shop_pedidos
     where idempotency_key = p_idempotency_key;

    if found then
      return jsonb_build_object(
        'ok',        true,
        'pedido_id', v_existente.id,
        'numero',    v_existente.numero,
        'subtotal',  v_existente.subtotal,
        'descuento', v_existente.descuento,
        'envio',     v_existente.envio,
        'total',     v_existente.total,
        'repetido',  true
      );
    end if;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene items';
  end if;
  if p_nombre is null or length(trim(p_nombre)) < 2 then
    raise exception 'Nombre de contacto inválido';
  end if;
  if p_telefono is null or length(trim(p_telefono)) < 7 then
    raise exception 'Teléfono inválido';
  end if;

  insert into public.shop_pedidos (
    cliente_id, invitado_email, nombre_contacto, telefono, email,
    tipo_entrega, direccion, departamento, municipio, referencia,
    metodo_pago, idempotency_key
  ) values (
    v_cliente_id, case when v_cliente_id is null then p_email else null end,
    trim(p_nombre), trim(p_telefono), p_email,
    p_tipo_entrega, p_direccion, p_departamento, p_municipio, p_referencia,
    p_metodo_pago, p_idempotency_key
  ) returning id, numero into v_pedido_id, v_numero;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_cant := coalesce((v_item->>'cantidad')::int, 1);
    if v_cant <= 0 then
      raise exception 'Cantidad inválida';
    end if;

    select id, nombre, precio, stock, talla, (imagenes[1]) as portada
      into v_prod
      from public.shop_productos
     where id = (v_item->>'producto_id')::uuid
       and activo = true
       for update;

    if not found then
      raise exception 'Producto no disponible: %', v_item->>'producto_id';
    end if;
    if v_prod.stock < v_cant then
      raise exception 'Sin stock suficiente para "%". Disponible: %', v_prod.nombre, v_prod.stock;
    end if;

    insert into public.shop_pedido_items (
      pedido_id, producto_id, nombre_producto,
      precio_unitario, cantidad, talla, imagen
    ) values (
      v_pedido_id, v_prod.id, v_prod.nombre,
      v_prod.precio, v_cant, v_prod.talla, v_prod.portada
    );

    v_subtotal := v_subtotal + (v_prod.precio * v_cant);

    update public.shop_productos set stock = stock - v_cant where id = v_prod.id;
  end loop;

  if p_cupon_codigo is not null and length(trim(p_cupon_codigo)) > 0 then
    select * into v_cupon
      from public.shop_cupones
     where upper(codigo) = upper(trim(p_cupon_codigo))
       and activo = true
       and (valido_desde is null or valido_desde <= now())
       and (valido_hasta is null or valido_hasta >= now())
       and (usos_maximos is null or usos_actuales < usos_maximos)
       and (cliente_id is null or cliente_id = v_cliente_id)
       and v_subtotal >= minimo_compra
     for update;

    if found then
      if v_cupon.tipo = 'porcentaje' then
        v_descuento := round(v_subtotal * v_cupon.valor / 100.0, 2);
      else
        v_descuento := least(v_cupon.valor, v_subtotal);
      end if;
      update public.shop_cupones set usos_actuales = usos_actuales + 1 where id = v_cupon.id;
    else
      p_cupon_codigo := null;
    end if;
  end if;

  v_envio := case p_tipo_entrega
               when 'casa'    then 3.00
               when 'agencia' then 2.50
               when 'retiro'  then 0.00
               else 3.00
             end;

  v_total := v_subtotal - v_descuento + v_envio;

  -- Autoriza este UPDATE puntual ante el trigger de protección de montos.
  perform set_config('shop.permitir_montos', 'on', true);

  update public.shop_pedidos
     set subtotal = v_subtotal,
         descuento = v_descuento,
         envio = v_envio,
         total = v_total,
         cupon_codigo = p_cupon_codigo
   where id = v_pedido_id;

  -- Se desactiva de inmediato: no queda activa para el resto de la transacción.
  perform set_config('shop.permitir_montos', 'off', true);

  return jsonb_build_object(
    'ok', true, 'pedido_id', v_pedido_id, 'numero', v_numero,
    'subtotal', v_subtotal, 'descuento', v_descuento,
    'envio', v_envio, 'total', v_total, 'repetido', false
  );
end;
$$;

revoke all on function public.shop_crear_pedido from public;
grant execute on function public.shop_crear_pedido to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Verificación
-- ---------------------------------------------------------------------------
select
  (select count(*) from pg_trigger where tgname = 'trg_shop_ped_montos') as trigger_montos,
  (select count(*) from pg_proc where proname = 'shop_crear_pedido') as rpc_ok;
