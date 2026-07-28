/* ==========================================================================
   config.js — Único archivo a tocar al conectar un proyecto de Supabase.

   La ANON KEY es pública por diseño (va en el navegador): la seguridad real
   la da el RLS de 02_rls.sql. La SERVICE ROLE KEY jamás debe aparecer aquí
   ni en ningún archivo de este repositorio.
   ========================================================================== */

window.CONFIG = {
  SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',
  SUPABASE_ANON_KEY: 'TU_ANON_KEY_AQUI',

  // [GNP] Específico del cliente beta — cambiar al replicar
  ASEGURADORA_DEFAULT: 'GNP',
  NOMBRE_SISTEMA: 'Cartera',

  // Umbrales de las pantallas de vencimientos (días)
  VENTANAS_VENCIMIENTO: [30, 60, 90],
};
