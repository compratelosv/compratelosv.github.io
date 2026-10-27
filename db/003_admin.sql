-- ============================================================================
-- COMPRATELOSV — 003 · Administración
-- ============================================================================
-- Objetivo: que la dueña (Cindy) pueda cargar productos, marcar vendidos y
-- gestionar pedidos SIN tocar código y SIN poder ver datos que no le tocan.
--
-- DISEÑO DE SEGURIDAD
--   · No hay contraseña en el frontend. El acceso se valida con Supabase Auth.
--   · Los permisos NO los da un checkbox en el navegador: los da RLS.
--   · Solo los correos listados en shop_admins obtienen escritura.
--   · Un usuario autenticado que NO esté en shop_admins no puede escribir nada.
--
-- IDEMPOTENTE: se puede ejecutar varias veces sin efectos secundarios.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. LISTA DE ADMINISTRADORES (por correo)
-- ---------------------------------------------------------------------------
-- Se usa el correo del JWT porque permite autorizar ANTES de que el usuario
-- exista en auth.users, sin manejar contraseñas desde aquí.
create table if not exists public.shop_admins (
  email     text primary key,
  nombre    text,
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);

comment on table public.shop_admins is
  'Correos con permiso de administración. Solo el owner de la BD puede modificarla.';

alter table public.shop_admins enable row level security;

-- Nadie puede leer ni escribir esta tabla desde el cliente.
-- (Sin políticas = sin acceso. Se gestiona desde el dashboard de Supabase.)
revoke all on public.shop_admins from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. FUNCIÓN AUXILIAR: ¿el usuario actual es admin?
-- ---------------------------------------------------------------------------
create or replace function public.shop_es_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.shop_admins a
     where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       and a.activo = true
  );
$$;

comment on function public.shop_es_admin() is
  'true solo si el correo del JWT está en shop_admins y está activo.';

revoke all on function public.shop_es_admin() from public;
grant execute on function public.shop_es_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. POLÍTICAS DE ESCRITURA PARA ADMIN
-- ---------------------------------------------------------------------------

-- ---------- PRODUCTOS ----------
drop policy if exists "productos_admin_insert" on public.shop_productos;
create policy "productos_admin_insert"
  on public.shop_productos for insert
  to authenticated
  with check (public.shop_es_admin());

drop policy if exists "productos_admin_update" on public.shop_productos;
create policy "productos_admin_update"
  on public.shop_productos for update
  to authenticated
  using (public.shop_es_admin())
  with check (public.shop_es_admin());

drop policy if exists "productos_admin_delete" on public.shop_productos;
create policy "productos_admin_delete"
  on public.shop_productos for delete
  to authenticated
  using (public.shop_es_admin());

-- El admin debe poder ver TAMBIÉN los inactivos (borrado lógico).
drop policy if exists "productos_admin_select_todos" on public.shop_productos;
create policy "productos_admin_select_todos"
  on public.shop_productos for select
  to authenticated
  using (public.shop_es_admin());

-- ---------- CATEGORÍAS ----------
drop policy if exists "categorias_admin_all" on public.shop_categorias;
create policy "categorias_admin_all"
  on public.shop_categorias for all
  to authenticated
  using (public.shop_es_admin())
  with check (public.shop_es_admin());

-- ---------- CUPONES ----------
drop policy if exists "cupones_admin_all" on public.shop_cupones;
create policy "cupones_admin_all"
  on public.shop_cupones for all
  to authenticated
  using (public.shop_es_admin())
  with check (public.shop_es_admin());

-- ---------- PEDIDOS ----------
-- El admin ve TODOS los pedidos (no solo los suyos).
drop policy if exists "pedidos_admin_select" on public.shop_pedidos;
create policy "pedidos_admin_select"
  on public.shop_pedidos for select
  to authenticated
  using (public.shop_es_admin());

-- Puede cambiar estado y estado_pago, pero NO el total
-- (el total lo calculó la RPC; un trigger lo protege más abajo).
drop policy if exists "pedidos_admin_update" on public.shop_pedidos;
create policy "pedidos_admin_update"
  on public.shop_pedidos for update
  to authenticated
  using (public.shop_es_admin())
  with check (public.shop_es_admin());

-- ---------- ITEMS DE PEDIDO ----------
drop policy if exists "items_admin_select" on public.shop_pedido_items;
create policy "items_admin_select"
  on public.shop_pedido_items for select
  to authenticated
  using (public.shop_es_admin());

-- ---------- CLIENTES (solo lectura para soporte) ----------
drop policy if exists "clientes_admin_select" on public.shop_clientes;
create policy "clientes_admin_select"
  on public.shop_clientes for select
  to authenticated
  using (public.shop_es_admin());

-- ---------------------------------------------------------------------------
-- 4. PROTECCIÓN DE MONTOS
-- ---------------------------------------------------------------------------
-- Aunque el admin tenga UPDATE sobre shop_pedidos, no debe poder alterar
-- los montos ya calculados: eso descuadraría la contabilidad.
create or replace function public.shop_proteger_montos_pedido()
returns trigger
language plpgsql
as $$
begin
  if new.subtotal is distinct from old.subtotal
     or new.total is distinct from old.total
     or new.descuento is distinct from old.descuento
     or new.envio is distinct from old.envio then
    raise exception 'Los montos del pedido no se pueden modificar';
  end if;
  return new;
end $$;

drop trigger if exists trg_shop_ped_montos on public.shop_pedidos;
create trigger trg_shop_ped_montos
  before update on public.shop_pedidos
  for each row execute function public.shop_proteger_montos_pedido();

-- ---------------------------------------------------------------------------
-- 5. RPC: MARCAR VENDIDO / DISPONIBLE (un clic)
-- ---------------------------------------------------------------------------
create or replace function public.shop_marcar_vendido(
  p_producto_id uuid,
  p_vendido     boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
begin
  if not public.shop_es_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  update public.shop_productos
     set stock = case when p_vendido then 0 else 1 end,
         actualizado_en = now()
   where id = p_producto_id
   returning id, nombre, stock into v_row;

  if not found then
    raise exception 'Producto no encontrado';
  end if;

  return jsonb_build_object(
    'ok', true,
    'producto_id', v_row.id,
    'nombre', v_row.nombre,
    'stock', v_row.stock,
    'vendido', v_row.stock = 0
  );
end $$;

revoke all on function public.shop_marcar_vendido(uuid, boolean) from public;
grant execute on function public.shop_marcar_vendido(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC: CAMBIAR ESTADO DE PEDIDO (validado, sin tocar montos)
-- ---------------------------------------------------------------------------
create or replace function public.shop_cambiar_estado_pedido(
  p_pedido_id   uuid,
  p_estado      text,
  p_estado_pago text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
begin
  if not public.shop_es_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if p_estado not in ('pendiente','pagado','en_preparacion','enviado','entregado','cancelado','reembolsado') then
    raise exception 'Estado inválido: %', p_estado;
  end if;

  if p_estado_pago is not null
     and p_estado_pago not in ('pendiente','aprobado','rechazado','reembolsado') then
    raise exception 'Estado de pago inválido: %', p_estado_pago;
  end if;

  update public.shop_pedidos
     set estado = p_estado,
         estado_pago = coalesce(p_estado_pago, estado_pago),
         actualizado_en = now()
   where id = p_pedido_id
   returning id, numero, estado, estado_pago into v_row;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  return jsonb_build_object(
    'ok', true,
    'numero', v_row.numero,
    'estado', v_row.estado,
    'estado_pago', v_row.estado_pago
  );
end $$;

revoke all on function public.shop_cambiar_estado_pedido(uuid, text, text) from public;
grant execute on function public.shop_cambiar_estado_pedido(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. STORAGE: bucket público de fotos de producto
-- ---------------------------------------------------------------------------
-- Lectura pública (las fotos las ve cualquier visitante del catálogo),
-- escritura SOLO para administradores autenticados.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'productos', 'productos', true, 5242880,
  array['image/jpeg','image/png','image/webp','image/avif','image/svg+xml']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','image/avif','image/svg+xml'];

drop policy if exists "fotos_productos_lectura" on storage.objects;
create policy "fotos_productos_lectura"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'productos');

drop policy if exists "fotos_productos_admin_insert" on storage.objects;
create policy "fotos_productos_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'productos' and public.shop_es_admin());

drop policy if exists "fotos_productos_admin_update" on storage.objects;
create policy "fotos_productos_admin_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'productos' and public.shop_es_admin())
  with check (bucket_id = 'productos' and public.shop_es_admin());

drop policy if exists "fotos_productos_admin_delete" on storage.objects;
create policy "fotos_productos_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'productos' and public.shop_es_admin());

-- ---------------------------------------------------------------------------
-- 8. ALTA DEL PRIMER ADMINISTRADOR
-- ---------------------------------------------------------------------------
-- ⚠️ Ajustar el correo si la cuenta de Cindy es distinta.
insert into public.shop_admins (email, nombre)
values ('fractalconstructora.sv@gmail.com', 'Administrador')
on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- 9. VERIFICACIÓN
-- ---------------------------------------------------------------------------
select
  (select count(*) from public.shop_admins) as admins,
  (select count(*) from pg_policies
    where schemaname='public' and tablename like 'shop_%') as politicas_shop,
  (select count(*) from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname like 'fotos_productos%') as politicas_storage,
  (select exists(select 1 from storage.buckets where id='productos')) as bucket_ok;

-- ============================================================================
-- REVERT (descomentar solo si se necesita deshacer — DESTRUCTIVO)
-- ============================================================================
-- drop trigger if exists trg_shop_ped_montos on public.shop_pedidos;
-- drop function if exists public.shop_proteger_montos_pedido() cascade;
-- drop function if exists public.shop_marcar_vendido(uuid, boolean) cascade;
-- drop function if exists public.shop_cambiar_estado_pedido(uuid, text, text) cascade;
-- drop function if exists public.shop_es_admin() cascade;
-- drop table if exists public.shop_admins cascade;
-- delete from storage.buckets where id = 'productos';
