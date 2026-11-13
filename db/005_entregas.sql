-- ============================================================================
-- COMPRATELOSV — 005: Gestión de entregas en punto
-- Fecha: 2026-11-12
--
-- REGLAS DEL NEGOCIO (validadas con el dueño):
--   · 2 puntos: Plaza Merliot y Metrocentro. Las entregas las hace una sola
--     persona, por lo que NO puede cubrir dos puntos en el mismo turno.
--   · Días hábiles: miércoles (3) y sábado (6).
--   · Turnos: mañana 09:00-12:00, tarde 14:00-17:00. Franjas de 30 min.
--   · Cupo: 1 cliente por franja (6 por turno, 12 por día).
--   · El punto del turno lo fija el PRIMER pedido que reserva ese turno.
--     Los siguientes solo pueden tomar franjas libres de ese mismo punto.
--   · Los dos turnos de un mismo día son SIEMPRE en puntos distintos.
--   · Anticipación mínima: 24 h antes del inicio de la franja.
--   · Confirmación: aviso a las 07:00, corte 07:35 (5 min de gracia).
--   · Solo se viaja al punto si al menos UN cliente confirmó ese turno.
--   · No confirma -> se reoferta. 24 h para elegir o pierde el turno.
--   · Tarjeta: 2 turnos. Efectivo/contraentrega: 1 turno.
--   · Agotados los turnos con tarjeta -> reembolso menos 20% (política
--     aceptada en el checkout, guardada con el pedido).
--
-- REVERSIÓN (ejecutar en orden inverso si hay que deshacer):
--   drop table if exists public.shop_mensajes cascade;
--   drop table if exists public.shop_entrega_eventos cascade;
--   drop table if exists public.shop_reembolsos cascade;
--   drop table if exists public.shop_entregas cascade;
--   drop table if exists public.shop_agenda_dia cascade;
--   drop table if exists public.shop_turnos cascade;
--   drop table if exists public.shop_puntos cascade;
--   drop function if exists public.shop_reservar_franja(uuid,date,text,time,uuid);
--   drop function if exists public.shop_disponibilidad(date,date);
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. PUNTOS DE ENTREGA
-- ---------------------------------------------------------------------------
create table if not exists public.shop_puntos (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  nombre      text not null,
  referencia  text,
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

insert into public.shop_puntos (slug, nombre, referencia) values
  ('merliot',     'Plaza Merliot',  'Santa Tecla'),
  ('metrocentro', 'Metrocentro',    'San Salvador')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 2. PLANTILLA SEMANAL DE TURNOS
-- ---------------------------------------------------------------------------
create table if not exists public.shop_turnos (
  id               uuid primary key default gen_random_uuid(),
  dia_semana       smallint not null check (dia_semana in (3, 6)),  -- 3=mié, 6=sáb
  turno            text not null check (turno in ('manana', 'tarde')),
  hora_inicio      time not null,
  hora_fin         time not null,
  duracion_franja  int not null default 30 check (duracion_franja > 0),
  cupo_por_franja  int not null default 1 check (cupo_por_franja > 0),
  anticipacion_horas int not null default 24 check (anticipacion_horas >= 0),
  activo           boolean not null default true,
  constraint shop_turnos_horas_ok check (hora_fin > hora_inicio),
  unique (dia_semana, turno)
);

insert into public.shop_turnos (dia_semana, turno, hora_inicio, hora_fin) values
  (3, 'manana', '09:00', '12:00'),
  (3, 'tarde',  '14:00', '17:00'),
  (6, 'manana', '09:00', '12:00'),
  (6, 'tarde',  '14:00', '17:00')
on conflict (dia_semana, turno) do nothing;

-- ---------------------------------------------------------------------------
-- 3. AGENDA DEL DÍA (quién fija el punto de cada turno)
-- ---------------------------------------------------------------------------
create table if not exists public.shop_agenda_dia (
  id            uuid primary key default gen_random_uuid(),
  fecha         date not null,
  turno         text not null check (turno in ('manana', 'tarde')),
  punto_id      uuid references public.shop_puntos(id),
  estado        text not null default 'abierto'
                check (estado in ('abierto', 'fijado', 'cerrado_manual')),
  motivo_cierre text,
  fijado_por_pedido uuid,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (fecha, turno)
);

-- Dos turnos del mismo día nunca en el mismo punto.
create or replace function public.shop_validar_alternancia()
returns trigger
language plpgsql
as $$
declare
  v_otro_punto uuid;
begin
  if new.punto_id is null then
    return new;
  end if;

  select punto_id into v_otro_punto
    from public.shop_agenda_dia
   where fecha = new.fecha
     and turno <> new.turno
     and punto_id is not null
   limit 1;

  if v_otro_punto is not null and v_otro_punto = new.punto_id then
    raise exception 'Los dos turnos del % deben ser en puntos distintos (ya está fijado otro turno en ese punto)', new.fecha
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_shop_agenda_alternancia on public.shop_agenda_dia;
create trigger trg_shop_agenda_alternancia
  before insert or update of punto_id on public.shop_agenda_dia
  for each row execute function public.shop_validar_alternancia();

-- ---------------------------------------------------------------------------
-- 4. ENTREGAS
-- ---------------------------------------------------------------------------
create table if not exists public.shop_entregas (
  id              uuid primary key default gen_random_uuid(),
  pedido_id       uuid not null references public.shop_pedidos(id) on delete cascade,
  fecha           date not null,
  turno           text not null check (turno in ('manana', 'tarde')),
  punto_id        uuid not null references public.shop_puntos(id),
  franja_inicio   time not null,

  estado          text not null default 'programada'
                  check (estado in (
                    'programada',    -- reservada, esperando el día
                    'confirmada',    -- el cliente confirmó que irá
                    'no_confirmada', -- pasó el corte de 07:35 sin responder
                    'reagendada',    -- se le abrió nueva oferta
                    'entregada',
                    'cancelada'      -- agotó turnos o el admin la canceló
                  )),

  intentos_usados int not null default 0 check (intentos_usados between 0 and 2),
  max_intentos    int not null default 2 check (max_intentos between 1 and 2),

  confirmado_en   timestamptz,
  corte_en        timestamptz,   -- 07:35 del día de entrega
  oferta_expira_en timestamptz,  -- +24 h desde la reoferta
  entrega_padre_id uuid references public.shop_entregas(id),

  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),

  -- Una sola entrega por franja: esto es el cupo real, garantizado por la BD.
  constraint shop_entregas_franja_unica unique (fecha, turno, punto_id, franja_inicio)
);

create index if not exists idx_shop_entregas_fecha on public.shop_entregas(fecha, turno);
create index if not exists idx_shop_entregas_estado on public.shop_entregas(estado, fecha);
create index if not exists idx_shop_entregas_pedido on public.shop_entregas(pedido_id);

-- ---------------------------------------------------------------------------
-- 5. AUDITORÍA DE CADA CAMBIO DE ESTADO
-- ---------------------------------------------------------------------------
create table if not exists public.shop_entrega_eventos (
  id          bigserial primary key,
  entrega_id  uuid not null references public.shop_entregas(id) on delete cascade,
  estado_antes text,
  estado_nuevo text not null,
  origen      text not null check (origen in ('cliente', 'sistema', 'admin')),
  nota        text,
  actor_id    uuid,
  creado_en   timestamptz not null default now()
);

create index if not exists idx_shop_eventos_entrega on public.shop_entrega_eventos(entrega_id, creado_en);

-- ---------------------------------------------------------------------------
-- 6. BANDEJA DE MENSAJES DEL CLIENTE (fase 1, sin WhatsApp)
-- ---------------------------------------------------------------------------
create table if not exists public.shop_mensajes (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid references public.shop_clientes(id) on delete cascade,
  pedido_id   uuid references public.shop_pedidos(id) on delete cascade,
  entrega_id  uuid references public.shop_entregas(id) on delete cascade,
  tipo        text not null check (tipo in (
                'confirmacion_entrega',  -- 07:00 del día
                'disculpa_no_show',      -- no confirmó
                'recordatorio',          -- 24 h para elegir
                'turno_cancelado',       -- el admin no puede cubrir
                'reembolso'
              )),
  titulo      text not null,
  cuerpo      text not null,
  acciones    jsonb not null default '[]'::jsonb,  -- [{label, tipo, payload}]
  leido       boolean not null default false,
  expira_en   timestamptz,
  creado_en   timestamptz not null default now()
);

create index if not exists idx_shop_msj_cliente on public.shop_mensajes(cliente_id, leido);

-- ---------------------------------------------------------------------------
-- 7. REEMBOLSOS PARCIALES (20% por costos operativos)
-- ---------------------------------------------------------------------------
create table if not exists public.shop_reembolsos (
  id                  uuid primary key default gen_random_uuid(),
  pedido_id           uuid not null references public.shop_pedidos(id) on delete cascade,
  monto_pagado        numeric(10,2) not null check (monto_pagado >= 0),
  comision_porcentaje numeric(5,2) not null default 20.00,
  monto_comision      numeric(10,2) not null check (monto_comision >= 0),
  monto_devuelto      numeric(10,2) not null check (monto_devuelto >= 0),
  estado              text not null default 'pendiente'
                      check (estado in ('pendiente', 'transferido', 'anulado')),
  referencia_deposito text,
  motivo              text,
  creado_en           timestamptz not null default now(),
  resuelto_en         timestamptz
);

-- ---------------------------------------------------------------------------
-- 8. DISPONIBILIDAD: franjas libres con el punto permitido
-- ---------------------------------------------------------------------------
create or replace function public.shop_disponibilidad(p_desde date, p_hasta date)
returns table (
  fecha date,
  turno text,
  punto_id uuid,
  punto_nombre text,
  franja_inicio time,
  franja_fin time
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r            record;
  v_fecha      date;
  v_punto_fijado uuid;
  v_punto_alt  uuid;
  v_puntos     uuid[];
  v_punto_act  uuid;
  v_punto_nom  text;
  v_franja     time;
  v_fin        time;
  v_ocupadas   int;
  v_ahora      timestamp;
begin
  v_ahora := now() at time zone 'America/El_Salvador';

  for r in
    select t.* from public.shop_turnos t
     where t.activo
     order by t.dia_semana, t.hora_inicio
  loop
    for v_fecha in
      select d::date
        from generate_series(p_desde::timestamp, p_hasta::timestamp, interval '1 day') d
       where extract(isodow from d) = r.dia_semana
    loop
      -- turno cerrado a mano por el administrador
      if exists (
        select 1 from public.shop_agenda_dia a
         where a.fecha = v_fecha and a.turno = r.turno
           and a.estado = 'cerrado_manual'
      ) then
        continue;
      end if;

      select a.punto_id into v_punto_fijado
        from public.shop_agenda_dia a
       where a.fecha = v_fecha and a.turno = r.turno;

      select a.punto_id into v_punto_alt
        from public.shop_agenda_dia a
       where a.fecha = v_fecha and a.turno <> r.turno and a.punto_id is not null
       limit 1;

      if v_punto_fijado is not null then
        v_puntos := array[v_punto_fijado];
      elsif v_punto_alt is not null then
        -- el otro turno ya fijó punto: este turno solo puede ser el contrario
        select array_agg(p.id) into v_puntos
          from public.shop_puntos p
         where p.activo and p.id <> v_punto_alt;
      else
        select array_agg(p.id) into v_puntos
          from public.shop_puntos p where p.activo;
      end if;

      if v_puntos is null then
        continue;
      end if;

      foreach v_punto_act in array v_puntos loop
        select p.nombre into v_punto_nom
          from public.shop_puntos p where p.id = v_punto_act;

        v_franja := r.hora_inicio;
        while v_franja < r.hora_fin loop
          v_fin := v_franja + make_interval(mins => r.duracion_franja);

          if (v_fecha + v_franja) - v_ahora >= make_interval(hours => r.anticipacion_horas) then
            select count(*) into v_ocupadas
              from public.shop_entregas e
             where e.fecha = v_fecha
               and e.turno = r.turno
               and e.punto_id = v_punto_act
               and e.franja_inicio = v_franja
               and e.estado <> 'cancelada';

            if v_ocupadas < r.cupo_por_franja then
              fecha         := v_fecha;
              turno         := r.turno;
              punto_id      := v_punto_act;
              punto_nombre  := v_punto_nom;
              franja_inicio := v_franja;
              franja_fin    := v_fin;
              return next;
            end if;
          end if;

          v_franja := v_fin;
        end loop;
      end loop;
    end loop;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. RESERVA ATÓMICA (evita doble reserva y fija el punto del turno)
-- ---------------------------------------------------------------------------
create or replace function public.shop_reservar_franja(
  p_pedido_id uuid,
  p_fecha date,
  p_turno text,
  p_franja time,
  p_punto_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entrega_id uuid;
  v_dia smallint;
  v_meta int;
  v_total numeric(10,2);
  v_metodo text;
  v_anticipacion int;
  v_duracion int;
  v_existe uuid;
begin
  v_dia := extract(isodow from p_fecha);
  if v_dia not in (3, 6) then
    raise exception 'Solo hay entregas miércoles y sábado' using errcode = 'check_violation';
  end if;

  select anticipacion_horas, duracion_franja into v_anticipacion, v_duracion
    from public.shop_turnos
   where dia_semana = v_dia and turno = p_turno and activo;

  if v_anticipacion is null then
    raise exception 'Ese turno no está disponible' using errcode = 'check_violation';
  end if;

  if (p_fecha + p_franja) - (now() at time zone 'America/El_Salvador')
     < make_interval(hours => v_anticipacion) then
    raise exception 'Faltan menos de % h para esa franja', v_anticipacion
      using errcode = 'check_violation';
  end if;

  -- bloquea la fila de agenda del turno para serializar reservas concurrentes
  insert into public.shop_agenda_dia (fecha, turno, estado)
  values (p_fecha, p_turno, 'abierto')
  on conflict (fecha, turno) do nothing;

  select id into v_existe
    from public.shop_agenda_dia
   where fecha = p_fecha and turno = p_turno and estado = 'cerrado_manual';
  if v_existe is not null then
    raise exception 'El turno está cerrado por el administrador' using errcode = 'check_violation';
  end if;

  perform 1 from public.shop_agenda_dia
   where fecha = p_fecha and turno = p_turno
   for update;

  -- el primero que reserva fija el punto del turno
  update public.shop_agenda_dia
     set punto_id = coalesce(punto_id, p_punto_id),
         estado   = 'fijado',
         fijado_por_pedido = coalesce(fijado_por_pedido, p_pedido_id),
         actualizado_en = now()
   where fecha = p_fecha and turno = p_turno;

  -- si ya estaba fijado en otro punto, se rechaza
  perform 1 from public.shop_agenda_dia
   where fecha = p_fecha and turno = p_turno and punto_id <> p_punto_id;
  if found then
    raise exception 'Ese turno ya está asignado a otro punto' using errcode = 'check_violation';
  end if;

  select metodo_pago, total into v_metodo, v_total
    from public.shop_pedidos where id = p_pedido_id;
  if v_metodo is null then
    raise exception 'Pedido inexistente' using errcode = 'no_data_found';
  end if;

  -- tarjeta: 2 turnos. efectivo/contraentrega/transferencia: 1.
  v_meta := case when v_metodo = 'tarjeta' then 2 else 1 end;

  insert into public.shop_entregas (
    pedido_id, fecha, turno, punto_id, franja_inicio,
    max_intentos, corte_en
  ) values (
    p_pedido_id, p_fecha, p_turno, p_punto_id, p_franja,
    v_meta,
    (p_fecha + '07:35'::time) at time zone 'America/El_Salvador'
  )
  returning id into v_entrega_id;

  insert into public.shop_entrega_eventos (entrega_id, estado_nuevo, origen, nota)
  values (v_entrega_id, 'programada', 'cliente',
          format('Reserva %s %s en %s', p_fecha, p_turno, p_franja));

  return v_entrega_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. RLS
-- ---------------------------------------------------------------------------
alter table public.shop_puntos          enable row level security;
alter table public.shop_turnos          enable row level security;
alter table public.shop_agenda_dia      enable row level security;
alter table public.shop_entregas        enable row level security;
alter table public.shop_entrega_eventos enable row level security;
alter table public.shop_mensajes        enable row level security;
alter table public.shop_reembolsos      enable row level security;

-- Catálogo de puntos y turnos: lectura pública (los necesita el checkout).
drop policy if exists p_puntos_lectura on public.shop_puntos;
create policy p_puntos_lectura on public.shop_puntos
  for select to anon, authenticated using (activo);

drop policy if exists p_turnos_lectura on public.shop_turnos;
create policy p_turnos_lectura on public.shop_turnos
  for select to anon, authenticated using (activo);

-- Entregas: el cliente ve solo las de sus pedidos.
drop policy if exists p_entregas_propias on public.shop_entregas;
create policy p_entregas_propias on public.shop_entregas
  for select to authenticated
  using (exists (
    select 1 from public.shop_pedidos p
     where p.id = shop_entregas.pedido_id and p.cliente_id = auth.uid()
  ));

-- Mensajes: solo el dueño.
drop policy if exists p_mensajes_propios on public.shop_mensajes;
create policy p_mensajes_propios on public.shop_mensajes
  for select to authenticated using (cliente_id = auth.uid());

-- Agenda, eventos y reembolsos: sin política para anon/authenticated.
-- Se escriben y leen por service_role desde Edge Functions y el panel admin.

-- ---------------------------------------------------------------------------
-- 11. VERIFICACIÓN (ejecutar aparte, con datos reales)
-- ---------------------------------------------------------------------------
-- select * from public.shop_disponibilidad(current_date, current_date + 14);
-- select count(*) from public.shop_entregas where fecha >= current_date;
