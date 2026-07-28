-- ============================================================================
-- 02_agentes.sql — Perfil público del agente
--
-- Traducción de las tablas `escorts`, `fotos`, `servicios` y `disponibilidad`
-- del schema.sql de Doncellas.
--
-- Lo que NO se porta (ver CLAUDE.md §5): medidas corporales, edad, tarifa por
-- hora, categorías del rubro. Se sustituyen por cédula, años de experiencia,
-- ramos y certificaciones.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- agentes (ex `escorts`) — la ficha que ve el público
-- ---------------------------------------------------------------------------
create table if not exists public.agentes (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,               -- URL amigable
  usuario_id        uuid unique references public.usuarios (id) on delete cascade,
  director_id       uuid references public.usuarios (id) on delete set null,

  nombre            text not null,
  foto_url          text,
  cedula            text,                               -- cédula CNSF A1/A2
  aseguradoras      text[] not null default array['GNP'],  -- [GNP]
  anios_experiencia int check (anios_experiencia >= 0),
  titulo            text,                               -- "Agente certificado en GMM"
  descripcion       text,

  -- Ubicación. `lat`/`lng` alimentan el orden "más cercano" (CLAUDE.md §12);
  -- Doncellas solo tiene zona en texto.
  ciudad            text not null default 'Guadalajara',
  zona              text,
  direccion_oficina text,
  lat               numeric(9,6),
  lng               numeric(9,6),
  cobertura_km      int default 15,                     -- hasta dónde se mueve

  whatsapp          text,
  telefono          text,
  email             text,
  idiomas           text[] not null default array['Español'],
  modalidades       text[] not null default array['oficina','videollamada'],

  -- Estado. `hidden` y `suspended` son la decisión de Doncellas: ocultar saca
  -- del sitio público pero deja operar; suspender saca de todo y se registra
  -- para saber qué cobrar de afiliación.
  disponible        boolean not null default false,
  verificado        boolean not null default false,     -- cédula validada
  activo            boolean not null default true,
  hidden            boolean not null default false,
  suspended         boolean not null default false,
  suspended_from    date,
  susp_history      jsonb not null default '[]'::jsonb,

  plan              text not null default 'beta',
  calificacion      numeric(3,2) not null default 5.00
                      check (calificacion between 0 and 5),
  num_resenas       int not null default 0,
  num_citas         int not null default 0,
  num_clientes      int not null default 0,
  es_nuevo          boolean not null default false,
  es_destacado      boolean not null default false,
  top10             boolean not null default false,
  tags              text[] not null default '{}',

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- `create table if not exists` se salta la tabla entera si ya existe, así que
-- un cambio a un default NO se aplicaría al re-correr el archivo. Este alter lo
-- vuelve a fijar siempre. Va aquí porque el default trae acento y un archivo
-- mal codificado lo deja como 'Espa√±ol' sin que nada falle.
alter table public.agentes
  alter column idiomas set default array['Español'];

create index if not exists agentes_slug_idx      on public.agentes (slug);
create index if not exists agentes_director_idx  on public.agentes (director_id);
create index if not exists agentes_zona_idx      on public.agentes (ciudad, zona);
-- El directorio público siempre filtra por este trío: índice parcial.
create index if not exists agentes_publicos_idx
  on public.agentes (calificacion desc)
  where activo and not hidden and not suspended;

drop trigger if exists agentes_updated_at on public.agentes;
create trigger agentes_updated_at
  before update on public.agentes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- fotos — galería del perfil. Igual que Doncellas, sin watermark.
-- ---------------------------------------------------------------------------
create table if not exists public.fotos (
  id         uuid primary key default gen_random_uuid(),
  agente_id  uuid not null references public.agentes (id) on delete cascade,
  url        text not null,
  tipo       text not null default 'foto' check (tipo in ('foto', 'video')),
  -- `perfil` sale en doncellas.mx; `redes` es material casual para publicar.
  -- Misma división que las pestañas de "Mi Contenido" en el panel-modelo.
  destino    text not null default 'perfil' check (destino in ('perfil', 'redes')),
  titulo     text,
  orden      int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists fotos_agente_idx on public.fotos (agente_id, orden);

-- ---------------------------------------------------------------------------
-- ramos_agente (ex `servicios`) — qué vende cada agente
-- ---------------------------------------------------------------------------
create table if not exists public.ramos_agente (
  id              uuid primary key default gen_random_uuid(),
  agente_id       uuid not null references public.agentes (id) on delete cascade,
  ramo            text not null check (ramo in (
                    'auto', 'vida', 'gastos_medicos', 'hogar',
                    'empresarial', 'educativo', 'fianzas')),
  es_especialidad boolean not null default false,       -- lo que más vende
  certificado     boolean not null default false,       -- acreditación del ramo
  nota            text,

  unique (agente_id, ramo)
);

create index if not exists ramos_agente_ramo_idx on public.ramos_agente (ramo);

-- ---------------------------------------------------------------------------
-- disponibilidad — agenda del agente.
--
-- Doncellas guarda un booleano por día. Aquí se guardan franjas horarias
-- porque el panel-modelo tiene un week-grid de 7 días × horas que hasta hoy
-- no estaba respaldado en la tabla.
-- ---------------------------------------------------------------------------
create table if not exists public.disponibilidad (
  id         uuid primary key default gen_random_uuid(),
  agente_id  uuid not null references public.agentes (id) on delete cascade,
  fecha      date not null,
  hora_ini   time not null default '09:00',
  hora_fin   time not null default '18:00',
  disponible boolean not null default true,

  unique (agente_id, fecha, hora_ini),
  constraint disponibilidad_horas_ck check (hora_fin > hora_ini)
);

create index if not exists disponibilidad_agente_fecha_idx
  on public.disponibilidad (agente_id, fecha);
