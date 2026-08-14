-- ============================================================================
-- 10_portada.sql — Qué agentes salen en la galería de la portada.
--
-- Dos modos, y el modo NO se guarda en ningún sitio: se deduce de los datos.
--
--   · Si nadie tiene `en_portada`, la portada rota sola: elige 6 al azar y
--     cambia cada hora. Es el comportamiento por defecto, el que hay sin
--     configurar nada.
--   · En cuanto el Director marca a alguien, mandan los marcados.
--
-- Se hizo así a propósito, en vez de una tabla de configuración con un campo
-- «modo»: con dos sitios donde mirar acaban contradiciéndose —modo manual con
-- cero agentes marcados deja la portada vacía— y hay que escribir código para
-- resolver el empate. Aquí el estado es uno solo y no puede ser incoherente.
--
-- Se corre DESPUÉS de 09_hero_imagen.sql. Idempotente.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1 · La marca de portada
-- ---------------------------------------------------------------------------
alter table public.agentes
  add column if not exists en_portada boolean not null default false;

comment on column public.agentes.en_portada is
  'Elegido a mano por el Director para la galería de la portada. Si NADIE lo '
  'tiene, la portada rota 6 al azar cada hora.';

create index if not exists agentes_en_portada_idx
  on public.agentes (en_portada) where en_portada;


-- ---------------------------------------------------------------------------
-- 2 · Tope de 6
--
-- El límite vive en la base y no solo en el panel: el navegador se puede
-- saltar con una petición a mano, y una portada con veinte caras deja de ser
-- una selección. Un trigger y no un CHECK porque la regla mira TODA la tabla,
-- no la fila que se está tocando.
-- ---------------------------------------------------------------------------
create or replace function public.trg_tope_portada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cuantos int;
begin
  if new.en_portada and not coalesce(old.en_portada, false) then
    select count(*) into cuantos from public.agentes where en_portada;
    if cuantos > 6 then
      raise exception 'La portada admite 6 agentes como máximo; ya hay %.', cuantos - 1
        using hint = 'Quita a alguno antes de añadir otro.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_agentes_tope_portada on public.agentes;
create constraint trigger trg_agentes_tope_portada
  after insert or update of en_portada on public.agentes
  deferrable initially immediate
  for each row execute function public.trg_tope_portada();


-- ---------------------------------------------------------------------------
-- 3 · `en_portada` en la vista pública
--
-- Al final de la lista de columnas: `create or replace view` no deja
-- insertarlas en medio ni reordenarlas. Ver la nota en 08_apariencia.sql.
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
       a.orden_publico,
       a.en_portada
  from public.agentes a;

grant select on public.v_agentes_publico to anon, authenticated;


-- Verificación rápida:
--   select slug, en_portada from public.agentes where en_portada;
--   -- 0 filas = la portada rota sola cada hora
