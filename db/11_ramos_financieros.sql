-- ============================================================================
-- 11_ramos_financieros.sql — Ahorro y Retiro (PPR) entran al catálogo de ramos
--
-- POR QUÉ
-- El logo dice «Vaxti Asesores Financieros» y el sitio estaba escrito solo para
-- seguros, por la §18 de CLAUDE.md, que llevaba abierta desde el 28-jul-2026.
-- El 1-sep-2026 se cerró con evidencia: el propio Director vende PPR,
-- Trasciende, Consolida y Dotales en su comunicación pública. Un directorio con
-- siete ramos de seguro deja fuera la mitad de lo que su equipo coloca.
--
-- QUÉ HACE
-- Amplía los CUATRO check de ramo que hay repartidos por el esquema:
--   ramos_agente.ramo         (02)  qué vende cada agente
--   citas.ramo_interes        (03)  qué quiere cotizar el cliente
--   polizas.ramo              (04)  la cartera
--   oportunidades.ramo_sugerido (04) el motor de venta cruzada
-- Dejar uno fuera se nota tarde y mal: el agente podría publicar «Retiro» en su
-- perfil y la base rechazaría la cita cuando un cliente pidiera justo eso.
--
-- POR QUÉ NO BASTA CON EDITAR LOS ARCHIVOS 02/03/04
-- Porque son `create table if not exists`: sobre una base que ya existe no
-- aplican NADA. Los archivos numerados quedaron actualizados para que un
-- proyecto nuevo nazca bien; este archivo es para el Supabase que ya corre.
--
-- Es idempotente: se puede correr dos veces sin romper nada.
-- ============================================================================

do $$
declare
  -- La lista viva, en un solo lugar. Si mañana entra otro ramo se agrega aquí
  -- y en `RAMOS` de app.js, y no en ocho sitios distintos.
  ramos_ok constant text :=
    '''auto'', ''vida'', ''gastos_medicos'', ''hogar'', ''empresarial'', ' ||
    '''educativo'', ''fianzas'', ''ahorro'', ''retiro''';

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

    -- Fallar ruidosamente: si la tabla no está, el resto del script tampoco
    -- tiene sentido y es mejor saberlo aquí que descubrirlo al guardar una cita.
    if to_regclass('public.' || tabla) is null then
      raise exception 'No existe la tabla public.%. ¿Se corrió TODO_EN_UNO.sql?', tabla;
    end if;

    -- El check se busca por su DEFINICIÓN, no por un nombre adivinado: Postgres
    -- los autonombra y un proyecto restaurado de un dump puede traer otro.
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

    raise notice 'Ampliado: %.% -> ahorro, retiro', tabla, columna;
  end loop;
end $$;

-- ── Comprobación ────────────────────────────────────────────────────────────
-- Tienen que salir CUATRO filas, las cuatro con 'ahorro' y 'retiro' dentro.
select cls.relname            as tabla,
       con.conname            as restriccion,
       pg_get_constraintdef(con.oid) as definicion
  from pg_constraint con
  join pg_class     cls on cls.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = cls.relnamespace
 where nsp.nspname = 'public'
   and con.contype = 'c'
   and pg_get_constraintdef(con.oid) ilike '%retiro%'
 order by cls.relname;
