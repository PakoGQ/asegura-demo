/* ==========================================================================
   app.js — Arranque común de todas las pantallas internas.

   Cada página llama a App.iniciar({ rol, activo }) y recibe el usuario ya
   validado. App se encarga de: sesión, guardia por rol, header y navegación.
   ========================================================================== */

window.App = (function () {

  const NAV = {
    director: [
      { href: 'dashboard.html',     icono: '📊', label: 'Panel',     clave: 'dashboard' },
      { href: 'equipo.html',        icono: '👥', label: 'Equipo',    clave: 'equipo' },
      { href: 'cartera.html',       icono: '📁', label: 'Cartera',   clave: 'cartera' },
      { href: 'vencimientos.html',  icono: '⏰', label: 'Vencen',    clave: 'vencimientos' },
      { href: 'oportunidades.html', icono: '💡', label: 'Oportun.',  clave: 'oportunidades' },
    ],
    agente: [
      // "Registrar actividad" no está aquí a propósito: es una acción, no una
      // sección, y vive en el botón flotante — que además queda bajo el pulgar.
      { href: 'dashboard.html',     icono: '📊', label: 'Mi día',   clave: 'dashboard' },
      { href: 'cartera.html',       icono: '📁', label: 'Cartera',  clave: 'cartera' },
      { href: 'clientes.html',      icono: '👤', label: 'Clientes', clave: 'clientes' },
      { href: 'vencimientos.html',  icono: '⏰', label: 'Vencen',   clave: 'vencimientos' },
      { href: 'oportunidades.html', icono: '💡', label: 'Oportun.', clave: 'oportunidades' },
    ],
  };

  let _usuario = null;

  /* Las pantallas viven en /director/ y /agente/, un nivel bajo la raíz. */
  const BASE = '../';

  function pintarShell(usuario, claveActiva) {
    const items = (NAV[usuario.rol] || []).map((i) => `
      <a href="${i.href}" class="${i.clave === claveActiva ? 'activo' : ''}">
        <span class="icono">${i.icono}</span><span>${i.label}</span>
      </a>`).join('');

    const shell = `
      <header class="encabezado">
        <div class="encabezado-inner">
          <div class="marca">${UI.esc(CONFIG.NOMBRE_SISTEMA)} <span>${UI.esc(CONFIG.ASEGURADORA_DEFAULT)}</span></div>
          <div class="quien">
            <b>${UI.esc(usuario.nombre)}</b>
            ${usuario.rol === 'director' ? 'Director' : 'Agente'}
          </div>
          <button class="btn chico" id="btn-salir" type="button">Salir</button>
        </div>
      </header>
      <nav class="nav">${items}</nav>`;

    document.body.insertAdjacentHTML('afterbegin', shell);
    UI.$('#btn-salir').addEventListener('click', () => Auth.salir(BASE));

    // Botón flotante de captura rápida: el agente registra un contacto desde
    // cualquier pantalla sin perder dónde estaba.
    if (usuario.rol === 'agente' && claveActiva !== 'actividad') {
      document.body.insertAdjacentHTML('beforeend',
        `<a class="fab" href="actividad.html" aria-label="Registrar actividad">
           <span aria-hidden="true">➕</span>
         </a>`);
    }
  }

  /**
   * @param {object} opciones
   * @param {'director'|'agente'} opciones.rol  rol exigido por la pantalla
   * @param {string} opciones.activo            clave del ítem de nav activo
   * @returns {Promise<object|null>} el usuario, o null si hubo redirección
   */
  async function iniciar({ rol, activo }) {
    const { data: sesion } = await db.auth.getSession();
    if (!sesion || !sesion.session) {
      location.replace(BASE + 'index.html');
      return null;
    }

    _usuario = await API.miUsuario();
    if (!_usuario || !_usuario.activo) {
      await db.auth.signOut();
      location.replace(BASE + 'index.html');
      return null;
    }

    // Guardia de rol en el cliente: es comodidad de navegación, no seguridad.
    // Lo que de verdad protege los datos es el RLS de Postgres.
    if (rol && _usuario.rol !== rol) {
      location.replace(BASE + Auth.rutaInicio(_usuario.rol));
      return null;
    }

    pintarShell(_usuario, activo);
    return _usuario;
  }

  return {
    iniciar,
    get usuario() { return _usuario; },
    BASE,
  };
})();
