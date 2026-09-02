-- ============================================================================
-- 13_asistente_ia.sql — El contexto del asistente viaja con la cita
--
-- QUÉ RESUELVE
-- El visitante le cuenta su caso al asistente («tengo un Nissan Sentra 2022 sin
-- seguro y quiero gastos médicos»), elige agente y agenda. Sin esto, el agente
-- recibe una cita a secas y el cliente tiene que contarlo TODO otra vez —que es
-- exactamente la sensación que el asistente venía a quitar.
--
-- POR QUÉ SON COLUMNAS DE `citas` Y NO UNA TABLA NUEVA
-- El resumen no existe sin su cita: nace cuando se agenda y muere con ella. Una
-- tabla aparte obligaría a un join en cada consulta del panel, a duplicar las
-- policies, y a decidir qué hacer con los huérfanos. `citas` ya tiene el RLS
-- correcto —el anónimo inserta y jamás lee— y estas columnas lo heredan entero.
--
-- ⚠️ LO QUE AQUÍ NO SE GUARDA, Y ES DELIBERADO
-- No se guarda la transcripción del chat. Solo el resumen que el propio
-- asistente redactó para el agente. La gente le cuenta a un chat cosas de su
-- salud y su dinero que no dejaría por escrito si supiera que se archivan;
-- guardar la conversación entera sería construir un expediente que nadie pidió
-- y que el día de mañana hay que proteger, exportar y borrar bajo la LFPDPPP.
-- El resumen basta para que el agente llegue preparado, que es el objetivo.
--
-- Idempotente. Correr después de 11 y 12.
-- ============================================================================

do $$
begin
  if to_regclass('public.citas') is null then
    raise exception 'No existe public.citas. ¿Se corrió TODO_EN_UNO.sql?';
  end if;
end $$;

alter table public.citas
  -- Lo que el asistente le dejó dicho al agente, en tercera persona.
  add column if not exists contexto_ia   text,
  -- Los ramos que detectó, para que el panel los muestre sin re-analizar nada.
  add column if not exists ramos_ia      text[],
  -- 'normal' | 'pronto'. Sin CHECK a propósito: si mañana el asistente
  -- distingue más niveles, no queremos una migración para eso.
  add column if not exists urgencia_ia   text,
  -- Cuántas preguntas hicieron falta. Es la métrica que dice si el asistente
  -- está ayudando o entorpeciendo: si sube con el tiempo, algo va mal.
  add column if not exists turnos_ia     int;

comment on column public.citas.contexto_ia is
  'Resumen del caso redactado por el asistente para el agente. NO es la '
  'transcripción del chat: esa no se guarda nunca.';

-- Para «citas que llegaron del asistente» sin recorrer la tabla entera.
create index if not exists citas_contexto_ia_idx
  on public.citas (agente_id) where contexto_ia is not null;

-- ---------------------------------------------------------------------------
-- El RLS NO se toca, y conviene entender por qué.
--
-- Estas columnas viven dentro de `citas`, así que heredan sus policies tal
-- cual: el anónimo puede INSERT (agendar, contexto incluido) y no puede SELECT
-- (jamás lee lo que otro contó). El agente lee las suyas; el Director, las de
-- su equipo. No hace falta una sola policy nueva — y esa es justamente la
-- razón de haberlo puesto aquí en vez de en una tabla nueva.
-- ---------------------------------------------------------------------------

-- ── Comprobación ────────────────────────────────────────────────────────────
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'citas'
   and column_name in ('contexto_ia', 'ramos_ia', 'urgencia_ia', 'turnos_ia')
 order by column_name;
