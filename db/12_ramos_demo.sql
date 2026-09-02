-- ============================================================================
-- 12_ramos_demo.sql — Reparte Ahorro y Retiro entre los agentes del demo
--
-- ESTE ARCHIVO ES OPCIONAL Y ES DE DATOS, NO DE ESQUEMA.
-- El obligatorio es `11_ramos_financieros.sql`, que amplía los CHECK. Sin este
-- 12, los dos ramos nuevos existen pero salen con «0 agentes lo manejan» en
-- ramos.html, que en un demo se ve peor que no tenerlos.
--
-- POR QUÉ HACE FALTA
-- Los 30 agentes se sembraron cuando el catálogo solo tenía siete ramos. Cuatro
-- de ellos ya anuncian «ahorro» en su título o sus tags y uno anuncia «retiro»,
-- pero ninguno lo tiene como ramo: se anuncian vendiendo algo por lo que nadie
-- los puede filtrar.
--
-- EL CRITERIO, que no es al azar
--   · ahorro → a quien ya vende `educativo`. El ahorro educativo ES ahorro; es
--     el mismo producto con otro destino.
--   · retiro → a quien vende `vida` y lleva 8 años o más. El PPR lo coloca el
--     agente con trayectoria, no el que acaba de sacar la cédula.
--   · y a los cuatro que ya lo anuncian en su ficha, se les da lo que anuncian.
--
-- SON DATOS DE DEMOSTRACIÓN. Cuando entren agentes reales, cada uno marca sus
-- propios ramos desde «Editar perfil» y esto sobra.
--
-- Es aditivo e idempotente: solo INSERTA, nunca borra ni cambia un ramo que ya
-- estuviera puesto. Correrlo dos veces no duplica nada.
-- ============================================================================

do $$
declare
  n_ahorro int;
  n_retiro int;
begin
  if to_regclass('public.ramos_agente') is null then
    raise exception 'No existe public.ramos_agente. ¿Se corrió TODO_EN_UNO.sql?';
  end if;

  -- Falla ruidosamente si el 11 no se ha corrido: sin él, cada insert de abajo
  -- reventaría contra el CHECK y el motivo real quedaría enterrado bajo un
  -- «violates check constraint» que no dice qué hacer.
  if not exists (
    select 1 from pg_constraint con
      join pg_class cls on cls.oid = con.conrelid
     where cls.relname = 'ramos_agente'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%retiro%'
  ) then
    raise exception 'Corre antes db/11_ramos_financieros.sql: el CHECK de ramos_agente todavía no acepta ''retiro''.';
  end if;

  -- ── ahorro ────────────────────────────────────────────────────────────────
  insert into public.ramos_agente (agente_id, ramo, es_especialidad)
  select a.id, 'ahorro', false
    from public.agentes a
   where exists (select 1 from public.ramos_agente r
                  where r.agente_id = a.id and r.ramo = 'educativo')
      or a.titulo ilike '%ahorro%'
      or 'Ahorro' = any (a.tags)
  on conflict (agente_id, ramo) do nothing;
  get diagnostics n_ahorro = row_count;

  -- ── retiro (PPR) ──────────────────────────────────────────────────────────
  insert into public.ramos_agente (agente_id, ramo, es_especialidad)
  select a.id, 'retiro', false
    from public.agentes a
   where (exists (select 1 from public.ramos_agente r
                   where r.agente_id = a.id and r.ramo = 'vida')
          and coalesce(a.anios_experiencia, 0) >= 8)
      or a.titulo ilike '%retiro%'
      or 'Retiro' = any (a.tags)
  on conflict (agente_id, ramo) do nothing;
  get diagnostics n_retiro = row_count;

  raise notice 'ahorro -> % agentes nuevos · retiro -> % agentes nuevos', n_ahorro, n_retiro;

  if n_ahorro = 0 and n_retiro = 0 then
    raise notice 'Nadie cambió: o ya estaba corrido, o la base no tiene los agentes del seed.';
  end if;
end $$;

-- ── Comprobación ────────────────────────────────────────────────────────────
-- Cuántos agentes maneja cada ramo. 'ahorro' y 'retiro' tienen que aparecer.
select ramo, count(*) as agentes
  from public.ramos_agente
 group by ramo
 order by agentes desc;
