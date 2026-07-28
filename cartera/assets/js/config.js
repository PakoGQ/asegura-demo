/* ==========================================================================
   config.js — Único archivo a tocar al conectar un proyecto de Supabase.

   La ANON KEY es pública por diseño (va en el navegador): la seguridad real
   la da el RLS de 02_rls.sql. La SERVICE ROLE KEY jamás debe aparecer aquí
   ni en ningún archivo de este repositorio.
   ========================================================================== */

window.CONFIG = {
  // Mismo proyecto que supabase-config.js del sitio principal, a propósito:
  // supabase-js guarda la sesión en localStorage bajo una llave derivada del
  // ref del proyecto. Al coincidir URL y origen, la sesión abierta en el panel
  // se ve desde aquí y la cartera ya no vuelve a pedir login.
  SUPABASE_URL: 'https://jfkcnapduonxjlknxnku.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_EyHU1a4VbNUEDR5pYZ8Fyw_29r9PWKr',

  // [GNP] Específico del cliente beta — cambiar al replicar
  ASEGURADORA_DEFAULT: 'GNP',
  NOMBRE_SISTEMA: 'Cartera',

  // Umbrales de las pantallas de vencimientos (días)
  VENTANAS_VENCIMIENTO: [30, 60, 90],
};
