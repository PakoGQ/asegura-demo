/* ==========================================================================
   supabase.js — Cliente único de Supabase.

   supabase-js se carga por CDN (UMD) en cada HTML, antes de este archivo.
   Es la única dependencia externa del proyecto: sin build step, sin npm.
   ========================================================================== */

(function () {
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('supabase-js no se cargó. Revisa el <script> del CDN en el HTML.');
    return;
  }

  if (!window.CONFIG || window.CONFIG.SUPABASE_URL.includes('TU-PROYECTO')) {
    console.warn('config.js todavía tiene los valores de ejemplo. Pega la URL y la anon key de tu proyecto.');
  }

  // window.db es el cliente que usa toda la app.
  window.db = window.supabase.createClient(
    window.CONFIG.SUPABASE_URL,
    window.CONFIG.SUPABASE_ANON_KEY,
    { auth: { persistSession: true, autoRefreshToken: true } }
  );
})();
