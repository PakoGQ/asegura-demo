-- ============================================================================
-- 03_citas.sql — Citas, reseñas y postulaciones
--
-- Traducción de `citas`, `resenas` y `resenas_clientes` de Doncellas, más la
-- tabla que respalda el formulario de afiliación de membresias.html.
--
-- ⚠️ `citas` contiene datos de contacto de gente que no tiene cuenta. El
-- público puede INSERTAR pero jamás LEER (ver 05_rls.sql). Una policy pública
-- de SELECT aquí publica el teléfono de cada cliente que agendó.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- citas — la cita de asesoría. En Doncellas cuesta y tiene tarifa; aquí es
-- gratuita: lo que se agenda es una asesoría, y el cierre pasa por el agente.
-- ---------------------------------------------------------------------------
create table if not exists public.citas (
  id               uuid primary key default gen_random_uuid(),
  agente_id        uuid not null references public.agentes (id) on delete cascade,

  cliente_nombre   text not null,
  cliente_whatsapp text,
  cliente_email    text,

  modalidad        text not null default 'oficina' check (modalidad in (
                     'oficina', 'domicilio', 'videollamada', 'cafe')),
  lugar            text,
  fecha            date not null,
  hora             time not null,
  duracion_min     int not null default 45,
  ramo_interes     text check (ramo_interes in (
                     'auto', 'vida', 'gastos_medicos', 'hogar',
                     'empresarial', 'educativo', 'fianzas')),
  mensaje          text,                                -- lo que escribió el cliente

  estado           text not null default 'pendiente' check (estado in (
                     'pendiente', 'confirmada', 'cancelada', 'completada', 'no_asistio')),
  notas            text,                                -- privadas del agente
  origen           text not null default 'web' check (origen in (
                     'web', 'whatsapp', 'telefono', 'referido')),

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists citas_agente_fecha_idx on public.citas (agente_id, fecha desc);
create index if not exists citas_estado_idx on public.citas (estado)
  where estado in ('pendiente', 'confirmada');

drop trigger if exists citas_updated_at on public.citas;
create trigger citas_updated_at
  before update on public.citas
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- resenas — públicas, del cliente hacia el agente.
-- Igual que Doncellas: entran con `aprobada = false` y el Director las publica.
-- ---------------------------------------------------------------------------
create table if not exists public.resenas (
  id           uuid primary key default gen_random_uuid(),
  agente_id    uuid not null references public.agentes (id) on delete cascade,
  cita_id      uuid references public.citas (id) on delete set null,
  canal        text not null default 'web' check (canal in ('web', 'whatsapp', 'telefono')),
  autor        text not null default 'Anónimo',
  calificacion int not null check (calificacion between 1 and 5),
  texto        text,
  aprobada     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Se vuelve a fijar siempre: `create table if not exists` no toca una tabla que
-- ya existe, y este default lleva acento. Ver la nota en 02_agentes.sql.
alter table public.resenas
  alter column autor set default 'Anónimo';

-- La moderación necesita tres estados, no dos. Con solo `aprobada` una reseña
-- rechazada se queda en false y vuelve a aparecer en la cola para siempre, y el
-- Director no puede borrarla: solo tiene `grant update` sobre esta tabla, a
-- propósito, para que no pueda desaparecer la opinión de un cliente.
-- La cola de pendientes es `not aprobada and not rechazada`.
alter table public.resenas
  add column if not exists rechazada boolean not null default false;

-- El índice de pendientes tiene que mirar las dos columnas o sigue arrastrando
-- las rechazadas.
drop index if exists resenas_pendientes_idx;

create index if not exists resenas_agente_idx on public.resenas (agente_id)
  where aprobada;
create index if not exists resenas_pendientes_idx on public.resenas (created_at desc)
  where not aprobada and not rechazada;

-- ---------------------------------------------------------------------------
-- resenas_clientes — privadas, del agente hacia el cliente.
--
-- En Doncellas sirve para avisarse de clientes problemáticos antes de aceptar
-- una cita. Aquí igual: cliente que no llega, que da datos falsos, o que ya
-- está siendo atendido por otro agente del equipo.
--
-- NUNCA se expone al público. No hay policy de lectura anónima.
-- ---------------------------------------------------------------------------
create table if not exists public.resenas_clientes (
  id               uuid primary key default gen_random_uuid(),
  agente_id        uuid not null references public.agentes (id) on delete cascade,
  cita_id          uuid references public.citas (id) on delete set null,
  cliente_whatsapp text,                                -- la llave para cruzarlo
  tipo             text not null check (tipo in ('bueno', 'neutral', 'cuidado')),
  tags             text[] not null default '{}',
  notas            text,
  created_at       timestamptz not null default now()
);

create index if not exists resenas_clientes_wa_idx
  on public.resenas_clientes (cliente_whatsapp);

-- ---------------------------------------------------------------------------
-- postulaciones — el formulario de unete.html (ex membresias.html)
-- ---------------------------------------------------------------------------
create table if not exists public.postulaciones (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  whatsapp     text not null,
  email        text,
  ciudad       text,
  cedula       text,
  experiencia  text,
  ramos        text[] not null default '{}',
  mensaje      text,
  estado       text not null default 'nueva' check (estado in (
                 'nueva', 'contactado', 'aceptado', 'rechazado')),
  created_at   timestamptz not null default now()
);

create index if not exists postulaciones_estado_idx on public.postulaciones (estado, created_at desc);
