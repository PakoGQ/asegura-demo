-- ============================================================================
-- 14_ramo_mascotas.sql — Mascotas entra al catálogo de ramos
--
-- POR QUÉ
-- El sitio propio del Director, asesoresvaxti.com, anuncia «protección integral
-- para autos y mascotas». O sea que el equipo ya lo vende y nuestro catálogo no
-- lo tenía. Es el mismo caso de ahorro y retiro el 1-sep: el sitio iba por
-- detrás de lo que la agencia ofrece de verdad.
--
-- QUÉ HACE
-- Amplía los CUATRO check de ramo, exactamente como `11_ramos_financieros.sql`.
-- Dejar uno fuera se nota tarde y mal: el agente podría publicar «Mascotas» en
-- su perfil y la base rechazaría la cita cuando un cliente pidiera justo eso.
--
-- Se puede correr sin haber corrido el 11: la lista de abajo es completa, no
-- incremental, así que deja los cuatro CHECK con los DIEZ ramos vengan de donde
-- vengan. Es idempotente.
--
-- Y ADEMÁS reparte el ramo entre los agentes del demo, al final. Esa parte es
-- de DATOS y está separada con su propio encabezado: si algún día se corre
-- sobre una base con agentes reales, basta con no ejecutar ese último bloque.
-- ============================================================================

do $$
declare
  ramos_ok constant text :=
    '''auto'', ''vida'', ''gastos_medicos'', ''hogar'', ''empresarial'', ' ||
    '''educativo'', ''fianzas'', ''ahorro'', ''retiro'', ''mascotas''';

  objetivo constant text[][] := array[
    ['ramos_agente',  'ramo'],
    ['citas',         'ramo_interes'],
    ['polizas',       'ramo'],
    ['oportunidades', 'ramo_sugerido']
  ];

  tabla   text;
  columna text;
  viejo   text;
  nombre  text;
begin
  for i in 1 .. array_length(objetivo, 1) loop
    tabla   := objetivo[i][1];
    columna := objetivo[i][2];

    if to_regclass('public.' || tabla) is null then
      raise exception 'No existe la tabla public.%. ¿Se corrió TODO_EN_UNO.sql?', tabla;
    end if;

    -- Se busca por DEFINICIÓN y no por un nombre adivinado: Postgres autonombra
    -- los check y un proyecto restaurado de un dump puede traer otro nombre.
    select con.conname into viejo
      from pg_constraint con
      join pg_class     cls on cls.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = cls.relnamespace
     where nsp.nspname = 'public'
       and cls.relname = tabla
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%' || columna || '%'
       and pg_get_constraintdef(con.oid) ilike '%educativo%'
     limit 1;

    if viejo is not null then
      execute format('alter table public.%I drop constraint %I', tabla, viejo);
    end if;

    nombre := tabla || '_' || columna || '_check';
    execute format(
      'alter table public.%I add constraint %I check (%I in (%s))',
      tabla, nombre, columna, ramos_ok);

    raise notice 'Ampliado: %.% -> mascotas', tabla, columna;
  end loop;
end $$;


-- ============================================================================
-- DATOS DE DEMOSTRACIÓN — desde aquí es opcional
--
-- Sin esto, «Mascotas» sale en el sitio con «0 agentes lo manejan», que en un
-- demo se ve peor que no tenerlo.
--
-- EL CRITERIO: quien ya vende `hogar` **y maneja cuatro ramos o más**.
--
-- Lo de `hogar` no es al azar: mascotas y hogar son el mismo cliente y la misma
-- conversación —alguien protegiendo su casa y a los que viven en ella—. Lo de
-- los cuatro ramos tampoco: un producto nuevo lo adopta primero el generalista
-- que ya vende de todo, no el especialista de fianzas.
--
-- La primera versión pedía solo `hogar` y salían 16 de 30 agentes, más de la
-- mitad del equipo vendiendo un producto que se acaba de incorporar. Con el
-- filtro de cuatro ramos salen SEIS, que es lo que parece un lanzamiento de
-- verdad. Un catálogo donde todos venden todo no se cree.
--
-- Solo INSERTA; no borra ni pisa nada. Idempotente.
-- ============================================================================

do $$
declare n int;
begin
  if not exists (
    select 1 from pg_constraint con
      join pg_class cls on cls.oid = con.conrelid
     where cls.relname = 'ramos_agente' and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%mascotas%'
  ) then
    raise exception 'El CHECK de ramos_agente todavía no acepta ''mascotas''. ¿Falló el bloque de arriba?';
  end if;

  insert into public.ramos_agente (agente_id, ramo, es_especialidad)
  select a.id, 'mascotas', false
    from public.agentes a
   where exists (select 1 from public.ramos_agente r
                  where r.agente_id = a.id and r.ramo = 'hogar')
     and (select count(*) from public.ramos_agente r2
           where r2.agente_id = a.id) >= 4
  on conflict (agente_id, ramo) do nothing;
  get diagnostics n = row_count;

  raise notice 'mascotas -> % agentes nuevos', n;
  if n = 0 then
    raise notice 'Nadie cambió: o ya estaba corrido, o la base no tiene los agentes del seed.';
  end if;
end $$;

-- ── Comprobación ────────────────────────────────────────────────────────────
select ramo, count(*) as agentes
  from public.ramos_agente
 group by ramo
 order by agentes desc;
