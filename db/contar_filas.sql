-- ============================================================================
-- contar_filas.sql — Cuántas filas hay de verdad en cada tabla.
--
-- Se corre en el SQL Editor, donde la sesión es `postgres` y el RLS no aplica.
-- Sirve para interpretar lo que reporta `python3 tools/probar_supabase.py`.
--
-- Por qué hace falta: PostgREST responde 200 con lista vacía tanto si el RLS
-- bloqueó al anónimo como si la tabla simplemente está vacía. Desde fuera son
-- indistinguibles. Una tabla con filas aquí y 0 visibles allá es la prueba de
-- que el RLS la está protegiendo; una tabla vacía en ambos lados no prueba nada.
-- ============================================================================

select 'agentes'          as tabla, count(*) as filas, 'público' as quien_debe_verla from public.agentes
union all select 'fotos',            count(*), 'público'  from public.fotos
union all select 'ramos_agente',     count(*), 'público'  from public.ramos_agente
union all select 'disponibilidad',   count(*), 'público'  from public.disponibilidad
union all select 'resenas',          count(*), 'público (solo aprobadas)' from public.resenas
union all select 'citas',            count(*), '🔒 NADIE sin sesión' from public.citas
union all select 'resenas_clientes', count(*), '🔒 NADIE sin sesión' from public.resenas_clientes
union all select 'usuarios',         count(*), '🔒 NADIE sin sesión' from public.usuarios
union all select 'postulaciones',    count(*), '🔒 NADIE sin sesión' from public.postulaciones
union all select 'clientes',         count(*), '🔒 NADIE sin sesión' from public.clientes
union all select 'polizas',          count(*), '🔒 NADIE sin sesión' from public.polizas
union all select 'oportunidades',    count(*), '🔒 NADIE sin sesión' from public.oportunidades
order by tabla;
