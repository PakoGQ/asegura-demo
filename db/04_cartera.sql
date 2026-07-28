-- ============================================================================
-- 04_cartera.sql — CRM de cartera (sección interna del panel del Director)
--
-- Esto NO es la puerta de entrada del producto: es una sección más del panel,
-- como "Ingresos" en el panel-admin de Doncellas. Ver CLAUDE.md §14.
--
-- `clientes` aquí son asegurados con póliza, no los visitantes que agendan una
-- cita. Un visitante se convierte en cliente cuando compra.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- clientes — asegurados. Siempre pertenecen a un agente.
-- ---------------------------------------------------------------------------
create table if not exists public.clientes (
  id               uuid primary key default gen_random_uuid(),
  agente_id        uuid not null references public.usuarios (id) on delete restrict,
  cita_origen_id   uuid references public.citas (id) on delete set null,  -- de dónde salió
  nombre           text not null,
  telefono         text,
  email            text,
  fecha_nacimiento date,
  rfc              text,
  notas            text,
  created_at       timestamptz not null default now()
);

create index if not exists clientes_agente_id_idx on public.clientes (agente_id);
create index if not exists clientes_nombre_idx on public.clientes (lower(nombre));

-- ---------------------------------------------------------------------------
-- polizas — `agente_id` está desnormalizado a propósito: simplifica el RLS y
-- evita un join en cada query del panel.
-- ---------------------------------------------------------------------------
create table if not exists public.polizas (
  id                 uuid primary key default gen_random_uuid(),
  cliente_id         uuid not null references public.clientes (id) on delete cascade,
  agente_id          uuid not null references public.usuarios (id) on delete restrict,
  aseguradora        text not null default 'GNP',        -- [GNP]
  ramo               text not null check (ramo in (
                       'auto', 'vida', 'gastos_medicos', 'hogar',
                       'empresarial', 'educativo', 'fianzas')),
  numero_poliza      text not null,
  prima_anual        numeric(12,2) not null check (prima_anual >= 0),
  comision_pct       numeric(5,2) check (comision_pct between 0 and 100),
  fecha_inicio       date not null,
  fecha_vencimiento  date not null,                      -- motor de recordatorios
  estatus            text not null default 'activa' check (estatus in (
                       'activa', 'por_vencer', 'renovada', 'cancelada', 'no_renovada')),
  forma_pago         text check (forma_pago in ('anual', 'semestral', 'trimestral', 'mensual')),
  created_at         timestamptz not null default now(),

  constraint polizas_vigencia_ck check (fecha_vencimiento >= fecha_inicio)
);

create unique index if not exists polizas_aseguradora_numero_uq
  on public.polizas (aseguradora, numero_poliza);
create index if not exists polizas_agente_id_idx on public.polizas (agente_id);
create index if not exists polizas_cliente_id_idx on public.polizas (cliente_id);
create index if not exists polizas_vivas_venc_idx
  on public.polizas (fecha_vencimiento)
  where estatus in ('activa', 'por_vencer');

-- ---------------------------------------------------------------------------
-- actividad — todo contacto o seguimiento posterior a la venta.
-- ---------------------------------------------------------------------------
create table if not exists public.actividad (
  id           uuid primary key default gen_random_uuid(),
  agente_id    uuid not null references public.usuarios (id) on delete restrict,
  cliente_id   uuid not null references public.clientes (id) on delete cascade,
  poliza_id    uuid references public.polizas (id) on delete set null,
  tipo         text not null check (tipo in (
                 'llamada', 'whatsapp', 'visita', 'cotizacion', 'renovacion', 'siniestro')),
  descripcion  text not null,
  fecha        timestamptz not null default now(),
  resultado    text check (resultado in ('pendiente', 'cerrado', 'sin_respuesta', 'rechazado')),
  created_at   timestamptz not null default now()
);

create index if not exists actividad_agente_fecha_idx on public.actividad (agente_id, fecha desc);
create index if not exists actividad_cliente_fecha_idx on public.actividad (cliente_id, fecha desc);

-- ---------------------------------------------------------------------------
-- oportunidades — cross-sell y riesgo. Las genera el motor de reglas SQL de
-- 06_funciones.sql, nunca la captura una persona.
-- ---------------------------------------------------------------------------
create table if not exists public.oportunidades (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references public.clientes (id) on delete cascade,
  agente_id       uuid not null references public.usuarios (id) on delete restrict,
  tipo            text not null check (tipo in (
                    'cross_sell', 'riesgo_no_renovacion', 'revision_cobertura')),
  ramo_sugerido   text check (ramo_sugerido in (
                    'auto', 'vida', 'gastos_medicos', 'hogar',
                    'empresarial', 'educativo', 'fianzas')),
  motivo          text not null,
  valor_estimado  numeric(12,2),
  estatus         text not null default 'nueva' check (estatus in (
                    'nueva', 'en_proceso', 'ganada', 'descartada')),
  created_at      timestamptz not null default now()
);

create index if not exists oportunidades_agente_estatus_idx
  on public.oportunidades (agente_id, estatus);

-- Impide que el generador duplique la misma oportunidad abierta.
create unique index if not exists oportunidades_abiertas_uq
  on public.oportunidades (cliente_id, tipo, coalesce(ramo_sugerido, ''))
  where estatus in ('nueva', 'en_proceso');

-- ---------------------------------------------------------------------------
-- Referidos — patrón REF-XXXXXX. El código lo genera Postgres (06_funciones).
-- ---------------------------------------------------------------------------
create table if not exists public.codigos_referido (
  id          uuid primary key default gen_random_uuid(),
  codigo      text unique not null,
  cliente_id  uuid not null references public.clientes (id) on delete cascade,
  agente_id   uuid not null references public.usuarios (id) on delete restrict,
  usos        int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.referidos (
  id                  uuid primary key default gen_random_uuid(),
  codigo_id           uuid not null references public.codigos_referido (id) on delete cascade,
  cliente_referido_id uuid references public.clientes (id) on delete set null,
  estatus             text not null default 'pendiente' check (estatus in (
                        'pendiente', 'contactado', 'convertido', 'perdido')),
  created_at          timestamptz not null default now()
);

create index if not exists codigos_referido_agente_idx on public.codigos_referido (agente_id);
create index if not exists referidos_codigo_idx on public.referidos (codigo_id);
