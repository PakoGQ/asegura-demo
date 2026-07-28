-- ============================================================================
-- 01_usuarios.sql — Cuentas, jerarquía y helpers compartidos
--
-- Ejecutar en el SQL Editor de Supabase en orden: 01 → 02 → … → 07.
-- Idempotente: se puede volver a correr sin romper nada.
--
-- Equivale a la tabla `usuarios` de Doncellas (la que hace join con `escorts`),
-- pero desde el día uno cuelga de Supabase Auth. En Doncellas las credenciales
-- del admin están escritas en app.js; eso NO se porta.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- usuarios — Director y Agentes. `director_id` es autorreferencial para
-- soportar más niveles a futuro (subdirectores), pero la Fase 1 usa dos.
-- ---------------------------------------------------------------------------
create table if not exists public.usuarios (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique references auth.users (id) on delete set null,
  nombre        text not null,
  email         text not null,
  telefono      text,                                   -- E.164 para WhatsApp
  rol           text not null check (rol in ('director', 'agente')),
  director_id   uuid references public.usuarios (id) on delete set null,
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Un director no cuelga de nadie; un agente siempre cuelga de alguien.
  constraint usuarios_jerarquia_ck check (
    (rol = 'director' and director_id is null) or
    (rol = 'agente'   and director_id is not null)
  )
);

create index if not exists usuarios_director_id_idx on public.usuarios (director_id);
create index if not exists usuarios_auth_user_id_idx on public.usuarios (auth_user_id);

-- ---------------------------------------------------------------------------
-- updated_at automático — mismo trigger que Doncellas
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists usuarios_updated_at on public.usuarios;
create trigger usuarios_updated_at
  before update on public.usuarios
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers de RLS
--
-- SECURITY DEFINER a propósito: leen `usuarios` saltándose RLS y así evitan la
-- recursión infinita en las policies de la propia tabla.
-- ---------------------------------------------------------------------------
create or replace function public.mi_usuario_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id from public.usuarios u
   where u.auth_user_id = auth.uid() and u.activo
   limit 1;
$$;

create or replace function public.mi_rol()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.rol from public.usuarios u
   where u.auth_user_id = auth.uid() and u.activo
   limit 1;
$$;

-- ¿La fila de este agente es visible para mí?
-- Verdadero si soy yo, o si soy director y ese agente cuelga de mí.
create or replace function public.es_de_mi_equipo(p_usuario_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios yo
    join public.usuarios ag on ag.id = p_usuario_id
    where yo.auth_user_id = auth.uid()
      and yo.activo
      and (ag.id = yo.id or (yo.rol = 'director' and ag.director_id = yo.id))
  );
$$;

comment on function public.es_de_mi_equipo(uuid) is
  'True si p_usuario_id soy yo mismo o un agente de mi equipo (siendo director).';

grant execute on function public.mi_usuario_id()       to authenticated;
grant execute on function public.mi_rol()              to authenticated;
grant execute on function public.es_de_mi_equipo(uuid) to authenticated;
