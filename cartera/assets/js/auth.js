/* ==========================================================================
   auth.js — Sesión y rutas de entrada.
   ========================================================================== */

window.Auth = (function () {

  const INICIO = {
    director: 'director/dashboard.html',
    agente:   'agente/dashboard.html',
  };

  async function entrar(email, password) {
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      // Mensaje neutro: no revelamos si el correo existe o no.
      throw new Error('Correo o contraseña incorrectos.');
    }
    const usuario = await API.miUsuario();
    if (!usuario) {
      await db.auth.signOut();
      throw new Error('Tu cuenta existe pero no está dada de alta en el equipo. Contacta a tu director.');
    }
    if (!usuario.activo) {
      await db.auth.signOut();
      throw new Error('Tu cuenta está desactivada. Contacta a tu director.');
    }
    return usuario;
  }

  async function salir(base) {
    await db.auth.signOut();
    location.href = (base || '') + 'index.html';
  }

  const rutaInicio = (rol) => INICIO[rol] || 'index.html';

  return { entrar, salir, rutaInicio, INICIO };
})();
