-- ============================================================================
-- 08_apariencia.sql — Lo que el Director puede cambiar del sitio público
--   sin tocar código: los slides del hero y el orden en que salen los agentes.
--
-- Hasta aquí, los cuatro slides de la portada estaban escritos en `buildHero()`
-- de app.js y el orden de los agentes lo decidía una fórmula (destacados
-- primero, luego calificación). Para cambiar cualquiera de las dos cosas había
-- que editar el código y volver a publicar.
--
-- Idempotente: se puede correr las veces que haga falta.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1 · Orden manual de los agentes
--
-- NULL a propósito, no 0: significa «este agente no tiene puesto asignado».
-- Los que tienen número salen primero y en ese orden; los que no, después con
-- el orden de siempre. Así el Director puede fijar solo los tres primeros y
-- olvidarse del resto, en vez de tener que ordenar los treinta.
-- ---------------------------------------------------------------------------
alter table public.agentes
  add column if not exists orden_publico int;

comment on column public.agentes.orden_publico is
  'Puesto fijado a mano por el Director para el sitio público. NULL = sin '
  'puesto: va después de los ordenados, con el criterio automático.';

create index if not exists agentes_orden_publico_idx
  on public.agentes (orden_publico nulls last);


-- ---------------------------------------------------------------------------
-- 2 · Slides del hero
--
-- `fondo` reproduce los tres diseños que ya existían en el CSS, para que lo
-- que arme el Director se vea como el resto del sitio y no haya que inventar
-- estilos nuevos por cada slide:
--   marca  → degradado claro con el naranja de Vaxti (el slide de bienvenida)
--   azul   → degradado del azul de marca, texto en blanco (el de asesoría)
--   agente → la foto del agente de fondo, con velo para que se lea el texto
-- ---------------------------------------------------------------------------
create table if not exists public.hero_slides (
  id           uuid primary key default gen_random_uuid(),
  director_id  uuid references public.usuarios (id) on delete cascade,

  orden        int not null default 0,
  activo       boolean not null default true,

  -- Contenido. `titulo_acento` es la parte que va en naranja, en su renglón.
  etiqueta      text,
  titulo        text not null,
  titulo_acento text,
  texto         text,

  -- Llamada a la acción. Sin texto no se pinta el botón.
  cta_texto  text,
  cta_url    text,

  fondo      text not null default 'marca'
               check (fondo in ('marca', 'azul', 'agente')),
  -- Solo se usa con fondo = 'agente'. Si ese agente se borra, el slide queda
  -- huérfano en vez de desaparecer: se degrada a fondo de marca al pintarlo.
  agente_id  uuid references public.agentes (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hero_slides_orden_idx
  on public.hero_slides (orden) where activo;

drop trigger if exists trg_hero_slides_updated on public.hero_slides;
create trigger trg_hero_slides_updated
  before update on public.hero_slides
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 3 · RLS
--
-- El hero lo tiene que leer el visitante SIN sesión: es la portada. Pero solo
-- los slides activos, y escribir únicamente el Director.
-- ---------------------------------------------------------------------------
alter table public.hero_slides enable row level security;

grant select on public.hero_slides to anon, authenticated;
grant insert, update, delete on public.hero_slides to authenticated;

drop policy if exists hero_publico on public.hero_slides;
create policy hero_publico on public.hero_slides
  for select to anon
  using (activo);

drop policy if exists hero_lectura_sesion on public.hero_slides;
create policy hero_lectura_sesion on public.hero_slides
  for select to authenticated
  using (true);

-- Escritura solo del Director. `for all` cubre insert, update y delete; el
-- `with check` evita que cree slides colgando de otro director.
drop policy if exists hero_director on public.hero_slides;
create policy hero_director on public.hero_slides
  for all to authenticated
  using (public.mi_rol() = 'director')
  with check (public.mi_rol() = 'director');


-- ---------------------------------------------------------------------------
-- 3b · `orden_publico` en la vista del directorio
--
-- `v_agentes_publico` lista sus columnas una a una, así que una columna nueva
-- en `agentes` no aparece sola. Se recrea aquí, en el archivo que la introduce,
-- en vez de tocar 07_vistas.sql: quien lea el 08 ve el cambio completo.
-- El resto de la definición es idéntica al original.
-- ---------------------------------------------------------------------------
create or replace view public.v_agentes_publico
with (security_invoker = on) as
select a.id,
       a.slug,
       a.nombre,
       coalesce(a.foto_url, (
         select f.url from public.fotos f
          where f.agente_id = a.id and f.destino = 'perfil' and f.tipo = 'foto'
          order by f.orden limit 1
       ))                                        as foto,
       a.titulo,
       a.descripcion,
       a.cedula,
       a.aseguradoras,
       a.anios_experiencia,
       a.ciudad,
       a.zona,
       a.lat,
       a.lng,
       a.cobertura_km,
       a.modalidades,
       a.idiomas,
       a.whatsapp,
       a.disponible,
       a.verificado,
       a.calificacion,
       a.num_resenas,
       a.num_citas,
       a.es_nuevo,
       a.es_destacado,
       a.top10,
       a.tags,
       array(select r.ramo from public.ramos_agente r
              where r.agente_id = a.id order by r.es_especialidad desc, r.ramo)
                                                 as ramos,
       array(select r.ramo from public.ramos_agente r
              where r.agente_id = a.id and r.es_especialidad)
                                                 as especialidades,
       (select count(*) from public.fotos f
         where f.agente_id = a.id and f.destino = 'perfil') as num_fotos,
       a.created_at,
       -- Va AL FINAL a propósito: `create or replace view` no deja insertar
       -- una columna en medio ni reordenarlas. Ponerla junto a `top10`, que es
       -- donde encajaría por significado, hacía que Postgres lo interpretara
       -- como renombrar `tags` y fallara con «cannot change name of view
       -- column». Toda columna nueva se añade al final.
       a.orden_publico
  from public.agentes a;


-- ---------------------------------------------------------------------------
-- 4 · Vista pública del hero
--
-- Resuelve aquí la foto y el nombre del agente para que el navegador no tenga
-- que pedir dos cosas y cruzarlas. `security_invoker` es obligatorio: sin él
-- la vista correría con los permisos de quien la creó y se saltaría el RLS.
-- ---------------------------------------------------------------------------
create or replace view public.v_hero_publico
with (security_invoker = on) as
  select s.id,
         s.orden,
         s.etiqueta,
         s.titulo,
         s.titulo_acento,
         s.texto,
         s.cta_texto,
         s.cta_url,
         s.fondo,
         a.slug        as agente_slug,
         a.nombre      as agente_nombre,
         a.foto_url    as agente_foto,
         a.zona        as agente_zona,
         a.anios_experiencia as agente_anios,
         a.calificacion      as agente_calificacion,
         a.verificado        as agente_verificado
    from public.hero_slides s
    left join public.agentes a
           on a.id = s.agente_id
          and a.activo and not a.hidden and not a.suspended
   where s.activo
   order by s.orden, s.created_at;

grant select on public.v_hero_publico to anon, authenticated;


-- Verificación rápida:
--   select orden, titulo, fondo, agente_nombre from public.v_hero_publico;
--   select slug, orden_publico from public.agentes
--    where orden_publico is not null order by orden_publico;
