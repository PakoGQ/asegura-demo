/* ==========================================================================
   supabase-config.js — Único archivo a editar para conectar la base.

   La ANON KEY es pública por diseño: viaja en el navegador y no da acceso a
   nada por sí sola. Quien protege los datos es el RLS de db/05_rls.sql.
   La SERVICE ROLE KEY jamás va en este repositorio.
   ========================================================================== */

window.CONFIG = {
  SUPABASE_URL: 'https://jfkcnapduonxjlknxnku.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_EyHU1a4VbNUEDR5pYZ8Fyw_29r9PWKr',

  // [VAXTI] Específico del cliente — cambiar al replicar
  MARCA: 'Vaxti',
  SUBMARCA: 'Asesores Financieros',
  ASEGURADORA: '',   // vacío en el demo público; aquí va la aseguradora del cliente
  TAGLINE: 'Tu agente de seguros, cerca de ti',
  CIUDAD: 'Guadalajara',
  WHATSAPP_CENTRAL: '523310000001',

  // Zonas del buscador. Se muestran como chips en móvil.
  ZONAS: ['Toda la ciudad', 'Providencia', 'Chapultepec', 'Andares',
          'Centro', 'Tlaquepaque', 'Zapopan', 'Tlajomulco'],
};

/* Cliente único. Toda la app lo usa como window.sbClient. */
window.sbClient = (function () {
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('supabase-js no cargó. Revisa el <script> del CDN.');
    return null;
  }
  if (window.CONFIG.SUPABASE_URL.includes('TU-PROYECTO')) {
    console.warn('supabase-config.js tiene los valores de ejemplo. ' +
                 'La página funciona con datos demo hasta que pegues los reales.');
    return null;
  }
  return window.supabase.createClient(
    window.CONFIG.SUPABASE_URL,
    window.CONFIG.SUPABASE_ANON_KEY,
    { auth: { persistSession: true, autoRefreshToken: true } }
  );
})();
