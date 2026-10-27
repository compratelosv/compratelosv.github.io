-- ============================================================================
-- COMPRATELOSV — Esquema de base de datos
-- Proyecto: hnpjkaiylibjnrqgfiku (org compratelosv)
-- Fecha: 2026-10-26
--
-- DISEÑO: ropa usada = piezas únicas (stock=1). Variantes opcionales.
-- SEGURIDAD: RLS activo en TODAS las tablas. Sin políticas = sin acceso.
-- REVERSIÓN: ver bloque REVERT al final (comentado).
--
-- PREFIJO: shop_ (el proyecto está vacío, pero se mantiene el prefijo
--          por si en el futuro convive con otras tablas).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. EXTENSIONES
-- ---------------------------------------------------------------------------
create extension if not exists "uuid-ossp" schema extensions;

-- ---------------------------------------------------------------------------
-- 1. CATEGORÍAS
-- ---------------------------------------------------------------------------
create table if not exists public.shop_categorias (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  nombre      text not null,
  descripcion text,
  orden       int  not null default 0,
  activa      boolean not null default true,
  creado_en   timestamptz not null default now()
);

comment on table public.shop_categorias is 'Categorías del catálogo (ropa, accesorios, skincare)';

-- ---------------------------------------------------------------------------
-- 2. PRODUCTOS  — una fila = una pieza vendible
-- ---------------------------------------------------------------------------
create table if not exists public.shop_productos (
  id            uuid primary key default gen_random_uuid(),
  sku           text unique,
  nombre        text not null,
  slug          text unique,
  descripcion   text,

  categoria_id  uuid not null references public.shop_categorias(id) on delete restrict,
  subtipo       text,                    -- Cincho, Cartera, Reloj, Sérum...
  marca         text,
  talla         text,                    -- 'M', 'Única', '30 ml'
  color         text,
  condicion     text not null default 'Como nuevo'
                check (condicion in (
                  'Nuevo con etiqueta',
                  'Nuevo sellado',
                  'Como nuevo',
                  'Usado - buen estado',
                  'Usado - con detalles'
                )),

  precio        numeric(10,2) not null check (precio >= 0),
  precio_antes  numeric(10,2) check (precio_antes is null or precio_antes >= precio),

  -- Ropa usada = 1. Skincare puede tener varias unidades.
  stock         int not null default 1 check (stock >= 0),

  -- Galería: array de rutas o URLs. La primera es la portada.
  imagenes      text[] not null default '{}',

  destacado     boolean not null default false,
  activo        boolean not null default true,   -- false = borrado lógico

  -- Solo skincare: trazabilidad sanitaria
  vence_en      date,

  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists idx_shop_prod_categoria on public.shop_productos(categoria_id) where activo;
create index if not exists idx_shop_prod_activo    on public.shop_productos(activo, creado_en desc);
create index if not exists idx_shop_prod_destacado on public.shop_productos(destacado) where activo and destacado;
create index if not exists idx_shop_prod_precio    on public.shop_productos(precio);
create index if not exists idx_shop_prod_talla     on public.shop_productos(talla) where activo;

comment on table public.shop_productos is 'Cada fila es una pieza concreta. stock=1 en ropa usada.';

-- Trigger: mantener actualizado_en
create or replace function public.shop_touch_updated()
returns trigger language plpgsql as $$
begin
  new.actualizado_en = now();
  return new;
end $$;

drop trigger if exists trg_shop_prod_touch on public.shop_productos;
create trigger trg_shop_prod_touch
  before update on public.shop_productos
  for each row execute function public.shop_touch_updated();

-- ---------------------------------------------------------------------------
-- 3. CLIENTES (perfil público — enlaza con auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.shop_clientes (
  id            uuid primary key references auth.users(id) on delete cascade,
  nombre        text,
  telefono      text,
  dui           text,                       -- opcional; dato sensible → no se expone
  codigo_ref    text unique,                -- código de referido (max 8 chars)
  referido_por  text,                       -- código de quien lo refirió
  creado_en     timestamptz not null default now()
);

comment on column public.shop_clientes.dui is 'Dato sensible. NUNCA exponer en API pública.';

-- ---------------------------------------------------------------------------
-- 4. DIRECCIONES DE ENTREGA
-- ---------------------------------------------------------------------------
create table if not exists public.shop_direcciones (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.shop_clientes(id) on delete cascade,
  etiqueta      text,                       -- 'Casa', 'Trabajo'
  nombre_recibe text not null,
  telefono      text not null,
  departamento  text not null,
  municipio     text not null,
  direccion     text not null,
  referencia    text,
  lat           numeric(9,6),
  lng           numeric(9,6),
  predeterminada boolean not null default false,
  creado_en     timestamptz not null default now()
);

create index if not exists idx_shop_dir_cliente on public.shop_direcciones(cliente_id);

-- ---------------------------------------------------------------------------
-- 5. CUPONES
-- ---------------------------------------------------------------------------
create table if not exists public.shop_cupones (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique,
  descripcion   text,
  tipo          text not null check (tipo in ('porcentaje','monto_fijo')),
  valor         numeric(10,2) not null check (valor > 0),
  minimo_compra numeric(10,2) not null default 0,
  usos_maximos  int,                        -- null = ilimitado
  usos_actuales int not null default 0,
  cliente_id    uuid references public.shop_clientes(id) on delete cascade, -- null = global
  valido_desde  timestamptz not null default now(),
  valido_hasta  timestamptz,
  activo        boolean not null default true,
  creado_en     timestamptz not null default now()
);

create index if not exists idx_shop_cup_cliente on public.shop_cupones(cliente_id);

-- ---------------------------------------------------------------------------
-- 6. PEDIDOS
-- ---------------------------------------------------------------------------
create table if not exists public.shop_pedidos (
  id              uuid primary key default gen_random_uuid(),
  numero          text unique,              -- ej. CLV-2026-0001
  estado          text not null default 'pendiente'
                  check (estado in (
                    'pendiente',      -- creado, sin pago
                    'pagado',
                    'en_preparacion',
                    'enviado',
                    'entregado',
                    'cancelado',
                    'reembolsado'
                  )),

  -- Cliente: registrado o invitado
  cliente_id      uuid references public.shop_clientes(id) on delete set null,
  invitado_email  text,

  -- Contacto y entrega (copiados al momento del pedido: histórico inmutable)
  nombre_contacto text not null,
  telefono        text not null,
  email           text,

  tipo_entrega    text not null default 'casa'
                  check (tipo_entrega in ('casa','agencia','retiro')),
  direccion       text,
  departamento    text,
  municipio       text,
  referencia      text,

  -- Montos
  subtotal        numeric(10,2) not null default 0 check (subtotal >= 0),
  descuento       numeric(10,2) not null default 0 check (descuento >= 0),
  envio           numeric(10,2) not null default 0 check (envio >= 0),
  total           numeric(10,2) not null default 0 check (total >= 0),
  cupon_codigo    text,

  -- Pago
  metodo_pago     text not null default 'contraentrega'
                  check (metodo_pago in ('tarjeta','transferencia','contraentrega')),
  estado_pago     text not null default 'pendiente'
                  check (estado_pago in ('pendiente','aprobado','rechazado','reembolsado')),

  -- Wompi (se llenan cuando se conecte la pasarela)
  wompi_id_transaccion text,
  wompi_enlace_id      text,

  -- Referencia idempotente para evitar pedidos duplicados por reintentos
  idempotency_key text unique,

  notas           text,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

create index if not exists idx_shop_ped_cliente on public.shop_pedidos(cliente_id);
create index if not exists idx_shop_ped_estado  on public.shop_pedidos(estado, creado_en desc);
create index if not exists idx_shop_ped_numero  on public.shop_pedidos(numero);

drop trigger if exists trg_shop_ped_touch on public.shop_pedidos;
create trigger trg_shop_ped_touch
  before update on public.shop_pedidos
  for each row execute function public.shop_touch_updated();

-- ---------------------------------------------------------------------------
-- 7. LÍNEAS DEL PEDIDO
-- ---------------------------------------------------------------------------
create table if not exists public.shop_pedido_items (
  id            uuid primary key default gen_random_uuid(),
  pedido_id     uuid not null references public.shop_pedidos(id) on delete cascade,
  producto_id   uuid references public.shop_productos(id) on delete set null,

  -- Snapshot histórico: aunque el producto cambie o se borre,
  -- el pedido conserva lo que el cliente compró.
  nombre_producto text not null,
  precio_unitario numeric(10,2) not null check (precio_unitario >= 0),
  cantidad        int not null default 1 check (cantidad > 0),
  talla           text,
  imagen          text,

  creado_en     timestamptz not null default now()
);

create index if not exists idx_shop_item_pedido on public.shop_pedido_items(pedido_id);
create index if not exists idx_shop_item_prod   on public.shop_pedido_items(producto_id);

-- ---------------------------------------------------------------------------
-- 8. NUMERACIÓN SECUENCIAL DE PEDIDOS
-- ---------------------------------------------------------------------------
create sequence if not exists public.shop_pedido_seq start 1;

create or replace function public.shop_generar_numero_pedido()
returns trigger language plpgsql as $$
begin
  if new.numero is null then
    new.numero := 'CLV-' || to_char(now(), 'YYYY') || '-' ||
                  lpad(nextval('public.shop_pedido_seq')::text, 4, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_shop_ped_numero on public.shop_pedidos;
create trigger trg_shop_ped_numero
  before insert on public.shop_pedidos
  for each row execute function public.shop_generar_numero_pedido();

-- ===========================================================================
-- 9. SEGURIDAD — RLS
-- ===========================================================================
alter table public.shop_categorias    enable row level security;
alter table public.shop_productos     enable row level security;
alter table public.shop_clientes      enable row level security;
alter table public.shop_direcciones   enable row level security;
alter table public.shop_cupones       enable row level security;
alter table public.shop_pedidos       enable row level security;
alter table public.shop_pedido_items  enable row level security;

-- --------------------------- CATEGORÍAS ---------------------------
drop policy if exists "categorias_lectura_publica" on public.shop_categorias;
create policy "categorias_lectura_publica"
  on public.shop_categorias for select
  to anon, authenticated
  using (activa = true);

-- --------------------------- PRODUCTOS ---------------------------
-- Público solo ve productos activos. No puede escribir nada.
drop policy if exists "productos_lectura_publica" on public.shop_productos;
create policy "productos_lectura_publica"
  on public.shop_productos for select
  to anon, authenticated
  using (activo = true);

-- --------------------------- CLIENTES ---------------------------
-- Cada usuario ve y edita solo su propio perfil.
drop policy if exists "clientes_propio_select" on public.shop_clientes;
create policy "clientes_propio_select"
  on public.shop_clientes for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "clientes_propio_insert" on public.shop_clientes;
create policy "clientes_propio_insert"
  on public.shop_clientes for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "clientes_propio_update" on public.shop_clientes;
create policy "clientes_propio_update"
  on public.shop_clientes for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- --------------------------- DIRECCIONES ---------------------------
drop policy if exists "direcciones_propias" on public.shop_direcciones;
create policy "direcciones_propias"
  on public.shop_direcciones for all
  to authenticated
  using (auth.uid() = cliente_id)
  with check (auth.uid() = cliente_id);

-- --------------------------- CUPONES ---------------------------
-- El cliente solo ve SUS cupones. Los globales (cliente_id null)
-- se validan por función RPC, no por lectura directa.
drop policy if exists "cupones_propios" on public.shop_cupones;
create policy "cupones_propios"
  on public.shop_cupones for select
  to authenticated
  using (cliente_id = auth.uid() and activo = true);

-- --------------------------- PEDIDOS ---------------------------
drop policy if exists "pedidos_propios_select" on public.shop_pedidos;
create policy "pedidos_propios_select"
  on public.shop_pedidos for select
  to authenticated
  using (cliente_id = auth.uid());

-- Invitados: se insertan vía función RPC SECURITY DEFINER,
-- no por INSERT directo (evita manipular totales).
drop policy if exists "pedidos_propios_insert" on public.shop_pedidos;
create policy "pedidos_propios_insert"
  on public.shop_pedidos for insert
  to authenticated
  with check (cliente_id = auth.uid() and estado = 'pendiente' and estado_pago = 'pendiente');

-- --------------------------- ITEMS ---------------------------
drop policy if exists "items_de_mis_pedidos" on public.shop_pedido_items;
create policy "items_de_mis_pedidos"
  on public.shop_pedido_items for select
  to authenticated
  using (exists (
    select 1 from public.shop_pedidos p
    where p.id = pedido_id and p.cliente_id = auth.uid()
  ));

-- ===========================================================================
-- 10. FUNCIONES RPC (SECURITY DEFINER)
-- ===========================================================================

-- 10.1 Crear pedido de forma atómica y segura.
--      Los PRECIOS se leen de la BD, nunca se confían del cliente.
--      Descuenta stock y falla si no hay disponibilidad.
create or replace function public.shop_crear_pedido(
  p_items           jsonb,              -- [{"producto_id":"uuid","cantidad":1}]
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
  v_existente   uuid;
begin
  -- Idempotencia: si ya existe un pedido con esa clave, devolverlo.
  if p_idempotency_key is not null then
    select id into v_existente from public.shop_pedidos
     where idempotency_key = p_idempotency_key;
    if v_existente is not null then
      return jsonb_build_object('ok', true, 'pedido_id', v_existente, 'repetido', true);
    end if;
  end if;

  -- Validaciones mínimas
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene items';
  end if;
  if p_nombre is null or length(trim(p_nombre)) < 2 then
    raise exception 'Nombre de contacto inválido';
  end if;
  if p_telefono is null or length(trim(p_telefono)) < 7 then
    raise exception 'Teléfono inválido';
  end if;

  -- Crear cabecera vacía
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

  -- Procesar items: precio y stock desde la BD
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_cant := coalesce((v_item->>'cantidad')::int, 1);
    if v_cant <= 0 then
      raise exception 'Cantidad inválida';
    end if;

    -- Bloqueo de fila: evita sobreventa concurrente
    select id, nombre, precio, stock, talla,
           (imagenes[1]) as portada
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

    -- Descontar stock
    update public.shop_productos
       set stock = stock - v_cant
     where id = v_prod.id;
  end loop;

  -- Cupón
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
      update public.shop_cupones
         set usos_actuales = usos_actuales + 1
       where id = v_cupon.id;
    else
      -- Cupón inválido: no se aplica, pero no se rompe el pedido.
      p_cupon_codigo := null;
    end if;
  end if;

  -- Envío según tipo de entrega
  v_envio := case p_tipo_entrega
               when 'casa'    then 3.00
               when 'agencia' then 2.50
               when 'retiro'  then 0.00
               else 3.00
             end;

  v_total := v_subtotal - v_descuento + v_envio;

  update public.shop_pedidos
     set subtotal = v_subtotal,
         descuento = v_descuento,
         envio = v_envio,
         total = v_total,
         cupon_codigo = p_cupon_codigo
   where id = v_pedido_id;

  return jsonb_build_object(
    'ok', true,
    'pedido_id', v_pedido_id,
    'numero', v_numero,
    'subtotal', v_subtotal,
    'descuento', v_descuento,
    'envio', v_envio,
    'total', v_total,
    'repetido', false
  );
end;
$$;

revoke all on function public.shop_crear_pedido from public;
grant execute on function public.shop_crear_pedido to anon, authenticated;

comment on function public.shop_crear_pedido is
  'Crea un pedido atómicamente. Precios y stock se leen de la BD, no del cliente. Idempotente por p_idempotency_key.';

-- ===========================================================================
-- 11. DATOS INICIALES — CATEGORÍAS
-- ===========================================================================
insert into public.shop_categorias (slug, nombre, descripcion, orden) values
  ('ropa',        'Ropa',        'Prendas seleccionadas, muchas únicas', 1),
  ('accesorios',  'Accesorios',  'Cinchos, carteras, relojes, gorras, lentes y más', 2),
  ('skincare',    'Skincare',    'Productos nuevos y sellados', 3)
on conflict (slug) do nothing;

-- ===========================================================================
-- FIN
-- ============================================================================

-- ===========================================================================
-- REVERT (solo si se necesita deshacer TODO — descomentar y ejecutar)
-- ⚠️ DESTRUCTIVO: borra datos de la tienda. Requiere autorización explícita.
-- ===========================================================================
-- drop function if exists public.shop_crear_pedido(jsonb,text,text,text,text,text,text,text,text,text,text,text);
-- drop function if exists public.shop_generar_numero_pedido() cascade;
-- drop function if exists public.shop_touch_updated() cascade;
-- drop table if exists public.shop_pedido_items cascade;
-- drop table if exists public.shop_pedidos cascade;
-- drop table if exists public.shop_cupones cascade;
-- drop table if exists public.shop_direcciones cascade;
-- drop table if exists public.shop_clientes cascade;
-- drop table if exists public.shop_productos cascade;
-- drop table if exists public.shop_categorias cascade;
-- drop sequence if exists public.shop_pedido_seq;
