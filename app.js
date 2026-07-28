/* ==========================================================================
   app.js — Lógica del sitio público.

   Todo vive en un archivo y sin build step, como el proyecto de referencia
   del que se portó la arquitectura.

   El login va por Supabase Auth desde el día uno: no hay credenciales
   escritas en este archivo ni en ningún otro del repositorio.
   ========================================================================== */

/* ===========================================================================
   1. Catálogos — espejo de los CHECK de db/. Si cambia uno, cambia el otro.
   =========================================================================== */
const RAMOS = {
  auto:           { label: 'Auto',            icono: 'fa-car',            color: '#fe6031' },
  vida:           { label: 'Vida',            icono: 'fa-heart-pulse',    color: '#1f6f8b' },
  gastos_medicos: { label: 'Gastos Médicos',  icono: 'fa-kit-medical',    color: '#2e9e7e' },
  hogar:          { label: 'Hogar',           icono: 'fa-house-chimney',  color: '#7c5cbf' },
  empresarial:    { label: 'Empresarial',     icono: 'fa-building',       color: '#00224f' },
  educativo:      { label: 'Educativo',       icono: 'fa-graduation-cap', color: '#d9a520' },
  fianzas:        { label: 'Fianzas',         icono: 'fa-file-signature', color: '#9c6644' },
};

const MODALIDADES = {
  oficina:      { label: 'En oficina',    icono: 'fa-briefcase' },
  domicilio:    { label: 'A domicilio',   icono: 'fa-house' },
  videollamada: { label: 'Videollamada',  icono: 'fa-video' },
  cafe:         { label: 'En un café',    icono: 'fa-mug-hot' },
};

/* Estado global del sitio */
let AGENTES = [];
let UBICACION_CLIENTE = null;   // {lat, lng} — solo en memoria, nunca se guarda

/* ===========================================================================
   2. Utilidades
   =========================================================================== */
const $  = (s, c) => (c || document).querySelector(s);
const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));

/* Escapa todo lo que venga de la base antes de meterlo en innerHTML. */
function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showToast(msg, tipo) {
  const cont = $('#toastContainer');
  if (!cont) { console.log(msg); return; }
  const el = document.createElement('div');
  // El CSS portado define .toast.info / .toast.error / .toast.success,
  // sin prefijo. Con `toast-info` el borde de color nunca se pintaba.
  el.className = 'toast ' + (tipo || 'info');
  el.innerHTML = `<i class="fas fa-${tipo === 'error' ? 'circle-exclamation' : 'circle-check'}"></i> ${esc(msg)}`;
  cont.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 3200);
}

function openModal(id)  { const m = $('#' + id); if (m) m.classList.add('active'); }
function closeModal(id) { const m = $('#' + id); if (m) m.classList.remove('active'); }

function togglePassword(btn) {
  const input = btn.parentElement.querySelector('input');
  const icono = btn.querySelector('i');
  const oculto = input.type === 'password';
  input.type = oculto ? 'text' : 'password';
  icono.className = oculto ? 'fas fa-eye-slash' : 'fas fa-eye';
}

const waLink = (tel, texto) => {
  if (!tel) return null;
  const num = String(tel).replace(/\D/g, '');
  return num ? `https://wa.me/${num}${texto ? '?text=' + encodeURIComponent(texto) : ''}` : null;
};

const estrellas = (n) => {
  const llenas = Math.round(Number(n) || 0);
  return '★'.repeat(llenas) + '☆'.repeat(5 - llenas);
};

/* Distancia en km entre dos coordenadas (Haversine).
   Se calcula en el navegador: la ubicación del cliente no toca la base. */
function distanciaKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => v === null || v === undefined)) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ===========================================================================
   3. Datos — Supabase con respaldo demo
   =========================================================================== */

/* Los mismos cuatro agentes de db/99_seed_demo.sql, para que la página se vea
   igual con o sin base conectada. */
const AGENTES_DEMO = [
  {
    id: 'demo-1', slug: 'ana-ramirez', nombre: 'Ana Ramírez',
    foto: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Especialista en Gastos Médicos Mayores',
    descripcion: 'Doce años ayudando a familias a entender qué cubre realmente su póliza. Explico sin tecnicismos y acompaño el trámite completo cuando hay siniestro.',
    cedula: 'A1-448210', anios_experiencia: 12, ciudad: 'Guadalajara', zona: 'Providencia',
    lat: 20.71, lng: -103.39, whatsapp: '523310000002',
    ramos: ['gastos_medicos', 'vida', 'auto', 'hogar'],
    especialidades: ['gastos_medicos', 'vida'],
    modalidades: ['oficina', 'domicilio', 'videollamada'],
    idiomas: ['Español', 'Inglés'],
    disponible: true, verificado: true, es_destacado: true, top10: true, es_nuevo: false,
    calificacion: 4.7, num_resenas: 3, num_citas: 148,
  },
  {
    id: 'demo-2', slug: 'luis-torres', nombre: 'Luis Torres',
    foto: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Autos y flotillas empresariales',
    descripcion: 'Atiendo principalmente autos y flotillas. Si tienes más de tres unidades, casi siempre hay una mejor forma de asegurarlas de la que ya tienes contratada.',
    cedula: 'A2-119874', anios_experiencia: 7, ciudad: 'Guadalajara', zona: 'Chapultepec',
    lat: 20.68, lng: -103.37, whatsapp: '523310000003',
    ramos: ['auto', 'empresarial', 'hogar'],
    especialidades: ['auto', 'empresarial'],
    modalidades: ['oficina', 'domicilio'],
    idiomas: ['Español'],
    disponible: true, verificado: true, es_destacado: false, top10: false, es_nuevo: false,
    calificacion: 4.5, num_resenas: 2, num_citas: 96,
  },
  {
    id: 'demo-3', slug: 'sofia-beltran', nombre: 'Sofía Beltrán',
    foto: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Seguros empresariales y fianzas',
    descripcion: 'Quince años en el ramo empresarial. Trabajo con constructoras y transportistas: responsabilidad civil, fianzas de cumplimiento y coberturas de flotilla.',
    cedula: 'A1-772305', anios_experiencia: 15, ciudad: 'Zapopan', zona: 'Andares',
    lat: 20.71, lng: -103.416, whatsapp: '523310000004',
    ramos: ['empresarial', 'fianzas', 'auto', 'gastos_medicos'],
    especialidades: ['empresarial', 'fianzas'],
    modalidades: ['oficina', 'videollamada'],
    idiomas: ['Español', 'Inglés'],
    disponible: false, verificado: true, es_destacado: true, top10: false, es_nuevo: false,
    calificacion: 5.0, num_resenas: 1, num_citas: 203,
  },
  {
    id: 'demo-4', slug: 'miguel-aguirre', nombre: 'Miguel Aguirre',
    foto: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Vida y ahorro educativo',
    descripcion: 'Me enfoco en planes de vida y ahorro para la universidad de los hijos. Explico los números completos, incluyendo lo que no conviene.',
    cedula: 'A1-905611', anios_experiencia: 3, ciudad: 'Guadalajara', zona: 'Tlaquepaque',
    lat: 20.64, lng: -103.312, whatsapp: '523310000005',
    ramos: ['vida', 'educativo', 'gastos_medicos'],
    especialidades: ['vida', 'educativo'],
    modalidades: ['oficina', 'domicilio', 'videollamada', 'cafe'],
    idiomas: ['Español'],
    disponible: true, verificado: false, es_destacado: false, top10: false, es_nuevo: true,
    calificacion: 5.0, num_resenas: 1, num_citas: 21,
  },
];

async function cargarAgentes() {
  if (!window.sbClient) { AGENTES = AGENTES_DEMO; return AGENTES; }
  try {
    const { data, error } = await sbClient
      .from('v_agentes_publico')
      .select('*')
      .order('es_destacado', { ascending: false })
      .order('calificacion', { ascending: false });
    if (error) throw error;
    AGENTES = (data && data.length) ? data : AGENTES_DEMO;
  } catch (e) {
    console.warn('No se pudo leer de Supabase, usando datos demo:', e.message);
    AGENTES = AGENTES_DEMO;
  }
  return AGENTES;
}

/* ===========================================================================
   4. Hero con slides
   =========================================================================== */
function buildHero() {
  const wrap = $('#heroSlides');
  const dots = $('#heroDots');
  if (!wrap) return;

  const destacados = AGENTES.filter((a) => a.es_destacado).slice(0, 2);
  const slides = [];

  // Slide 1 — marca
  slides.push(`
    <div class="hero-slide hs-marca activa">
      <div class="hs-bg"></div>
      <div class="hs-inner">
        <p class="hs-label">${esc([CONFIG.ASEGURADORA, CONFIG.CIUDAD].filter(Boolean).join(' · '))}</p>
        <h1 class="hs-titulo">Encuentra al agente<br><span class="acento">que sí te explica</span></h1>
        <p class="hs-desc">Agentes con cédula vigente, cerca de ti. Ve su perfil,
           lee lo que dicen sus clientes y agenda una asesoría sin costo.</p>
        <div class="hs-acciones">
          <a href="agentes.html" class="btn btn-acento btn-lg"><i class="fas fa-users"></i> Ver agentes</a>
          <button class="btn btn-outline btn-lg" onclick="buscarCerca()">
            <i class="fas fa-location-crosshairs"></i> Cerca de mí
          </button>
        </div>
      </div>
    </div>`);

  // Slides 2-3 — agentes destacados
  destacados.forEach((a) => {
    const ramos = (a.especialidades || a.ramos || []).slice(0, 2)
      .map((r) => (RAMOS[r] || {}).label).filter(Boolean).join(' · ');
    slides.push(`
      <div class="hero-slide hs-agente">
        <div class="hs-bg" style="background-image:url('${esc(a.foto)}')"></div>
        <div class="hs-inner">
          <p class="hs-label">${a.verificado ? '<i class="fas fa-circle-check"></i> Cédula verificada' : 'Agente'}</p>
          <h2 class="hs-titulo">${esc(a.nombre)}</h2>
          <p class="hs-desc">${esc(a.titulo || '')}${ramos ? ' — ' + esc(ramos) : ''}<br>
             <span class="hs-meta">${esc(a.zona || '')} · ${a.anios_experiencia || 0} años de experiencia
             · ${estrellas(a.calificacion)} ${Number(a.calificacion).toFixed(1)}</span></p>
          <div class="hs-acciones">
            <a href="perfil.html?a=${esc(a.slug)}" class="btn btn-acento btn-lg">
              <i class="fas fa-calendar-check"></i> Agendar con ${esc(a.nombre.split(' ')[0])}
            </a>
          </div>
        </div>
      </div>`);
  });

  // Slide 4 — asesoría sin costo
  slides.push(`
    <div class="hero-slide hs-agenda">
      <div class="hs-bg"></div>
      <div class="hs-inner">
        <p class="hs-label">Sin costo y sin compromiso</p>
        <h2 class="hs-titulo">Una asesoría de 45 minutos<br><span class="acento">te puede ahorrar años</span></h2>
        <p class="hs-desc">En oficina, en tu domicilio o por videollamada. Tú eliges
           dónde, cuándo y con quién.</p>
        <div class="hs-acciones">
          <a href="agentes.html" class="btn btn-acento btn-lg"><i class="fas fa-calendar-days"></i> Agendar ahora</a>
        </div>
      </div>
    </div>`);

  wrap.innerHTML = slides.join('');
  if (dots) {
    dots.innerHTML = slides.map((_, i) =>
      `<button class="hero-dot ${i === 0 ? 'activo' : ''}" data-i="${i}" aria-label="Slide ${i + 1}"></button>`
    ).join('');
    dots.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b) irASlide(Number(b.dataset.i));
    });
  }
  iniciarCarrusel();
}

let heroIndex = 0;
let heroTimer = null;

function irASlide(i) {
  const slides = $$('.hero-slide');
  if (!slides.length) return;
  heroIndex = (i + slides.length) % slides.length;
  slides.forEach((s, n) => s.classList.toggle('activa', n === heroIndex));
  $$('.hero-dot').forEach((d, n) => d.classList.toggle('activo', n === heroIndex));
  reiniciarCarrusel();
}

function iniciarCarrusel() {
  reiniciarCarrusel();
  // Se pausa al pasar el mouse: nada peor que leer y que la slide se vaya.
  const hero = $('#hero');
  if (hero) {
    hero.addEventListener('mouseenter', () => clearInterval(heroTimer));
    hero.addEventListener('mouseleave', reiniciarCarrusel);
  }
}

function reiniciarCarrusel() {
  clearInterval(heroTimer);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  heroTimer = setInterval(() => irASlide(heroIndex + 1), 7000);
}

/* ===========================================================================
   5. Galería de agentes en la portada
   =========================================================================== */
function buildGaleriaAgentes() {
  const el = $('#agenteGallery');
  if (!el) return;

  const lista = AGENTES.slice(0, 6);
  const cuenta = $('#statsCount');
  if (cuenta) cuenta.textContent = AGENTES.length;
  if (!lista.length) return;

  el.innerHTML = lista.map((a) => {
    const ramos = (a.ramos || []).slice(0, 3)
      .map((r) => `<span class="ag-ramo">${esc((RAMOS[r] || {}).label || r)}</span>`).join('');
    const dist = UBICACION_CLIENTE
      ? distanciaKm(UBICACION_CLIENTE.lat, UBICACION_CLIENTE.lng, a.lat, a.lng) : null;
    return `
      <a class="gal-item" href="perfil.html?a=${esc(a.slug)}">
        <img class="gal-img gal-active" src="${esc(a.foto)}" alt="${esc(a.nombre)}" loading="lazy" />
        <div class="gal-info">
          <div class="gal-name">${esc(a.nombre)}
            ${a.verificado ? '<i class="fas fa-circle-check ag-ver" title="Cédula verificada"></i>' : ''}
          </div>
          <div class="ag-meta">
            ${esc(a.zona || a.ciudad || '')}
            ${dist !== null ? ` · a ${dist.toFixed(1)} km` : ''}
            · ${estrellas(a.calificacion)}
          </div>
          <div class="ag-ramos">${ramos}</div>
          <div class="gal-status">
            <span class="gal-dot ${a.disponible ? '' : 'off'}"></span>
            <span>${a.disponible ? 'Disponible hoy' : 'Con agenda ocupada'}</span>
          </div>
          <span class="gal-ver">Ver perfil <i class="fas fa-arrow-right" style="font-size:.6rem"></i></span>
        </div>
      </a>`;
  }).join('');
}

/* ===========================================================================
   6. Buscador y geolocalización
   =========================================================================== */
function buildFiltrosBusqueda() {
  const selRamo = $('#searchRamo');
  if (selRamo) {
    selRamo.innerHTML = '<option value="">Todos los ramos</option>' +
      Object.entries(RAMOS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  }
  const selZona = $('#searchZona');
  if (selZona) {
    selZona.innerHTML = CONFIG.ZONAS
      .map((z, i) => `<option value="${i === 0 ? '' : esc(z)}">${esc(z)}</option>`).join('');
  }
  const chips = $('#zonaChips');
  if (chips) {
    chips.innerHTML = CONFIG.ZONAS.map((z, i) =>
      `<a class="city-chip ${i === 0 ? 'activo' : ''}" href="agentes.html${i === 0 ? '' : '?zona=' + encodeURIComponent(z)}">${esc(z)}</a>`
    ).join('');
  }
}

/* Pide ubicación solo cuando el visitante la pide. Si la niega, no se insiste
   ni se bloquea nada: el filtro por zona sigue ahí. */
function buscarCerca() {
  if (!navigator.geolocation) {
    showToast('Tu navegador no permite ubicación. Filtra por zona.', 'error');
    location.href = 'agentes.html';
    return;
  }
  showToast('Buscando agentes cerca de ti…');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      UBICACION_CLIENTE = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      // Viaja en la URL solo para esta navegación; no se guarda en la base.
      location.href = `agentes.html?orden=cerca&lat=${UBICACION_CLIENTE.lat.toFixed(5)}` +
                      `&lng=${UBICACION_CLIENTE.lng.toFixed(5)}`;
    },
    () => {
      showToast('Sin ubicación no hay problema: elige tu zona.', 'error');
      location.href = 'agentes.html';
    },
    { timeout: 8000, maximumAge: 300000 }
  );
}

function onBuscar(ev) {
  ev.preventDefault();
  const p = new URLSearchParams();
  const q = $('#searchInput') ? $('#searchInput').value.trim() : '';
  const ramo = $('#searchRamo') ? $('#searchRamo').value : '';
  const zona = $('#searchZona') ? $('#searchZona').value : '';
  if (q) p.set('q', q);
  if (ramo) p.set('ramo', ramo);
  if (zona) p.set('zona', zona);
  location.href = 'agentes.html' + (p.toString() ? '?' + p : '');
}

/* ===========================================================================
   7. Navegación móvil
   =========================================================================== */
function initNav() {
  const btn = $('#navMenuBtn');
  const drawer = $('#mobileDrawer');
  const overlay = $('#mobileDrawerOverlay');
  const cerrar = $('#mobileDrawerClose');
  if (!btn || !drawer) return;

  const abrir = (si) => {
    // El CSS portado usa `.open` para el estado abierto del drawer.
    drawer.classList.toggle('open', si);
    if (overlay) overlay.classList.toggle('open', si);
    btn.setAttribute('aria-expanded', String(si));
    drawer.setAttribute('aria-hidden', String(!si));
    document.body.style.overflow = si ? 'hidden' : '';
  };

  btn.addEventListener('click', () => abrir(!drawer.classList.contains('open')));
  if (cerrar)  cerrar.addEventListener('click', () => abrir(false));
  if (overlay) overlay.addEventListener('click', () => abrir(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') abrir(false); });

  const toggle = $('#searchToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const wrap = $('.search-bar-wrap');
      const abierto = wrap.classList.toggle('abierto');
      toggle.setAttribute('aria-expanded', String(abierto));
      if (abierto && $('#searchInput')) $('#searchInput').focus();
    });
  }
}

/* ===========================================================================
   8. Sesión — Supabase Auth
   =========================================================================== */
const RUTA_INICIO = { director: 'panel-director.html', agente: 'panel-agente.html' };

async function doLogin() {
  const err   = $('#loginError');
  const email = $('#loginEmail').value.trim();
  const pass  = $('#loginPass').value;

  const fallar = (msg) => {
    if (err) { err.style.display = 'block'; err.querySelector('span').textContent = msg; }
  };
  if (err) err.style.display = 'none';

  if (!window.sbClient) {
    fallar('La base todavía no está conectada. Falta pegar la URL y la anon key en supabase-config.js.');
    return;
  }
  if (!email || !pass) { fallar('Escribe tu correo y tu contraseña.'); return; }

  const { error } = await sbClient.auth.signInWithPassword({ email, password: pass });
  if (error) { fallar('Correo o contraseña incorrectos.'); return; }

  const { data: sesion } = await sbClient.auth.getUser();
  const { data: usuario } = await sbClient
    .from('usuarios').select('rol, activo')
    .eq('auth_user_id', sesion.user.id).maybeSingle();

  if (!usuario)        { await sbClient.auth.signOut(); fallar('Tu cuenta no está dada de alta en ningún equipo.'); return; }
  if (!usuario.activo) { await sbClient.auth.signOut(); fallar('Tu cuenta está desactivada. Contacta a tu director.'); return; }

  location.href = RUTA_INICIO[usuario.rol] || 'index.html';
}

/* ===========================================================================
   9. Arranque
   =========================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  initNav();
  buildFiltrosBusqueda();

  const form = $('#searchForm');
  if (form) form.addEventListener('submit', onBuscar);

  await cargarAgentes();

  // Cada init se protege buscando su propio elemento: el mismo app.js sirve
  // para todas las páginas, igual que en el proyecto de referencia.
  buildHero();
  buildGaleriaAgentes();
  initDirectorio();
  initRamos();
  initPostular();
  await initPerfil();
  inyectarAvisoDemo();
  inyectarDemoLogin();
  await initPanelDirector();
  await initPanelAgente();

  // Marca en el navbar y el footer desde config: se cambia en un solo lugar.
  $$('[data-marca]').forEach((el) => { el.textContent = CONFIG.MARCA; });
  $$('[data-tagline]').forEach((el) => { el.textContent = CONFIG.TAGLINE; });
  $$('[data-wa-central]').forEach((el) => {
    el.href = waLink(CONFIG.WHATSAPP_CENTRAL, 'Hola, quiero información sobre seguros.');
  });
});

/* ===========================================================================
   10. Directorio de agentes (agentes.html)
   =========================================================================== */
const FILTROS = { q: '', zona: '', ramo: '', modalidad: '', disponible: '',
                  rating: '', distancia: '', orden: 'destacados' };

function initDirectorio() {
  const grid = $('#dirGrid');
  if (!grid) return;

  // La portada manda aquí con los filtros ya elegidos.
  const p = new URLSearchParams(location.search);
  FILTROS.q     = p.get('q') || '';
  FILTROS.zona  = p.get('zona') || '';
  FILTROS.ramo  = p.get('ramo') || '';
  FILTROS.orden = p.get('orden') || 'destacados';
  if (p.get('lat') && p.get('lng')) {
    UBICACION_CLIENTE = { lat: Number(p.get('lat')), lng: Number(p.get('lng')) };
  }

  $('#fZona').innerHTML = CONFIG.ZONAS
    .map((z, i) => `<option value="${i === 0 ? '' : esc(z)}">${i === 0 ? 'Todas las zonas' : esc(z)}</option>`).join('');
  $('#fRamo').innerHTML = '<option value="">Todos los seguros</option>' +
    Object.entries(RAMOS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  $('#fModalidad').innerHTML = '<option value="">Cualquier modalidad</option>' +
    Object.entries(MODALIDADES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');

  $('#dirBusqueda').value = FILTROS.q;
  $('#fZona').value = FILTROS.zona;
  $('#fRamo').value = FILTROS.ramo;
  $('#ordenSel').value = FILTROS.orden;

  const sync = (sel, campo) => {
    const el = $(sel);
    if (el) el.addEventListener('change', () => { FILTROS[campo] = el.value; pintarDirectorio(); });
  };
  sync('#fZona', 'zona'); sync('#fRamo', 'ramo'); sync('#fModalidad', 'modalidad');
  sync('#fDisponible', 'disponible'); sync('#fRating', 'rating');
  sync('#fDistancia', 'distancia'); sync('#ordenSel', 'orden');

  let t;
  $('#dirBusqueda').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => { FILTROS.q = e.target.value.trim(); pintarDirectorio(); }, 250);
  });

  $('#btnLimpiar').addEventListener('click', limpiarFiltros);
  $('#btnCerca').addEventListener('click', pedirUbicacion);

  $('#dirChips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-quitar]');
    if (!chip) return;
    FILTROS[chip.dataset.quitar] = '';
    const sel = { zona: '#fZona', ramo: '#fRamo', modalidad: '#fModalidad',
                  disponible: '#fDisponible', rating: '#fRating',
                  distancia: '#fDistancia', q: '#dirBusqueda' }[chip.dataset.quitar];
    if (sel && $(sel)) $(sel).value = '';
    pintarDirectorio();
  });

  grid.addEventListener('click', (e) => {
    const ojo = e.target.closest('[data-quick]');
    if (ojo) { e.preventDefault(); abrirVistaRapida(ojo.dataset.quick); }
  });

  if (UBICACION_CLIENTE) $('#fDistancia').classList.remove('oculto');
  pintarDirectorio();
}

function limpiarFiltros() {
  Object.keys(FILTROS).forEach((k) => { FILTROS[k] = k === 'orden' ? 'destacados' : ''; });
  ['#fZona', '#fRamo', '#fModalidad', '#fDisponible', '#fRating', '#fDistancia', '#dirBusqueda']
    .forEach((s) => { if ($(s)) $(s).value = ''; });
  if ($('#ordenSel')) $('#ordenSel').value = 'destacados';
  pintarDirectorio();
}

function pedirUbicacion() {
  if (!navigator.geolocation) { showToast('Tu navegador no permite ubicación.', 'error'); return; }
  const btn = $('#btnCerca');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      UBICACION_CLIENTE = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      FILTROS.orden = 'cerca';
      $('#ordenSel').value = 'cerca';
      $('#fDistancia').classList.remove('oculto');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-location-crosshairs"></i> Cerca de mí';
      showToast('Listo, ordenado por distancia.');
      pintarDirectorio();
    },
    () => {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-location-crosshairs"></i> Cerca de mí';
      // Sin ubicación no se bloquea nada: la zona sigue siendo el filtro real.
      showToast('Sin ubicación: filtra por zona y funciona igual.', 'error');
    },
    { timeout: 8000, maximumAge: 300000 }
  );
}

function agentesFiltrados() {
  let lista = AGENTES.slice();

  if (FILTROS.q) {
    const q = FILTROS.q.toLowerCase();
    lista = lista.filter((a) =>
      (a.nombre || '').toLowerCase().includes(q) ||
      (a.titulo || '').toLowerCase().includes(q) ||
      (a.zona || '').toLowerCase().includes(q) ||
      (a.ramos || []).some((r) => (RAMOS[r] || {}).label.toLowerCase().includes(q)));
  }
  if (FILTROS.zona)       lista = lista.filter((a) => a.zona === FILTROS.zona);
  if (FILTROS.ramo)       lista = lista.filter((a) => (a.ramos || []).includes(FILTROS.ramo));
  if (FILTROS.modalidad)  lista = lista.filter((a) => (a.modalidades || []).includes(FILTROS.modalidad));
  if (FILTROS.disponible) lista = lista.filter((a) => a.disponible);
  if (FILTROS.rating)     lista = lista.filter((a) => Number(a.calificacion) >= Number(FILTROS.rating));

  // La distancia solo existe si el visitante compartió su ubicación.
  if (UBICACION_CLIENTE) {
    lista.forEach((a) => {
      a._km = distanciaKm(UBICACION_CLIENTE.lat, UBICACION_CLIENTE.lng, a.lat, a.lng);
    });
    if (FILTROS.distancia) {
      lista = lista.filter((a) => a._km !== null && a._km <= Number(FILTROS.distancia));
    }
  }

  const orden = {
    cerca:       (a, b) => (a._km ?? 9e9) - (b._km ?? 9e9),
    rating:      (a, b) => b.calificacion - a.calificacion,
    citas:       (a, b) => (b.num_citas || 0) - (a.num_citas || 0),
    nuevos:      (a, b) => (b.es_nuevo ? 1 : 0) - (a.es_nuevo ? 1 : 0),
    experiencia: (a, b) => (b.anios_experiencia || 0) - (a.anios_experiencia || 0),
    destacados:  (a, b) => (b.es_destacado ? 1 : 0) - (a.es_destacado ? 1 : 0) ||
                           b.calificacion - a.calificacion,
  }[FILTROS.orden];

  // Ordenar por cercanía sin ubicación no significa nada: se avisa y se ignora.
  if (FILTROS.orden === 'cerca' && !UBICACION_CLIENTE) {
    return lista.sort(orden ? orden : () => 0);
  }
  return lista.sort(orden);
}

function tarjetaAgente(a) {
  const ramos = (a.ramos || []).slice(0, 3)
    .map((r) => `<span class="pill pill-sm">${esc((RAMOS[r] || {}).label || r)}</span>`).join('');
  const km = a._km !== null && a._km !== undefined
    ? `<span class="dir-km"><i class="fas fa-location-dot"></i> a ${a._km.toFixed(1)} km</span>` : '';

  return `
    <article class="agente-card">
      <a class="agente-card-img-wrap" href="perfil.html?a=${esc(a.slug)}">
        <img class="agente-card-img" src="${esc(a.foto)}" alt="${esc(a.nombre)}" loading="lazy" />
        <div class="card-top-status">
          ${a.disponible ? '<span class="pill pill-ok"><span class="punto"></span> Disponible</span>'
                         : '<span class="pill pill-off">Agenda ocupada</span>'}
          ${a.es_nuevo ? '<span class="pill pill-acento">Nuevo</span>' : ''}
        </div>
        <button class="card-quick" data-quick="${esc(a.slug)}" aria-label="Vista rápida de ${esc(a.nombre)}">
          <i class="fas fa-eye"></i>
        </button>
      </a>
      <div class="agente-card-body">
        <a class="agente-card-name" href="perfil.html?a=${esc(a.slug)}">${esc(a.nombre)}
          ${a.verificado ? '<i class="fas fa-circle-check ver-badge" title="Cédula verificada"></i>' : ''}
        </a>
        <p class="agente-card-desc">${esc(a.titulo || '')}</p>
        <div class="agente-card-meta">
          <span><i class="fas fa-location-dot"></i> ${esc(a.zona || a.ciudad || '')}</span>
          <span class="agente-card-rate">${estrellas(a.calificacion)}
            <b>${Number(a.calificacion).toFixed(1)}</b>
            <small>(${a.num_resenas || 0})</small></span>
        </div>
        ${km}
        <div class="agente-card-tags">${ramos}</div>
        <div class="agente-card-footer">
          <span class="dir-exp"><i class="fas fa-id-card"></i> ${a.anios_experiencia || 0} años</span>
          <a class="btn btn-acento btn-sm" href="perfil.html?a=${esc(a.slug)}">
            <i class="fas fa-calendar-check"></i> Agendar
          </a>
        </div>
      </div>
    </article>`;
}

function pintarDirectorio() {
  const lista = agentesFiltrados();
  const grid = $('#dirGrid');
  const vacio = $('#dirVacio');

  $('#resultsCount').textContent = lista.length;
  grid.innerHTML = lista.map(tarjetaAgente).join('');
  vacio.classList.toggle('oculto', lista.length > 0);
  grid.classList.toggle('oculto', lista.length === 0);

  // Chips de lo que está filtrando ahora mismo, cada uno removible.
  const etiquetas = {
    q: FILTROS.q && `“${FILTROS.q}”`,
    zona: FILTROS.zona,
    ramo: FILTROS.ramo && (RAMOS[FILTROS.ramo] || {}).label,
    modalidad: FILTROS.modalidad && (MODALIDADES[FILTROS.modalidad] || {}).label,
    disponible: FILTROS.disponible && 'Disponibles ahora',
    rating: FILTROS.rating && `${FILTROS.rating}★ o más`,
    distancia: FILTROS.distancia && `hasta ${FILTROS.distancia} km`,
  };
  $('#dirChips').innerHTML = Object.entries(etiquetas)
    .filter(([, v]) => v)
    .map(([k, v]) => `<button class="dir-chip" data-quitar="${k}">${esc(v)} <i class="fas fa-times"></i></button>`)
    .join('');
}

function abrirVistaRapida(slug) {
  const a = AGENTES.find((x) => x.slug === slug);
  if (!a) return;
  const ramos = (a.ramos || [])
    .map((r) => `<span class="pill pill-sm">${esc((RAMOS[r] || {}).label || r)}</span>`).join('');
  const modos = (a.modalidades || [])
    .map((m) => `<li><i class="fas ${(MODALIDADES[m] || {}).icono}"></i> ${esc((MODALIDADES[m] || {}).label || m)}</li>`).join('');

  $('#quickBody').innerHTML = `
    <button class="modal-close" onclick="closeModal('quickModal')"><i class="fas fa-times"></i></button>
    <div class="quick-top">
      <img src="${esc(a.foto)}" alt="${esc(a.nombre)}" />
      <div>
        <h3>${esc(a.nombre)} ${a.verificado ? '<i class="fas fa-circle-check ver-badge"></i>' : ''}</h3>
        <p class="quick-titulo">${esc(a.titulo || '')}</p>
        <p class="quick-meta">
          <i class="fas fa-location-dot"></i> ${esc(a.zona || '')} ·
          ${a.anios_experiencia || 0} años · ${estrellas(a.calificacion)}
          ${Number(a.calificacion).toFixed(1)} (${a.num_resenas || 0})
        </p>
      </div>
    </div>
    <p class="quick-desc">${esc(a.descripcion || '')}</p>
    <div class="quick-bloque"><h4>Seguros que maneja</h4><div class="agente-card-tags">${ramos}</div></div>
    <div class="quick-bloque"><h4>Te puede atender</h4><ul class="quick-modos">${modos}</ul></div>
    <div class="quick-acciones">
      <a class="btn btn-acento w-full" href="perfil.html?a=${esc(a.slug)}">
        <i class="fas fa-calendar-check"></i> Ver perfil y agendar
      </a>
    </div>`;
  openModal('quickModal');
}

/* ===========================================================================
   11. Perfil del agente (perfil.html)
   =========================================================================== */

/* Reseñas de respaldo, espejo de db/99_seed_demo.sql. */
const RESENAS_DEMO = {
  'ana-ramirez': [
    { autor: 'Carlos M.',  calificacion: 5, texto: 'Ana me explicó punto por punto qué cubría y qué no. Es la primera vez que entiendo mi póliza.', dias: 12 },
    { autor: 'Patricia N.', calificacion: 5, texto: 'Me acompañó todo el trámite del siniestro. Contestaba el teléfono a las 10 de la noche.', dias: 34 },
    { autor: 'Eduardo L.', calificacion: 4, texto: 'Muy clara y honesta. Me dijo que no me convenía el plan que yo quería y me explicó por qué.', dias: 61 },
  ],
  'luis-torres': [
    { autor: 'Héctor V.',  calificacion: 5, texto: 'Nos reestructuró la flotilla y bajamos 18% la prima con la misma cobertura.', dias: 20 },
    { autor: 'Adriana C.', calificacion: 4, texto: 'Buen servicio, respondió rápido cada duda.', dias: 48 },
  ],
  'sofia-beltran': [
    { autor: 'Transportes del Bajío', calificacion: 5, texto: 'Manejó nuestras fianzas de cumplimiento sin un solo retraso en tres años.', dias: 15 },
  ],
  'miguel-aguirre': [
    { autor: 'Rodrigo P.', calificacion: 5, texto: 'Joven pero muy preparado. Me hizo números que nadie me había hecho.', dias: 8 },
  ],
};

/* Fotos de oficina genéricas para completar la galería mientras los agentes
   no suban las suyas. En producción salen de la tabla `fotos`. */
const FOTOS_APOYO = [
  'https://images.unsplash.com/photo-1497366216548-37526070297c?w=900&h=600&fit=crop&auto=format&q=75',
  'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=900&h=600&fit=crop&auto=format&q=75',
  'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=900&h=600&fit=crop&auto=format&q=75',
];

let PERFIL = null;
let GALERIA = [];
let fsIndex = 0;

const hace = (d) => d === 0 ? 'hoy' : d === 1 ? 'ayer'
  : d < 30 ? `hace ${d} días` : d < 60 ? 'hace un mes' : `hace ${Math.round(d / 30)} meses`;

async function initPerfil() {
  const root = $('#perfilRoot');
  if (!root) return;

  const slug = new URLSearchParams(location.search).get('a');
  PERFIL = AGENTES.find((a) => a.slug === slug) || AGENTES[0];

  if (!PERFIL) {
    root.innerHTML = `<div class="dir-vacio" style="margin:3rem 1.25rem">
      <i class="fas fa-user-slash"></i><h3>No encontramos ese agente</h3>
      <p>Puede que ya no esté publicado.</p>
      <a class="btn btn-acento btn-sm" href="agentes.html">Ver todos los agentes</a></div>`;
    return;
  }

  document.title = `${PERFIL.nombre} — agente de seguros en ${PERFIL.zona || PERFIL.ciudad} | Asegura`;
  GALERIA = [PERFIL.foto].concat(FOTOS_APOYO);

  const resenas = await cargarResenas(PERFIL);
  root.innerHTML = plantillaPerfil(PERFIL, resenas);
  activarPerfil();
}

async function cargarResenas(a) {
  if (!window.sbClient || String(a.id).startsWith('demo-')) {
    return (RESENAS_DEMO[a.slug] || []).map((r) => ({
      ...r, created_at: new Date(Date.now() - r.dias * 86400000).toISOString(),
    }));
  }
  try {
    const { data, error } = await sbClient
      .from('resenas').select('autor, calificacion, texto, created_at')
      .eq('agente_id', a.id).eq('aprobada', true)
      .order('created_at', { ascending: false }).limit(20);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn('Reseñas: usando respaldo demo.', e.message);
    return RESENAS_DEMO[a.slug] || [];
  }
}

function plantillaPerfil(a, resenas) {
  const ramos = (a.ramos || []).map((r) => {
    const info = RAMOS[r] || { label: r, icono: 'fa-shield' };
    const esp = (a.especialidades || []).includes(r);
    return `<li class="ramo-item ${esp ? 'especialidad' : ''}">
      <i class="fas ${info.icono}" style="color:${info.color || 'var(--acento)'}"></i>
      <span>${esc(info.label)}</span>
      ${esp ? '<span class="pill pill-acento pill-sm">Especialidad</span>' : ''}
    </li>`;
  }).join('');

  const modos = (a.modalidades || []).map((m) => {
    const info = MODALIDADES[m] || { label: m, icono: 'fa-circle' };
    return `<li><i class="fas ${info.icono}"></i> ${esc(info.label)}</li>`;
  }).join('');

  const prom = resenas.length
    ? (resenas.reduce((s, r) => s + r.calificacion, 0) / resenas.length) : Number(a.calificacion || 5);

  // Distribución 5→1 estrellas, para las barras
  const dist = [5, 4, 3, 2, 1].map((n) => {
    const c = resenas.filter((r) => r.calificacion === n).length;
    return { n, c, pct: resenas.length ? (c / resenas.length) * 100 : 0 };
  });

  const cercanos = AGENTES.filter((x) => x.slug !== a.slug).slice(0, 3).map((x) => `
    <a class="cercano" href="perfil.html?a=${esc(x.slug)}">
      <img src="${esc(x.foto)}" alt="${esc(x.nombre)}" />
      <div>
        <strong>${esc(x.nombre)}</strong>
        <span>${esc(x.zona || '')} · ${estrellas(x.calificacion)}</span>
      </div>
    </a>`).join('');

  const wa = waLink(a.whatsapp, `Hola ${a.nombre}, te vi en Asegura y quiero preguntarte sobre un seguro.`);

  return `
  <!-- Carrusel -->
  <section class="pf-hero">
    <div class="pf-hero-bg" style="background-image:url('${esc(GALERIA[0])}')"></div>
    <div class="pf-hero-inner">
      <img class="pf-foto" src="${esc(a.foto)}" alt="${esc(a.nombre)}" />
      <div class="pf-encabezado">
        <div class="pf-pills">
          ${a.disponible ? '<span class="pill pill-ok"><span class="punto"></span> Disponible hoy</span>'
                         : '<span class="pill pill-off">Agenda ocupada</span>'}
          ${a.verificado ? '<span class="pill pill-acento"><i class="fas fa-circle-check"></i> Cédula verificada</span>' : ''}
          ${a.top10 ? '<span class="pill pill-acento"><i class="fas fa-award"></i> Top del equipo</span>' : ''}
        </div>
        <h1 class="pf-nombre">${esc(a.nombre)}</h1>
        <p class="pf-titulo">${esc(a.titulo || '')}</p>
        <p class="pf-meta">
          <span><i class="fas fa-location-dot"></i> ${esc(a.zona || '')}, ${esc(a.ciudad || '')}</span>
          <span><i class="fas fa-id-card"></i> ${a.anios_experiencia || 0} años de experiencia</span>
          <span class="pf-rating">${estrellas(prom)} <b>${prom.toFixed(1)}</b>
            <small>(${resenas.length} reseñas)</small></span>
        </p>
        <div class="pf-acciones">
          <button class="btn btn-acento btn-lg" onclick="abrirAgendar()">
            <i class="fas fa-calendar-check"></i> Agendar asesoría
          </button>
          ${wa ? `<a class="btn btn-wa btn-lg" href="${esc(wa)}" target="_blank" rel="noopener">
            <i class="fab fa-whatsapp"></i> WhatsApp</a>` : ''}
        </div>
      </div>
    </div>
  </section>

  <div class="pf-layout">
    <div class="pf-main">

      <section class="pf-bloque">
        <h2>Sobre ${esc(a.nombre.split(' ')[0])}</h2>
        <p class="pf-desc">${esc(a.descripcion || '')}</p>
        <div class="pf-tags">
          ${(a.tags || []).map((t) => `<span class="pill pill-sm">${esc(t)}</span>`).join('')}
        </div>
      </section>

      <section class="pf-bloque">
        <h2>Galería</h2>
        <div class="pf-galeria">
          ${GALERIA.map((u, i) => `
            <button class="pf-thumb" onclick="abrirFullscreen(${i})" aria-label="Ver foto ${i + 1}">
              <img src="${esc(u)}" alt="" loading="lazy" />
            </button>`).join('')}
        </div>
      </section>

      <div class="pf-dos-col">
        <section class="pf-bloque">
          <h2>Seguros que maneja</h2>
          <ul class="ramo-lista">${ramos}</ul>
        </section>
        <section class="pf-bloque">
          <h2>Datos del agente</h2>
          <dl class="pf-datos">
            <div><dt>Cédula CNSF</dt><dd>${esc(a.cedula || 'En trámite')}</dd></div>
            <div><dt>Aseguradora</dt><dd>${esc((a.aseguradoras || ['Aseguradora demo']).join(', '))}</dd></div>
            <div><dt>Experiencia</dt><dd>${a.anios_experiencia || 0} años</dd></div>
            <div><dt>Idiomas</dt><dd>${esc((a.idiomas || []).join(', '))}</dd></div>
            <div><dt>Citas atendidas</dt><dd>${a.num_citas || 0}</dd></div>
          </dl>
          <h3 class="pf-sub">Te puede atender</h3>
          <ul class="pf-modos">${modos}</ul>
        </section>
      </div>

      <section class="pf-bloque" id="resenas">
        <h2>Lo que dicen sus clientes</h2>
        <div class="pf-resumen-resenas">
          <div class="pf-prom">
            <strong>${prom.toFixed(1)}</strong>
            <span>${estrellas(prom)}</span>
            <small>${resenas.length} reseñas</small>
          </div>
          <div class="pf-dist">
            ${dist.map((d) => `
              <div class="pf-dist-fila">
                <span>${d.n}★</span>
                <div class="pf-barra"><div style="width:${d.pct.toFixed(0)}%"></div></div>
                <small>${d.c}</small>
              </div>`).join('')}
          </div>
        </div>
        <ul class="pf-resenas">
          ${resenas.length ? resenas.map((r) => `
            <li>
              <div class="pf-resena-head">
                <strong>${esc(r.autor)}</strong>
                <span class="pf-estrellas">${estrellas(r.calificacion)}</span>
              </div>
              <p>${esc(r.texto || '')}</p>
              <small>${esc(hace(Math.round((Date.now() - new Date(r.created_at)) / 86400000)))}</small>
            </li>`).join('')
            : '<li class="pf-sin-resenas">Todavía no tiene reseñas publicadas. Sé el primero después de tu asesoría.</li>'}
        </ul>
        <p class="pf-nota-resenas">
          <i class="fas fa-shield-halved"></i>
          Solo puede escribir quien tuvo una cita, y cada reseña se revisa antes de publicarse.
        </p>
      </section>
    </div>

    <!-- Sidebar -->
    <aside class="pf-side">
      <div class="pf-card-agendar">
        <h3>Agenda una asesoría</h3>
        <p class="pf-gratis"><i class="fas fa-circle-check"></i> Sin costo y sin compromiso</p>
        <ul class="pf-incluye">
          <li><i class="fas fa-check"></i> Revisión de lo que ya tienes contratado</li>
          <li><i class="fas fa-check"></i> Comparativo de opciones y coberturas</li>
          <li><i class="fas fa-check"></i> Cotización por escrito</li>
        </ul>
        <button class="btn btn-acento w-full btn-lg" onclick="abrirAgendar()">
          <i class="fas fa-calendar-check"></i> Elegir día y hora
        </button>
        ${wa ? `<a class="btn btn-outline w-full" href="${esc(wa)}" target="_blank" rel="noopener">
          <i class="fab fa-whatsapp"></i> Prefiero WhatsApp</a>` : ''}
        <p class="pf-legal">
          La asesoría la da un agente con cédula vigente ante la CNSF.
          Contratar es decisión tuya y siempre después de la cita.
        </p>
      </div>

      <div class="pf-card-cal">
        <h3>Próximos días</h3>
        <div class="pf-dias" id="pfDias"></div>
      </div>

      <div class="pf-card-cercanos">
        <h3>Otros agentes</h3>
        ${cercanos}
      </div>
    </aside>
  </div>`;
}

function activarPerfil() {
  // Próximos 10 días hábiles como disponibilidad de referencia.
  const cont = $('#pfDias');
  if (cont) {
    const dias = [];
    const d = new Date();
    while (dias.length < 10) {
      d.setDate(d.getDate() + 1);
      const dow = d.getDay();
      if (dow !== 0) dias.push(new Date(d));   // domingo no
    }
    cont.innerHTML = dias.map((f) => {
      const libre = f.getDay() !== 6;          // sábado con agenda reducida
      return `<button class="pf-dia ${libre ? '' : 'ocupado'}"
                ${libre ? `onclick="abrirAgendar('${f.toISOString().slice(0, 10)}')"` : 'disabled'}>
        <span class="pf-dia-sem">${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][f.getDay()]}</span>
        <span class="pf-dia-num">${f.getDate()}</span>
      </button>`;
    }).join('');
  }

  document.addEventListener('keydown', (e) => {
    if (!$('#fsViewer').classList.contains('activo')) return;
    if (e.key === 'Escape') cerrarFullscreen();
    if (e.key === 'ArrowRight') navFullscreen(1);
    if (e.key === 'ArrowLeft') navFullscreen(-1);
  });
}

/* ── Visor a pantalla completa ── */
function abrirFullscreen(i) {
  fsIndex = i;
  $('#fsImg').src = GALERIA[i];
  $('#fsContador').textContent = `${i + 1} / ${GALERIA.length}`;
  $('#fsViewer').classList.add('activo');
  document.body.style.overflow = 'hidden';
}
function cerrarFullscreen() {
  $('#fsViewer').classList.remove('activo');
  document.body.style.overflow = '';
}
function navFullscreen(d) {
  fsIndex = (fsIndex + d + GALERIA.length) % GALERIA.length;
  $('#fsImg').src = GALERIA[fsIndex];
  $('#fsContador').textContent = `${fsIndex + 1} / ${GALERIA.length}`;
}

/* ── Agendar ── */
function abrirAgendar(fecha) {
  const a = PERFIL;
  const hoy = new Date().toISOString().slice(0, 10);
  const ramos = (a.ramos || []).map((r) =>
    `<option value="${r}">${esc((RAMOS[r] || {}).label || r)}</option>`).join('');
  const modos = (a.modalidades || []).map((m) =>
    `<option value="${m}">${esc((MODALIDADES[m] || {}).label || m)}</option>`).join('');

  $('#citaBody').innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">Agendar con ${esc(a.nombre.split(' ')[0])}</h3>
      <button class="modal-close" onclick="closeModal('citaModal')"><i class="fas fa-times"></i></button>
    </div>
    <p class="modal-sub">Asesoría sin costo. ${esc(a.nombre.split(' ')[0])} te confirma por WhatsApp.</p>
    <form id="citaForm">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="citaFecha">Día</label>
          <input class="form-input" type="date" id="citaFecha" required
                 min="${hoy}" value="${esc(fecha || '')}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="citaHora">Hora</label>
          <input class="form-input" type="time" id="citaHora" required value="11:00" min="09:00" max="19:00" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="citaModalidad">¿Dónde?</label>
          <select class="form-input" id="citaModalidad">${modos}</select>
        </div>
        <div class="form-group">
          <label class="form-label" for="citaRamo">¿Qué te interesa?</label>
          <select class="form-input" id="citaRamo">${ramos}</select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="citaNombre">Tu nombre</label>
        <input class="form-input" type="text" id="citaNombre" required autocomplete="name" />
      </div>
      <div class="form-group">
        <label class="form-label" for="citaWa">Tu WhatsApp</label>
        <input class="form-input" type="tel" id="citaWa" required placeholder="33 1234 5678" autocomplete="tel" />
      </div>
      <div class="form-group">
        <label class="form-label" for="citaMsg">¿Algo que deba saber antes? (opcional)</label>
        <textarea class="form-input" id="citaMsg" rows="2"></textarea>
      </div>
      <div id="citaError" class="login-error"><i class="fas fa-circle-exclamation"></i> <span></span></div>
      <button class="btn btn-acento w-full btn-lg" type="submit" id="citaSubmit">
        <i class="fas fa-paper-plane"></i> Solicitar cita
      </button>
      <p class="pf-legal" style="margin-top:.8rem">
        Tu nombre y tu WhatsApp los ve solo ${esc(a.nombre.split(' ')[0])}. No se publican.
      </p>
    </form>`;

  $('#citaForm').addEventListener('submit', enviarCita);
  openModal('citaModal');
}

async function enviarCita(ev) {
  ev.preventDefault();
  const btn = $('#citaSubmit');
  const err = $('#citaError');
  const fallar = (m) => { err.style.display = 'block'; err.querySelector('span').textContent = m; };

  err.style.display = 'none';
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando…';

  const cita = {
    agente_id: PERFIL.id,
    cliente_nombre: $('#citaNombre').value.trim(),
    cliente_whatsapp: $('#citaWa').value.trim(),
    modalidad: $('#citaModalidad').value,
    ramo_interes: $('#citaRamo').value,
    fecha: $('#citaFecha').value,
    hora: $('#citaHora').value,
    mensaje: $('#citaMsg').value.trim() || null,
    estado: 'pendiente',
    origen: 'web',
  };

  const restaurar = () => {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Solicitar cita';
  };

  if (!window.sbClient || String(PERFIL.id).startsWith('demo-')) {
    // Sin base conectada la cita no se guarda: hay que decirlo, no fingir.
    setTimeout(() => {
      closeModal('citaModal');
      showToast('Demo: la cita no se guardó porque la base aún no está conectada.');
      restaurar();
    }, 600);
    return;
  }

  try {
    const { error } = await sbClient.from('citas').insert(cita);
    if (error) throw error;
    closeModal('citaModal');
    showToast(`Listo. ${PERFIL.nombre.split(' ')[0]} te confirma por WhatsApp.`);
  } catch (e) {
    console.error(e);
    fallar('No se pudo enviar. Intenta de nuevo o escríbele por WhatsApp.');
  } finally {
    restaurar();
  }
}

/* ===========================================================================
   12. Sesión de los paneles
   ---------------------------------------------------------------------------
   MODO DEMO: cuando no hay Supabase configurado, los paneles se pueden abrir
   con datos ficticios para poder enseñarlos. Se apaga solo en cuanto pegas la
   URL y la anon key en supabase-config.js — no es un backdoor que sobreviva a
   producción, y no hay ninguna contraseña escrita en este archivo.

   el proyecto de referencia resuelve esto con `admin/admin123` dentro del JS. Eso no se porta.
   =========================================================================== */
const DEMO = !window.sbClient;

const entrarDemo = (rol) => {
  sessionStorage.setItem('demo_rol', rol);
  location.href = rol === 'director' ? 'panel-director.html' : 'panel-agente.html';
};

const sesionDemo = () => (DEMO ? sessionStorage.getItem('demo_rol') : null);

function salirPanel() {
  sessionStorage.removeItem('demo_rol');
  if (window.sbClient) sbClient.auth.signOut();
  location.href = 'index.html';
}

/* Botones de demo dentro del modal de acceso. Solo existen si DEMO está on. */
function inyectarDemoLogin() {
  if (!DEMO) return;
  const modal = $('#loginModal .modal');
  if (!modal || $('#demoAcceso')) return;
  modal.insertAdjacentHTML('beforeend', `
    <div id="demoAcceso" class="demo-acceso">
      <p><i class="fas fa-flask"></i> La base todavía no está conectada.
         Puedes recorrer los paneles con datos de ejemplo:</p>
      <div class="demo-acceso-btns">
        <button class="btn btn-outline btn-sm" onclick="entrarDemo('director')">
          <i class="fas fa-user-tie"></i> Ver panel del Director
        </button>
        <button class="btn btn-outline btn-sm" onclick="entrarDemo('agente')">
          <i class="fas fa-user"></i> Ver panel del Agente
        </button>
      </div>
    </div>`);
}

/**
 * Portero de los paneles. Devuelve { rol, usuario } o redirige y devuelve null.
 * En demo confía en sessionStorage; con Supabase, en la sesión real y en la
 * tabla `usuarios`. La guardia del cliente es comodidad: lo que de verdad
 * protege los datos es el RLS.
 */
async function guardPanel(rolRequerido) {
  const rolDemo = sesionDemo();
  if (rolDemo) {
    if (rolDemo !== rolRequerido) { location.replace(`panel-${rolDemo}.html`); return null; }
    const yo = rolDemo === 'director'
      ? { nombre: 'Roberto Sandoval', rol: 'director' }
      : Object.assign({ rol: 'agente' }, AGENTES[0]);
    return { rol: rolDemo, usuario: yo, demo: true };
  }

  if (!window.sbClient) { location.replace('index.html'); return null; }

  const { data: s } = await sbClient.auth.getSession();
  if (!s || !s.session) { location.replace('index.html'); return null; }

  const { data: usuario } = await sbClient
    .from('usuarios').select('*').eq('auth_user_id', s.session.user.id).maybeSingle();

  if (!usuario || !usuario.activo) { await sbClient.auth.signOut(); location.replace('index.html'); return null; }
  if (usuario.rol !== rolRequerido) { location.replace(`panel-${usuario.rol}.html`); return null; }

  return { rol: usuario.rol, usuario, demo: false };
}

/* ===========================================================================
   13. Datos de ejemplo de los paneles
   =========================================================================== */
const diasDesde = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const CITAS_DEMO = [
  { id:'c1', agente:'ana-ramirez',   cliente:'Carlos Méndez',    wa:'+523311110001', modalidad:'oficina',      ramo:'gastos_medicos', fecha:diasDesde(0),  hora:'11:00', estado:'confirmada', mensaje:'Quiero cotizar gastos médicos para mi familia (4 personas).' },
  { id:'c2', agente:'ana-ramirez',   cliente:'Renata Ochoa',     wa:'+523311110002', modalidad:'videollamada', ramo:'vida',           fecha:diasDesde(1),  hora:'16:30', estado:'pendiente',  mensaje:'Me interesa un seguro de vida, no sé por dónde empezar.' },
  { id:'c3', agente:'ana-ramirez',   cliente:'Grupo Ferretero',  wa:'+523311110003', modalidad:'domicilio',    ramo:'empresarial',    fecha:diasDesde(3),  hora:'10:00', estado:'confirmada', mensaje:'Tenemos 8 camionetas de reparto.' },
  { id:'c4', agente:'luis-torres',   cliente:'Patricia Núñez',   wa:'+523311110007', modalidad:'oficina',      ramo:'auto',           fecha:diasDesde(0),  hora:'13:00', estado:'confirmada', mensaje:'Renovación de mi auto.' },
  { id:'c5', agente:'luis-torres',   cliente:'Héctor Villalobos',wa:'+523311110008', modalidad:'domicilio',    ramo:'empresarial',    fecha:diasDesde(2),  hora:'09:30', estado:'pendiente',  mensaje:'Flotilla de 12 unidades.' },
  { id:'c6', agente:'miguel-aguirre',cliente:'Lucía Guerrero',   wa:'+523311110004', modalidad:'cafe',         ramo:'educativo',      fecha:diasDesde(5),  hora:'18:00', estado:'pendiente',  mensaje:'Plan de ahorro para la universidad de mi hija.' },
  { id:'c7', agente:'sofia-beltran', cliente:'Transportes Bajío',wa:'+523311110010', modalidad:'videollamada', ramo:'fianzas',        fecha:diasDesde(4),  hora:'12:00', estado:'confirmada', mensaje:'Renovación de fianza de cumplimiento.' },
  { id:'c8', agente:'ana-ramirez',   cliente:'Jorge Salinas',    wa:'+523311110005', modalidad:'oficina',      ramo:'auto',           fecha:diasDesde(-12),hora:'12:00', estado:'completada', mensaje:'Renovación de auto.' },
  { id:'c9', agente:'luis-torres',   cliente:'Adriana Cortés',   wa:'+523311110009', modalidad:'oficina',      ramo:'auto',           fecha:diasDesde(-20),hora:'17:00', estado:'completada', mensaje:'' },
  { id:'c10',agente:'miguel-aguirre',cliente:'Rodrigo Palma',    wa:'+523311110011', modalidad:'videollamada', ramo:'vida',           fecha:diasDesde(-8), hora:'19:00', estado:'completada', mensaje:'' },
  { id:'c11',agente:'ana-ramirez',   cliente:'Sin nombre',       wa:'+523311110012', modalidad:'oficina',      ramo:'hogar',          fecha:diasDesde(-3), hora:'11:00', estado:'no_asistio', mensaje:'' },
];

/* Reseñas esperando aprobación del Director. */
const RESENAS_PENDIENTES = [
  { id:'r1', agente:'ana-ramirez',    autor:'Anónimo',     calificacion:5, texto:'Excelente atención, la recomiendo mucho.', dias:2 },
  { id:'r2', agente:'miguel-aguirre', autor:'Anónimo',     calificacion:4, texto:'Buena asesoría sobre el plan educativo. Tardó un poco en contestar.', dias:4 },
  { id:'r3', agente:'luis-torres',    autor:'Fernando R.', calificacion:5, texto:'Me consiguió mejor precio que el que ya tenía. Muy claro con los números.', dias:6 },
];

/* ===========================================================================
   14. Panel del Director (panel-director.html)
   =========================================================================== */
const agentePorSlug = (slug) => AGENTES.find((a) => a.slug === slug) || {};
const citasDeEquipo = () => CITAS_DEMO.map((c) => ({ ...c, ag: agentePorSlug(c.agente) }));
const esHoy = (f) => f === new Date().toISOString().slice(0, 10);

const ETIQUETA_ESTADO = {
  pendiente:  { txt: 'Por confirmar', clase: 'pill-warn' },
  confirmada: { txt: 'Confirmada',    clase: 'pill-ok' },
  completada: { txt: 'Completada',    clase: 'pill-off' },
  cancelada:  { txt: 'Cancelada',     clase: 'pill-off' },
  no_asistio: { txt: 'No asistió',    clase: 'pill-err' },
};

const fechaCorta = (f) => {
  const [y, m, d] = String(f).slice(0, 10).split('-').map(Number);
  return `${d} ${['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][m - 1]}`;
};

async function initPanelDirector() {
  const main = $('#pdMain');
  if (!main) return;

  const sesion = await guardPanel('director');
  if (!sesion) return;

  $('#pdQuien').innerHTML = `<b>${esc(sesion.usuario.nombre)}</b>${sesion.demo ? ' · demo' : ''}`;

  const pendientes = RESENAS_PENDIENTES.length;
  if (pendientes) $('#pdBadgeResenas').textContent = pendientes;
  $('#pdBadgePost').textContent = '2';

  const ir = (sec) => {
    $$('.admin-nav-item[data-sec], .panel-bottom-nav-item[data-sec]')
      .forEach((b) => b.classList.toggle('activo', b.dataset.sec === sec));
    main.innerHTML = (SECCIONES_DIRECTOR[sec] || (() => '<p>Sección en construcción.</p>'))();
    main.scrollTop = 0;
    if (sec === 'resenas') activarModeracion();
    if (sec === 'agentes') activarGestionAgentes();
  };

  $$('[data-sec]').forEach((b) => {
    if (b.tagName === 'A') return;
    b.addEventListener('click', () => ir(b.dataset.sec));
  });

  if (sesion.demo) {
    // Fuera del grid de .admin-layout: si se inserta dentro, ocupa una celda
    // y empuja el contenido a la fila siguiente, con el ancho del sidebar.
    $('.admin-layout').insertAdjacentHTML('beforebegin', `
      <div class="demo-cinta">
        <i class="fas fa-flask"></i> Modo demo — datos ficticios. Nada de lo que
        toques aquí se guarda. Se apaga solo al conectar Supabase.
      </div>`);
  }

  ir('dashboard');
}

const SECCIONES_DIRECTOR = {

  dashboard() {
    const citas = citasDeEquipo();
    const mes = citas.filter((c) => c.fecha.slice(0, 7) === new Date().toISOString().slice(0, 7));
    const prima = AGENTES.reduce((s, a) => s + (a.num_citas || 0) * 1800, 0);
    const califProm = AGENTES.length
      ? AGENTES.reduce((s, a) => s + Number(a.calificacion || 0), 0) / AGENTES.length : 0;
    const maxCitas = Math.max(...AGENTES.map((a) => a.num_citas || 0), 1);

    return `
      <h1 class="admin-page-title">Panel del equipo</h1>
      <p class="admin-page-sub">Cómo va tu equipo este mes</p>

      <div class="kpi-grid">
        ${kpi('fa-calendar-check', 'Citas del mes', mes.length, `${citas.filter((c) => c.estado === 'pendiente').length} por confirmar`)}
        ${kpi('fa-users', 'Agentes activos', AGENTES.length, `${AGENTES.filter((a) => a.disponible).length} disponibles hoy`)}
        ${kpi('fa-star', 'Calificación', califProm.toFixed(2), 'promedio del equipo')}
        ${kpi('fa-clock', 'Reseñas por aprobar', RESENAS_PENDIENTES.length, 'esperando tu revisión', RESENAS_PENDIENTES.length ? 'alerta' : '')}
        ${kpi('fa-file-contract', 'Pólizas colocadas', AGENTES.reduce((s, a) => s + (a.num_citas || 0), 0), 'histórico')}
        ${kpi('fa-coins', 'Prima del equipo', '$' + (prima / 1000).toFixed(0) + 'k', 'estimada anual')}
      </div>

      <div class="admin-cols">
        <section class="admin-card">
          <h2>Citas de hoy</h2>
          ${citas.filter((c) => esHoy(c.fecha)).length
            ? `<ul class="lista-citas">${citas.filter((c) => esHoy(c.fecha)).map(filaCita).join('')}</ul>`
            : '<p class="admin-vacio">Nadie tiene cita hoy.</p>'}
        </section>

        <section class="admin-card">
          <h2>Citas atendidas por agente</h2>
          <div class="barras">
            ${AGENTES.map((a) => `
              <div class="barra-fila">
                <div class="barra-cabeza">
                  <span>${esc(a.nombre)}</span><b>${a.num_citas || 0}</b>
                </div>
                <div class="barra-pista">
                  <div class="barra-relleno" style="width:${((a.num_citas || 0) / maxCitas * 100).toFixed(0)}%"></div>
                </div>
              </div>`).join('')}
          </div>
        </section>
      </div>

      <section class="admin-card">
        <h2>Próximas citas del equipo</h2>
        <ul class="lista-citas">
          ${citas.filter((c) => c.fecha >= new Date().toISOString().slice(0, 10))
                 .sort((a, b) => a.fecha.localeCompare(b.fecha))
                 .slice(0, 6).map(filaCita).join('')}
        </ul>
      </section>`;
  },

  agentes() {
    return `
      <h1 class="admin-page-title">Agentes</h1>
      <p class="admin-page-sub">${AGENTES.length} en tu equipo</p>
      <div class="admin-acciones-top">
        <button class="btn btn-acento btn-sm" onclick="showToast('En demo no se dan de alta agentes.')">
          <i class="fas fa-plus"></i> Agregar agente
        </button>
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr>
            <th>Agente</th><th>Zona</th><th>Ramos</th><th>Citas</th>
            <th>Calificación</th><th>Estado</th><th></th>
          </tr></thead>
          <tbody>
            ${AGENTES.map((a) => `
              <tr data-agente="${esc(a.slug)}">
                <td>
                  <div class="table-name">
                    <img class="table-avatar" src="${esc(a.foto)}" alt="" />
                    <div>
                      <strong>${esc(a.nombre)}</strong>
                      <span class="table-sub">${esc(a.cedula || 'sin cédula')}</span>
                    </div>
                  </div>
                </td>
                <td>${esc(a.zona || '')}</td>
                <td>${(a.ramos || []).slice(0, 2).map((r) => `<span class="pill pill-sm">${esc((RAMOS[r] || {}).label)}</span>`).join(' ')}</td>
                <td class="num">${a.num_citas || 0}</td>
                <td>${estrellas(a.calificacion)} ${Number(a.calificacion).toFixed(1)}</td>
                <td>
                  ${a.disponible ? '<span class="pill pill-ok">Disponible</span>' : '<span class="pill pill-off">Ocupado</span>'}
                  ${a.verificado ? '' : '<span class="pill pill-warn">Sin verificar</span>'}
                </td>
                <td class="table-actions">
                  <a class="icon-btn" href="perfil.html?a=${esc(a.slug)}" title="Ver perfil público"><i class="fas fa-eye"></i></a>
                  <button class="icon-btn" data-accion="ocultar" title="Ocultar del sitio"><i class="fas fa-eye-slash"></i></button>
                  <button class="icon-btn" data-accion="suspender" title="Suspender"><i class="fas fa-ban"></i></button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="admin-nota">
        <b>Ocultar</b> saca al agente del sitio público pero sigue operando y recibiendo citas.
        <b>Suspender</b> lo saca de todo y registra desde cuándo, para saber qué cobrarle de afiliación.
      </p>`;
  },

  citas() {
    const citas = citasDeEquipo().sort((a, b) => b.fecha.localeCompare(a.fecha));
    const porEstado = (e) => citas.filter((c) => c.estado === e);
    return `
      <h1 class="admin-page-title">Citas del equipo</h1>
      <p class="admin-page-sub">${citas.length} en total</p>
      <div class="kpi-grid kpi-grid-4">
        ${kpi('fa-hourglass-half', 'Por confirmar', porEstado('pendiente').length, '', porEstado('pendiente').length ? 'alerta' : '')}
        ${kpi('fa-circle-check', 'Confirmadas', porEstado('confirmada').length)}
        ${kpi('fa-flag-checkered', 'Completadas', porEstado('completada').length)}
        ${kpi('fa-user-slash', 'No asistieron', porEstado('no_asistio').length, '', porEstado('no_asistio').length ? 'riesgo' : '')}
      </div>
      <section class="admin-card">
        <h2>Todas las citas</h2>
        <ul class="lista-citas">${citas.map(filaCita).join('')}</ul>
      </section>
      <p class="admin-nota">
        <i class="fas fa-lock"></i> El teléfono del cliente solo lo ve su agente y tú.
        El sitio público nunca lee esta tabla.
      </p>`;
  },

  resenas() {
    const aprobadas = Object.entries(RESENAS_DEMO).flatMap(([slug, rs]) =>
      rs.map((r) => ({ ...r, agente: slug })));
    return `
      <h1 class="admin-page-title">Reseñas</h1>
      <p class="admin-page-sub">Nada se publica sin que tú lo apruebes</p>
      <div class="tabs-bar">
        <button class="tab-btn activo" data-tab="pend">Pendientes (${RESENAS_PENDIENTES.length})</button>
        <button class="tab-btn" data-tab="apro">Publicadas (${aprobadas.length})</button>
      </div>
      <div class="tab-panel activo" id="tab-pend">
        ${RESENAS_PENDIENTES.length ? RESENAS_PENDIENTES.map((r) => `
          <article class="resena-mod" data-resena="${esc(r.id)}">
            <div class="resena-mod-head">
              <div>
                <strong>${esc(r.autor)}</strong>
                <span class="table-sub">sobre ${esc(agentePorSlug(r.agente).nombre || r.agente)} · ${hace(r.dias)}</span>
              </div>
              <span class="pf-estrellas">${estrellas(r.calificacion)}</span>
            </div>
            <p>${esc(r.texto)}</p>
            <div class="resena-mod-btns">
              <button class="btn btn-acento btn-sm" data-mod="aprobar"><i class="fas fa-check"></i> Publicar</button>
              <button class="btn btn-ghost btn-sm" data-mod="rechazar"><i class="fas fa-times"></i> Rechazar</button>
            </div>
          </article>`).join('')
          : '<p class="admin-vacio">Nada pendiente. Todas revisadas.</p>'}
      </div>
      <div class="tab-panel" id="tab-apro">
        ${aprobadas.map((r) => `
          <article class="resena-mod">
            <div class="resena-mod-head">
              <div>
                <strong>${esc(r.autor)}</strong>
                <span class="table-sub">sobre ${esc(agentePorSlug(r.agente).nombre || r.agente)}</span>
              </div>
              <span class="pf-estrellas">${estrellas(r.calificacion)}</span>
            </div>
            <p>${esc(r.texto)}</p>
          </article>`).join('')}
      </div>`;
  },

  postulaciones() {
    const post = [
      { nombre: 'Daniela Ortiz', wa: '+523311112001', ciudad: 'Guadalajara', cedula: 'A1-330012', exp: '4 años', msg: 'Trabajo por mi cuenta y quiero integrarme a un equipo.' },
      { nombre: 'Fernando Ruiz', wa: '+523311112002', ciudad: 'Zapopan', cedula: null, exp: 'Sin experiencia', msg: 'Voy a presentar el examen de cédula el mes que entra.' },
    ];
    return `
      <h1 class="admin-page-title">Postulaciones</h1>
      <p class="admin-page-sub">Agentes que quieren entrar a tu equipo</p>
      ${post.map((p) => `
        <article class="admin-card postulacion">
          <div class="resena-mod-head">
            <div>
              <strong>${esc(p.nombre)}</strong>
              <span class="table-sub">${esc(p.ciudad)} · ${esc(p.exp)}</span>
            </div>
            ${p.cedula ? `<span class="pill pill-ok">Céd. ${esc(p.cedula)}</span>`
                       : '<span class="pill pill-warn">Sin cédula</span>'}
          </div>
          <p>${esc(p.msg)}</p>
          <div class="resena-mod-btns">
            <a class="btn btn-wa btn-sm" href="${esc(waLink(p.wa, `Hola ${p.nombre}, vi tu postulación.`))}" target="_blank" rel="noopener">
              <i class="fab fa-whatsapp"></i> Contactar
            </a>
            <button class="btn btn-ghost btn-sm" onclick="showToast('En demo no se cambia el estatus.')">Descartar</button>
          </div>
        </article>`).join('')}`;
  },

  ingresos() {
    const filas = AGENTES.map((a) => {
      const citas = a.num_citas || 0;
      const prima = citas * 1800;
      return { nombre: a.nombre, citas, prima, comision: prima * 0.12 };
    });
    const total = filas.reduce((s, f) => s + f.prima, 0);
    return `
      <h1 class="admin-page-title">Ingresos</h1>
      <p class="admin-page-sub">Estimado a partir de las citas atendidas</p>
      <div class="kpi-grid kpi-grid-4">
        ${kpi('fa-coins', 'Prima colocada', '$' + (total / 1000).toFixed(0) + 'k', 'histórica')}
        ${kpi('fa-percent', 'Comisión estimada', '$' + (total * 0.12 / 1000).toFixed(0) + 'k', '12% promedio')}
        ${kpi('fa-users', 'Agentes produciendo', filas.filter((f) => f.citas > 0).length, `de ${filas.length}`)}
        ${kpi('fa-chart-line', 'Ticket promedio', '$1,800', 'por póliza')}
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Agente</th><th>Citas</th><th>Prima estimada</th><th>Comisión</th></tr></thead>
          <tbody>${filas.map((f) => `
            <tr><td><strong>${esc(f.nombre)}</strong></td><td class="num">${f.citas}</td>
            <td class="num">$${f.prima.toLocaleString('es-MX')}</td>
            <td class="num">$${Math.round(f.comision).toLocaleString('es-MX')}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="admin-nota">
        Estos números son una estimación de demostración. Los reales salen de la
        sección <b>Cartera</b>, que lee las pólizas capturadas.
      </p>`;
  },

  afiliacion() {
    return `
      <h1 class="admin-page-title">Afiliación</h1>
      <p class="admin-page-sub">Qué paga cada agente por estar publicado</p>
      <div class="admin-card">
        <p class="admin-vacio" style="text-align:left">
          Durante la beta todos los agentes del equipo están <b>sin cuota</b>,
          a cambio de que usen el sistema de verdad y den retroalimentación.
          El esquema de cobro se define contigo antes de salir de beta.
        </p>
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Agente</th><th>Plan</th><th>Desde</th><th>Estado</th></tr></thead>
          <tbody>${AGENTES.map((a) => `
            <tr><td><strong>${esc(a.nombre)}</strong></td>
            <td><span class="pill pill-acento">Beta sin costo</span></td>
            <td>—</td><td><span class="pill pill-ok">Al corriente</span></td></tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  },

  config() {
    return `
      <h1 class="admin-page-title">Configuración</h1>
      <p class="admin-page-sub">Lo que cambia aquí afecta al sitio público</p>
      <div class="admin-card">
        <div class="form-group">
          <label class="form-label">Nombre de la plataforma</label>
          <input class="form-input" value="${esc(CONFIG.MARCA)}" />
        </div>
        <div class="form-group">
          <label class="form-label">Aseguradora</label>
          <input class="form-input" value="${esc(CONFIG.ASEGURADORA)}" />
        </div>
        <div class="form-group">
          <label class="form-label">Ciudad</label>
          <input class="form-input" value="${esc(CONFIG.CIUDAD)}" />
        </div>
        <div class="form-group">
          <label class="form-label">WhatsApp central</label>
          <input class="form-input" value="+${esc(CONFIG.WHATSAPP_CENTRAL)}" />
        </div>
        <button class="btn btn-acento" onclick="showToast('En demo no se guarda. Estos valores viven en supabase-config.js.')">
          <i class="fas fa-floppy-disk"></i> Guardar
        </button>
      </div>`;
  },
};

function kpi(icono, etiqueta, valor, pie, tono) {
  return `<div class="kpi-card ${tono || ''}">
    <div class="kpi-icon"><i class="fas ${icono}"></i></div>
    <div>
      <div class="kpi-label">${esc(etiqueta)}</div>
      <div class="kpi-value">${esc(valor)}</div>
      ${pie ? `<div class="kpi-delta">${esc(pie)}</div>` : ''}
    </div>
  </div>`;
}

function filaCita(c) {
  const e = ETIQUETA_ESTADO[c.estado] || { txt: c.estado, clase: '' };
  const m = MODALIDADES[c.modalidad] || { label: c.modalidad, icono: 'fa-circle' };
  return `
    <li class="cita-item">
      <div class="cita-fecha">
        <span class="cita-dia">${fechaCorta(c.fecha)}</span>
        <span class="cita-hora">${esc(c.hora)}</span>
      </div>
      <div class="cita-cuerpo">
        <strong>${esc(c.cliente)}</strong>
        <span class="table-sub">
          <i class="fas ${m.icono}"></i> ${esc(m.label)} ·
          ${esc((RAMOS[c.ramo] || {}).label || c.ramo)}
          ${c.ag && c.ag.nombre ? ' · ' + esc(c.ag.nombre) : ''}
        </span>
        ${c.mensaje ? `<span class="cita-msg">“${esc(c.mensaje)}”</span>` : ''}
      </div>
      <div class="cita-lado">
        <span class="pill ${e.clase}">${esc(e.txt)}</span>
        <a class="icon-btn" href="${esc(waLink(c.wa, `Hola ${c.cliente}, te escribo por tu cita.`))}"
           target="_blank" rel="noopener" title="WhatsApp"><i class="fab fa-whatsapp"></i></a>
      </div>
    </li>`;
}

function activarModeracion() {
  $$('.tabs-bar .tab-btn').forEach((b) => b.addEventListener('click', () => {
    $$('.tabs-bar .tab-btn').forEach((x) => x.classList.toggle('activo', x === b));
    $$('.tab-panel').forEach((p) => p.classList.toggle('activo', p.id === 'tab-' + b.dataset.tab));
  }));

  $$('[data-mod]').forEach((b) => b.addEventListener('click', () => {
    const art = b.closest('.resena-mod');
    art.style.opacity = '.35';
    art.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    showToast(b.dataset.mod === 'aprobar'
      ? 'Publicada. En demo no se guarda.'
      : 'Rechazada. En demo no se guarda.');
  }));
}

function activarGestionAgentes() {
  $$('[data-accion]').forEach((b) => b.addEventListener('click', () => {
    const fila = b.closest('tr');
    const nombre = fila.querySelector('strong').textContent;
    const accion = b.dataset.accion;
    fila.style.opacity = accion === 'suspender' ? '.4' : '.7';
    showToast(accion === 'ocultar'
      ? `${nombre} ya no aparece en el sitio, pero sigue recibiendo citas.`
      : `${nombre} queda suspendido: fuera del sitio y sin agenda.`);
  }));
}

/* ===========================================================================
   15. Panel del Agente (panel-agente.html)
   =========================================================================== */
let YO_AGENTE = null;
let DISPONIBLE = true;

async function initPanelAgente() {
  const main = $('#paMain');
  if (!main) return;

  const sesion = await guardPanel('agente');
  if (!sesion) return;

  YO_AGENTE = sesion.demo ? AGENTES[0] : (AGENTES.find((a) => a.usuario_id === sesion.usuario.id) || AGENTES[0]);
  DISPONIBLE = !!YO_AGENTE.disponible;

  $('#paQuien').innerHTML = `<b>${esc(YO_AGENTE.nombre)}</b>${sesion.demo ? ' · demo' : ''}`;
  $('#paVerPerfil').href = `perfil.html?a=${encodeURIComponent(YO_AGENTE.slug)}`;

  // Perfil completo: se cuenta lo que de verdad falta, no un número inventado.
  const campos = [YO_AGENTE.foto, YO_AGENTE.descripcion, YO_AGENTE.cedula,
                  YO_AGENTE.zona, (YO_AGENTE.ramos || []).length,
                  (YO_AGENTE.modalidades || []).length, YO_AGENTE.whatsapp,
                  YO_AGENTE.titulo];
  const pct = Math.round(campos.filter(Boolean).length / campos.length * 100);

  $('#paMini').innerHTML = `
    <img src="${esc(YO_AGENTE.foto)}" alt="" />
    <strong>${esc(YO_AGENTE.nombre)}</strong>
    <span>${esc(YO_AGENTE.zona || '')}</span>
    <div class="mini-progreso"><div style="width:${pct}%"></div></div>
    <small>${pct}% del perfil completo</small>`;

  const misCitas = () => CITAS_DEMO.filter((c) => c.agente === YO_AGENTE.slug);
  const porConfirmar = misCitas().filter((c) => c.estado === 'pendiente').length;
  if (porConfirmar) $('#paBadgeCitas').textContent = porConfirmar;

  pintarToggle();
  [$('#paToggle'), $('#paToggleMovil')].forEach((b) =>
    b && b.addEventListener('click', () => {
      DISPONIBLE = !DISPONIBLE;
      pintarToggle();
      showToast(DISPONIBLE
        ? 'Ahora apareces como disponible en el directorio.'
        : 'Ya no apareces como disponible. Tu perfil sigue publicado.');
    }));

  const ir = (sec) => {
    $$('.admin-nav-item[data-sec], .panel-bottom-nav-item[data-sec]')
      .forEach((b) => b.classList.toggle('activo', b.dataset.sec === sec));
    main.innerHTML = (SECCIONES_AGENTE[sec] || (() => '<p>Sección en construcción.</p>'))();
    if (sec === 'agenda') activarSemana();
    if (sec === 'citas') activarTabsCitas();
    if (sec === 'contenido') activarTabsCitas();
  };

  $$('[data-sec]').forEach((b) => {
    if (b.tagName === 'A') return;
    b.addEventListener('click', () => ir(b.dataset.sec));
  });

  if (sesion.demo) {
    // Fuera del grid, por la misma razón que en el panel del Director.
    $('.admin-layout').insertAdjacentHTML('beforebegin', `
      <div class="demo-cinta">
        <i class="fas fa-flask"></i> Modo demo — datos ficticios. Nada se guarda.
      </div>`);
  }

  ir('inicio');
}

function pintarToggle() {
  const on = DISPONIBLE;
  [['#paToggle', '#paToggleTxt'], ['#paToggleMovil', '#paToggleMovilTxt']].forEach(([b, t]) => {
    const btn = $(b);
    if (!btn) return;
    btn.classList.toggle('off', !on);
    btn.setAttribute('aria-pressed', String(on));
    $(t).textContent = b === '#paToggle' ? (on ? 'Disponible' : 'No disponible') : (on ? 'Sí' : 'No');
  });
  const barra = $('#paBarraTxt');
  if (barra) barra.textContent = on ? 'Estás disponible para citas' : 'No apareces como disponible';
}

const SECCIONES_AGENTE = {

  inicio() {
    const mias = CITAS_DEMO.filter((c) => c.agente === YO_AGENTE.slug);
    const prox = mias.filter((c) => c.fecha >= new Date().toISOString().slice(0, 10));
    const resenas = RESENAS_DEMO[YO_AGENTE.slug] || [];
    return `
      <h1 class="admin-page-title">Hola, ${esc(YO_AGENTE.nombre.split(' ')[0])}</h1>
      <p class="admin-page-sub">Esto es lo que tienes por delante</p>
      <div class="kpi-grid">
        ${kpi('fa-calendar-check', 'Próximas citas', prox.length, `${mias.filter((c) => c.estado === 'pendiente').length} por confirmar`, prox.length ? 'alerta' : '')}
        ${kpi('fa-users', 'Clientes atendidos', YO_AGENTE.num_citas || 0, 'histórico')}
        ${kpi('fa-star', 'Tu calificación', Number(YO_AGENTE.calificacion).toFixed(1), `${resenas.length} reseñas`)}
        ${kpi('fa-eye', 'Visitas a tu perfil', 214, 'últimos 30 días')}
        ${kpi('fa-comment-dots', 'Reseñas nuevas', 1, 'esperando aprobación')}
        ${kpi('fa-file-contract', 'Pólizas del mes', 6, 'colocadas')}
      </div>
      <section class="admin-card">
        <h2>Tus próximas citas</h2>
        ${prox.length ? `<ul class="lista-citas">${prox.map(filaCitaAgente).join('')}</ul>`
                      : '<p class="admin-vacio">Sin citas próximas. Buen momento para prospectar.</p>'}
      </section>
      <section class="admin-card">
        <h2>Lo último que dijeron de ti</h2>
        ${resenas.length ? `<ul class="pf-resenas">${resenas.slice(0, 3).map((r) => `
          <li>
            <div class="pf-resena-head"><strong>${esc(r.autor)}</strong>
              <span class="pf-estrellas">${estrellas(r.calificacion)}</span></div>
            <p>${esc(r.texto)}</p>
          </li>`).join('')}</ul>` : '<p class="admin-vacio">Todavía sin reseñas publicadas.</p>'}
      </section>`;
  },

  citas() {
    const mias = CITAS_DEMO.filter((c) => c.agente === YO_AGENTE.slug);
    const hoy = new Date().toISOString().slice(0, 10);
    const grupo = {
      prox: mias.filter((c) => c.fecha >= hoy && c.estado !== 'pendiente'),
      conf: mias.filter((c) => c.estado === 'pendiente'),
      hist: mias.filter((c) => c.fecha < hoy),
    };
    return `
      <h1 class="admin-page-title">Mis citas</h1>
      <div class="tabs-bar">
        <button class="tab-btn activo" data-tab="prox">Próximas (${grupo.prox.length})</button>
        <button class="tab-btn" data-tab="conf">Por confirmar (${grupo.conf.length})</button>
        <button class="tab-btn" data-tab="hist">Historial (${grupo.hist.length})</button>
      </div>
      ${Object.entries(grupo).map(([k, lista], i) => `
        <div class="tab-panel ${i === 0 ? 'activo' : ''}" id="tab-${k}">
          ${lista.length ? `<ul class="lista-citas">${lista.map(filaCitaAgente).join('')}</ul>`
                         : '<p class="admin-vacio">Nada por aquí.</p>'}
        </div>`).join('')}`;
  },

  agenda() {
    const horas = ['09:00', '10:00', '11:00', '12:00', '13:00', '16:00', '17:00', '18:00'];
    const dias = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return `
      <h1 class="admin-page-title">Disponibilidad</h1>
      <p class="admin-page-sub">Toca una casilla para abrir o cerrar ese horario</p>
      <section class="admin-card">
        <div class="semana-grid" style="grid-template-columns: 60px repeat(${dias.length}, 1fr)">
          <div></div>
          ${dias.map((d) => `<div class="semana-cab">${d}</div>`).join('')}
          ${horas.map((h) => `
            <div class="semana-hora">${h}</div>
            ${dias.map((d, i) => {
              const abierto = !(d === 'Sáb' && Number(h.slice(0, 2)) > 13);
              return `<button class="semana-celda ${abierto ? 'abierto' : ''}"
                        data-dia="${d}" data-hora="${h}"
                        aria-label="${d} ${h}"></button>`;
            }).join('')}`).join('')}
        </div>
        <p class="admin-nota" style="margin-top:1rem">
          <span class="leyenda-punto abierto"></span> Abierto para citas ·
          <span class="leyenda-punto"></span> Cerrado
        </p>
      </section>
      <section class="admin-card">
        <h2>Bloquear días completos</h2>
        <p class="admin-vacio" style="text-align:left">
          Vacaciones, capacitación o cualquier día que no puedas atender.
        </p>
        <div class="acciones">
          <input class="form-input" type="date" id="paBloqueo" style="max-width:200px" />
          <button class="btn btn-acento btn-sm" onclick="showToast('En demo no se guarda el bloqueo.')">
            <i class="fas fa-ban"></i> Bloquear
          </button>
        </div>
      </section>`;
  },

  contenido() {
    return `
      <h1 class="admin-page-title">Mi contenido</h1>
      <p class="admin-page-sub">Lo que ve el cliente y lo que se usa en redes</p>
      <div class="tabs-bar">
        <button class="tab-btn activo" data-tab="perfilFotos"><i class="fas fa-user"></i> Perfil</button>
        <button class="tab-btn" data-tab="redes"><i class="fas fa-share-nodes"></i> Redes</button>
      </div>
      <div class="tab-panel activo" id="tab-perfilFotos">
        <p class="admin-nota">Estas fotos salen en tu perfil público.</p>
        <div class="contenido-grid">
          <img src="${esc(YO_AGENTE.foto)}" alt="" />
          ${FOTOS_APOYO.map((u) => `<img src="${esc(u)}" alt="" />`).join('')}
          <button class="subir-foto" onclick="showToast('En demo no se suben fotos.')">
            <i class="fas fa-plus"></i><span>Subir</span>
          </button>
        </div>
      </div>
      <div class="tab-panel" id="tab-redes">
        <p class="admin-nota">
          Material casual para que se publique en los canales del equipo.
          No sale en tu perfil.
        </p>
        <div class="contenido-grid">
          <button class="subir-foto" onclick="showToast('En demo no se suben fotos.')">
            <i class="fas fa-plus"></i><span>Subir</span>
          </button>
        </div>
        <p class="admin-vacio">Todavía no subes material para redes.</p>
      </div>`;
  },

  perfil() {
    const ramos = Object.entries(RAMOS).map(([k, v]) => {
      const tiene = (YO_AGENTE.ramos || []).includes(k);
      const esp = (YO_AGENTE.especialidades || []).includes(k);
      return `<label class="check-ramo ${tiene ? 'activo' : ''}">
        <input type="checkbox" ${tiene ? 'checked' : ''} />
        <i class="fas ${v.icono}"></i> ${esc(v.label)}
        ${esp ? '<span class="pill pill-acento pill-sm">Especialidad</span>' : ''}
      </label>`;
    }).join('');

    const modos = Object.entries(MODALIDADES).map(([k, v]) => {
      const tiene = (YO_AGENTE.modalidades || []).includes(k);
      return `<label class="check-ramo ${tiene ? 'activo' : ''}">
        <input type="checkbox" ${tiene ? 'checked' : ''} />
        <i class="fas ${v.icono}"></i> ${esc(v.label)}
      </label>`;
    }).join('');

    return `
      <h1 class="admin-page-title">Editar perfil</h1>
      <p class="admin-page-sub">Así te ve un cliente que te busca</p>

      <section class="admin-card">
        <h2>Datos que no puedes cambiar</h2>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Nombre <i class="fas fa-lock"></i></label>
            <input class="form-input" value="${esc(YO_AGENTE.nombre)}" readonly />
          </div>
          <div class="form-group">
            <label class="form-label">Cédula CNSF <i class="fas fa-lock"></i></label>
            <input class="form-input" value="${esc(YO_AGENTE.cedula || '')}" readonly />
          </div>
        </div>
        <p class="admin-nota">
          Tu nombre y tu cédula los administra tu director. Si hay un error, avísale.
        </p>
      </section>

      <section class="admin-card">
        <h2>Tu presentación</h2>
        <div class="form-group">
          <label class="form-label">Titular</label>
          <input class="form-input" value="${esc(YO_AGENTE.titulo || '')}" />
        </div>
        <div class="form-group">
          <label class="form-label">Sobre ti</label>
          <textarea class="form-input" rows="4">${esc(YO_AGENTE.descripcion || '')}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Zona</label>
            <input class="form-input" value="${esc(YO_AGENTE.zona || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">WhatsApp</label>
            <input class="form-input" value="+${esc(YO_AGENTE.whatsapp || '')}" />
          </div>
        </div>
      </section>

      <section class="admin-card">
        <h2>Seguros que manejas</h2>
        <div class="check-grid">${ramos}</div>
      </section>

      <section class="admin-card">
        <h2>Cómo puedes atender</h2>
        <div class="check-grid">${modos}</div>
      </section>

      <button class="btn btn-acento btn-lg" onclick="showToast('En demo no se guarda. Con Supabase conectado, esto escribe en la tabla agentes.')">
        <i class="fas fa-floppy-disk"></i> Guardar cambios
      </button>`;
  },

  config() {
    return `
      <h1 class="admin-page-title">Configuración</h1>
      <section class="admin-card">
        <h2>Acceso</h2>
        <div class="form-group">
          <label class="form-label">Correo <i class="fas fa-lock"></i></label>
          <input class="form-input" value="${esc(YO_AGENTE.email || 'tu@correo.mx')}" readonly />
        </div>
        <p class="admin-nota">
          Tu correo y tu contraseña los administra tu director, igual que tu cédula.
        </p>
      </section>
      <section class="admin-card">
        <h2>Reseñas de clientes</h2>
        <p class="admin-vacio" style="text-align:left">
          Puedes dejar una nota privada sobre un cliente para avisarle al resto
          del equipo. Solo la ven tus compañeros y el director; el cliente nunca.
        </p>
        <button class="btn btn-outline btn-sm" onclick="abrirResenaCliente()">
          <i class="fas fa-user-pen"></i> Calificar a un cliente
        </button>
      </section>`;
  },
};

function filaCitaAgente(c) {
  const e = ETIQUETA_ESTADO[c.estado] || { txt: c.estado, clase: '' };
  const m = MODALIDADES[c.modalidad] || { label: c.modalidad, icono: 'fa-circle' };
  return `
    <li class="cita-item">
      <div class="cita-fecha">
        <span class="cita-dia">${fechaCorta(c.fecha)}</span>
        <span class="cita-hora">${esc(c.hora)}</span>
      </div>
      <div class="cita-cuerpo">
        <strong>${esc(c.cliente)}</strong>
        <span class="table-sub">
          <i class="fas ${m.icono}"></i> ${esc(m.label)} · ${esc((RAMOS[c.ramo] || {}).label || c.ramo)}
        </span>
        ${c.mensaje ? `<span class="cita-msg">“${esc(c.mensaje)}”</span>` : ''}
        <div class="acciones" style="margin-top:.5rem">
          ${c.estado === 'pendiente'
            ? `<button class="btn btn-acento btn-sm" onclick="showToast('Cita confirmada. En demo no se guarda.')">
                 <i class="fas fa-check"></i> Confirmar</button>` : ''}
          <a class="btn btn-wa btn-sm" href="${esc(waLink(c.wa, `Hola ${c.cliente}, te escribo por tu cita.`))}"
             target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> Escribir</a>
          <button class="btn btn-ghost btn-sm" onclick="abrirResenaCliente('${esc(c.cliente)}')">
            <i class="fas fa-user-pen"></i> Nota del cliente
          </button>
        </div>
      </div>
      <div class="cita-lado"><span class="pill ${e.clase}">${esc(e.txt)}</span></div>
    </li>`;
}

function activarTabsCitas() {
  $$('.tabs-bar .tab-btn').forEach((b) => b.addEventListener('click', () => {
    $$('.tabs-bar .tab-btn').forEach((x) => x.classList.toggle('activo', x === b));
    $$('.tab-panel').forEach((p) => p.classList.toggle('activo', p.id === 'tab-' + b.dataset.tab));
  }));
}

function activarSemana() {
  $$('.semana-celda').forEach((c) => c.addEventListener('click', () => {
    c.classList.toggle('abierto');
  }));
}

/* Reseña de cliente — privada entre el equipo y el Director (tabla
   `resenas_clientes`). Nunca se muestra en el sitio público. */
function abrirResenaCliente(cliente) {
  const tipos = [
    { k: 'bueno',   label: 'Buen cliente', icono: 'fa-face-smile',
      tags: ['Puntual', 'Claro con lo que quiere', 'Contrató', 'Recomendaría'] },
    { k: 'neutral', label: 'Neutral', icono: 'fa-face-meh',
      tags: ['Solo cotizaba', 'Pidió tiempo', 'Comparando opciones'] },
    { k: 'cuidado', label: 'Cuidado', icono: 'fa-triangle-exclamation',
      tags: ['No llegó', 'Datos falsos', 'Ya lo atendió otro del equipo', 'Trato difícil'] },
  ];

  $('#clienteBody').innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">Nota sobre el cliente</h3>
      <button class="modal-close" onclick="closeModal('clienteModal')"><i class="fas fa-times"></i></button>
    </div>
    <p class="modal-sub">
      La ven tus compañeros y tu director, para saber a qué atenerse.
      El cliente nunca la ve.
    </p>
    <div class="form-group">
      <label class="form-label">Cliente</label>
      <input class="form-input" id="rcCliente" value="${esc(cliente || '')}" placeholder="Nombre o WhatsApp" />
    </div>
    <div class="form-group">
      <label class="form-label">¿Cómo te fue?</label>
      <div class="rc-tipos">
        ${tipos.map((t, i) => `
          <button type="button" class="rc-tipo ${i === 0 ? 'activo' : ''}" data-tipo="${t.k}">
            <i class="fas ${t.icono}"></i><span>${t.label}</span>
          </button>`).join('')}
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Etiquetas</label>
      <div class="rc-tags" id="rcTags"></div>
    </div>
    <div class="form-group">
      <label class="form-label">Nota (opcional)</label>
      <textarea class="form-input" rows="2" placeholder="Algo que le sirva al equipo…"></textarea>
    </div>
    <button class="btn btn-acento w-full" onclick="closeModal('clienteModal');showToast('Nota guardada. En demo no persiste.')">
      <i class="fas fa-floppy-disk"></i> Guardar nota
    </button>`;

  const pintarTags = (k) => {
    const t = tipos.find((x) => x.k === k);
    $('#rcTags').innerHTML = t.tags
      .map((x) => `<button type="button" class="rc-tag">${esc(x)}</button>`).join('');
    $$('.rc-tag').forEach((b) => b.addEventListener('click', () => b.classList.toggle('activo')));
  };

  $$('.rc-tipo').forEach((b) => b.addEventListener('click', () => {
    $$('.rc-tipo').forEach((x) => x.classList.toggle('activo', x === b));
    pintarTags(b.dataset.tipo);
  }));

  pintarTags('bueno');
  openModal('clienteModal');
}

/* ===========================================================================
   16. Aviso de demostración
   ---------------------------------------------------------------------------
   El sitio publicado muestra agentes inventados, con cédulas inventadas, sobre
   fotos de banco de imágenes. Sin este aviso alguien puede creer que son
   personas reales a las que puede contratar un seguro.

   Va atado a DEMO: en cuanto se conecte una base real desaparece solo.
   =========================================================================== */
function inyectarAvisoDemo() {
  if (!DEMO) return;
  if (document.body.classList.contains('panel-page')) return;  // los paneles ya traen el suyo
  if ($('#avisoDemo')) return;

  document.body.insertAdjacentHTML('afterbegin', `
    <div class="aviso-demo" id="avisoDemo">
      <i class="fas fa-flask"></i>
      <span><b>Demostración.</b> Los agentes, las cédulas, las reseñas y las
      fotos son ficticios. No es un servicio real y no hay nadie a quien contratar.</span>
    </div>`);
  document.body.classList.add('con-aviso-demo');
}

/* ===========================================================================
   17. Ramos y zonas (ramos.html)
   =========================================================================== */

/* Qué cubre cada ramo, en palabras de alguien que no vende seguros. */
const RAMOS_DESC = {
  auto:           'Tu carro contra choque, robo y daños a terceros. El más común y el que casi todos ya traen.',
  vida:           'Si te pasa algo, tu familia recibe una suma. Algunos además juntan ahorro con los años.',
  gastos_medicos: 'Hospital, cirugías y tratamientos caros. Cubre lo que el seguro social no alcanza.',
  hogar:          'Tu casa y lo que hay dentro: incendio, sismo, robo y daños a los vecinos.',
  empresarial:    'Tu negocio: inventario, equipo, responsabilidad civil y las unidades de reparto.',
  educativo:      'Un plan que junta dinero para la universidad de tus hijos, pase lo que pase.',
  fianzas:        'Garantiza ante un tercero que vas a cumplir un contrato. Obligatorio en obra pública.',
};

function initRamos() {
  const grid = $('#ramosGrid');
  if (!grid) return;

  // Cuántos agentes manejan cada ramo — el conteo sale de los datos, no fijo.
  const cuenta = (r) => AGENTES.filter((a) => (a.ramos || []).includes(r)).length;

  const ordenados = Object.entries(RAMOS).sort((a, b) => cuenta(b[0]) - cuenta(a[0]));

  grid.innerHTML = ordenados.map(([k, v], i) => `
    <a class="ramo-card ${i === 0 ? 'doble' : ''}" href="agentes.html?ramo=${k}"
       style="--ramo-color:${v.color}">
      <div class="ramo-card-fondo"></div>
      <i class="fas ${v.icono} ramo-card-icono"></i>
      <div class="ramo-card-info">
        <h3>${esc(v.label)}</h3>
        <p>${esc(RAMOS_DESC[k] || '')}</p>
        <span class="ramo-card-count">
          ${cuenta(k)} ${cuenta(k) === 1 ? 'agente lo maneja' : 'agentes lo manejan'}
          <i class="fas fa-arrow-right"></i>
        </span>
      </div>
    </a>`).join('');

  // Zonas: se marca cuántos agentes hay en cada una para no prometer de más.
  const zonas = CONFIG.ZONAS.slice(1);
  $('#zonasGrid').innerHTML = zonas.map((z) => {
    const n = AGENTES.filter((a) => a.zona === z).length;
    return `
      <a class="zona-card ${n ? '' : 'vacia'}" href="agentes.html?zona=${encodeURIComponent(z)}">
        <i class="fas fa-location-dot"></i>
        <div>
          <strong>${esc(z)}</strong>
          <span>${n ? `${n} ${n === 1 ? 'agente' : 'agentes'}` : 'Sin agentes por ahora'}</span>
        </div>
        <i class="fas fa-chevron-right zona-flecha"></i>
      </a>`;
  }).join('');

  // Tags: lo que la gente busca, no nombres técnicos de producto.
  const tags = [
    { txt: 'Seguro de auto barato',        ramo: 'auto' },
    { txt: 'Gastos médicos para la familia', ramo: 'gastos_medicos' },
    { txt: 'Ahorro para la universidad',   ramo: 'educativo' },
    { txt: 'Flotilla de la empresa',       ramo: 'empresarial' },
    { txt: 'Seguro de vida con ahorro',    ramo: 'vida' },
    { txt: 'Fianza de cumplimiento',       ramo: 'fianzas' },
    { txt: 'Casa contra sismo',            ramo: 'hogar' },
    { txt: 'Cambiar de aseguradora',       ramo: '' },
    { txt: 'Revisar mi póliza actual',     ramo: '' },
  ];
  $('#tagsGrid').innerHTML = tags.map((t) =>
    `<a class="tag" href="agentes.html${t.ramo ? '?ramo=' + t.ramo : ''}">${esc(t.txt)}</a>`).join('');
}

/* ===========================================================================
   18. Postulación de agentes (unete.html)
   =========================================================================== */
function initPostular() {
  const form = $('#formPostular');
  if (!form) return;

  $('#pRamos').innerHTML = Object.entries(RAMOS).map(([k, v]) => `
    <label class="check-ramo">
      <input type="checkbox" value="${k}" />
      <i class="fas ${v.icono}"></i> ${esc(v.label)}
    </label>`).join('');

  $$('#pRamos .check-ramo').forEach((l) => {
    const box = l.querySelector('input');
    box.addEventListener('change', () => l.classList.toggle('activo', box.checked));
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = $('#pSubmit');
    const err = $('#pError');
    const fallar = (m) => { err.style.display = 'block'; err.querySelector('span').textContent = m; };

    err.style.display = 'none';
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando…';

    const restaurar = () => {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar postulación';
    };

    const postulacion = {
      nombre: $('#pNombre').value.trim(),
      whatsapp: $('#pWa').value.trim(),
      ciudad: $('#pCiudad').value.trim() || null,
      cedula: $('#pCedula').value.trim() || null,
      experiencia: $('#pExp').value,
      ramos: $$('#pRamos input:checked').map((b) => b.value),
      mensaje: $('#pMsg').value.trim() || null,
      estado: 'nueva',
    };

    if (DEMO) {
      // Sin base no se guarda nada. Decirlo, no simular que sí.
      setTimeout(() => {
        form.classList.add('oculto');
        $('#pExito').classList.remove('oculto');
        $('#pExito').insertAdjacentHTML('beforeend',
          '<p class="pf-legal">Esto es una demostración: la postulación no se guardó.</p>');
        restaurar();
      }, 700);
      return;
    }

    try {
      const { error } = await sbClient.from('postulaciones').insert(postulacion);
      if (error) throw error;
      form.classList.add('oculto');
      $('#pExito').classList.remove('oculto');
    } catch (e) {
      console.error(e);
      fallar('No se pudo enviar. Intenta de nuevo o escríbenos por WhatsApp.');
      restaurar();
    }
  });
}
