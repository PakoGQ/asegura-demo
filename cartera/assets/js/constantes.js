/* ==========================================================================
   constantes.js — Catálogos de la UI.

   IMPORTANTE: deben coincidir con los CHECK constraints de db/01_schema.sql.
   Si se agrega un ramo o un estatus, se cambia en los dos lados.
   ========================================================================== */

window.CAT = {
  // [GNP] Ramos y nomenclatura de productos GNP.
  // `color` alimenta las gráficas; el hex vive en base.css como --ramo-*.
  RAMOS: {
    auto:           { label: 'Auto',            icono: '🚗', color: 'var(--ramo-auto)' },
    vida:           { label: 'Vida',            icono: '🛡️', color: 'var(--ramo-vida)' },
    gastos_medicos: { label: 'Gastos Médicos',  icono: '🏥', color: 'var(--ramo-gastos_medicos)' },
    hogar:          { label: 'Hogar',           icono: '🏠', color: 'var(--ramo-hogar)' },
    empresarial:    { label: 'Empresarial',     icono: '🏢', color: 'var(--ramo-empresarial)' },
    educativo:      { label: 'Educativo',       icono: '🎓', color: 'var(--ramo-educativo)' },
    fianzas:        { label: 'Fianzas',         icono: '📄', color: 'var(--ramo-fianzas)' },
  },

  ESTATUS_POLIZA: {
    activa:      { label: 'Activa',       clase: 'ok' },
    por_vencer:  { label: 'Por vencer',   clase: 'alerta' },
    renovada:    { label: 'Renovada',     clase: 'ok' },
    cancelada:   { label: 'Cancelada',    clase: '' },
    no_renovada: { label: 'No renovada',  clase: 'riesgo' },
  },

  TIPOS_ACTIVIDAD: {
    llamada:    { label: 'Llamada',    icono: '📞' },
    whatsapp:   { label: 'WhatsApp',   icono: '💬' },
    visita:     { label: 'Visita',     icono: '🤝' },
    cotizacion: { label: 'Cotización', icono: '🧮' },
    renovacion: { label: 'Renovación', icono: '🔄' },
    siniestro:  { label: 'Siniestro',  icono: '⚠️' },
  },

  RESULTADOS_ACTIVIDAD: {
    pendiente:    'Pendiente',
    cerrado:      'Cerrado',
    sin_respuesta:'Sin respuesta',
    rechazado:    'Rechazado',
  },

  TIPOS_OPORTUNIDAD: {
    cross_sell:           { label: 'Venta cruzada',   clase: 'info' },
    riesgo_no_renovacion: { label: 'Riesgo de caída', clase: 'riesgo' },
    revision_cobertura:   { label: 'Revisar cobertura', clase: 'alerta' },
  },

  ESTATUS_OPORTUNIDAD: {
    nueva:      { label: 'Nueva',      clase: 'info' },
    en_proceso: { label: 'En proceso', clase: 'alerta' },
    ganada:     { label: 'Ganada',     clase: 'ok' },
    descartada: { label: 'Descartada', clase: '' },
  },

  FORMAS_PAGO: {
    anual:      'Anual',
    semestral:  'Semestral',
    trimestral: 'Trimestral',
    mensual:    'Mensual',
  },
};
