-- ============================================================================
-- 09_hero_imagen.sql — Imagen propia de fondo para los banners de la portada.
--
-- Añade el cuarto tipo de fondo (una imagen que sube el Director) y deja
-- Supabase Storage listo para recibirla. Es la primera vez que el proyecto usa
-- Storage; hasta ahora todas las imágenes eran URLs de Unsplash.
--
-- Se corre DESPUÉS de 08_apariencia.sql. Idempotente.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1 · La columna y el nuevo valor de `fondo`
--
-- El CHECK se reemplaza en vez de crearse: 08 ya dejó uno con tres valores y
-- `add constraint` fallaría por nombre repetido.
-- ---------------------------------------------------------------------------
alter table public.hero_slides
  add column if not exists imagen_url text;

comment on column public.hero_slides.imagen_url is
  'Imagen de fondo subida por el Director. Solo se usa con fondo = ''imagen''.';

alter table public.hero_slides
  drop constraint if exists hero_slides_fondo_check;

alter table public.hero_slides
  add constraint hero_slides_fondo_check
  check (fondo in ('marca', 'azul', 'agente', 'imagen'));


-- ---------------------------------------------------------------------------
-- 2 · El bucket de Storage
--
-- Público a propósito: son las imágenes del hero de la portada, que ve
-- cualquier visitante sin sesión. Lo que NO es público es subir, que se
-- restringe abajo al Director.
--
-- Los límites viven en el bucket y no solo en el navegador: una validación en
-- el cliente se la salta cualquiera con la anon key y una petición a mano.
--   · 3 MB — de sobra para una foto de fondo ya comprimida
--   · solo jpeg, png y webp — nada de SVG, que puede traer <script> dentro
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hero', 'hero', true, 3145728,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ---------------------------------------------------------------------------
-- 3 · Quién puede hacer qué con esos archivos
--
-- Leer: cualquiera, incluido el visitante sin cuenta.
-- Subir, reemplazar y borrar: solo el Director. `mi_rol()` es el mismo helper
-- que usa el resto del RLS, así que la regla no se puede desincronizar.
-- ---------------------------------------------------------------------------
drop policy if exists hero_img_lectura on storage.objects;
create policy hero_img_lectura on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'hero');

drop policy if exists hero_img_subir on storage.objects;
create policy hero_img_subir on storage.objects
  for insert to authenticated
  with check (bucket_id = 'hero' and public.mi_rol() = 'director');

drop policy if exists hero_img_reemplazar on storage.objects;
create policy hero_img_reemplazar on storage.objects
  for update to authenticated
  using (bucket_id = 'hero' and public.mi_rol() = 'director');

drop policy if exists hero_img_borrar on storage.objects;
create policy hero_img_borrar on storage.objects
  for delete to authenticated
  using (bucket_id = 'hero' and public.mi_rol() = 'director');


-- ---------------------------------------------------------------------------
-- 4 · La vista pública tiene que devolver la imagen
--
-- `create or replace view` no deja insertar columnas en medio ni reordenarlas,
-- así que `imagen_url` va al final. Ver la nota en 08_apariencia.sql.
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
         a.verificado        as agente_verificado,
         s.imagen_url
    from public.hero_slides s
    left join public.agentes a
           on a.id = s.agente_id
          and a.activo and not a.hidden and not a.suspended
   where s.activo
   order by s.orden, s.created_at;

grant select on public.v_hero_publico to anon, authenticated;


-- Verificación rápida:
--   select id, public, file_size_limit from storage.buckets where id = 'hero';
--   select orden, titulo, fondo, imagen_url from public.v_hero_publico;
