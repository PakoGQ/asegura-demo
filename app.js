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

// La clase es `open`, no `active`: así la nombra el CSS heredado, que la usa en
// dos reglas — `.modal-overlay.open` (opacity y pointer-events) y
// `.modal-overlay.open .modal` (la transición del panel). Con `active` el modal
// recibía la clase y se quedaba en opacity:0 y pointer-events:none, o sea
// invisible y sin recibir clics: el botón "no hacía nada".
function openModal(id)  { const m = $('#' + id); if (m) m.classList.add('open'); }
function closeModal(id) { const m = $('#' + id); if (m) m.classList.remove('open'); }

function togglePassword(btn) {
  const input = btn.parentElement.querySelector('input');
  const icono = btn.querySelector('i');
  const oculto = input.type === 'password';
  input.type = oculto ? 'text' : 'password';
  icono.className = oculto ? 'fas fa-eye-slash' : 'fas fa-eye';
}

/* La fecha de HOY en la zona del usuario.

   `new Date().toISOString()` convierte a UTC primero: en México (UTC-6) toda
   hora a partir de las 18:00 devuelve el día siguiente. Con eso, «Citas de hoy»
   mostraba las de mañana y la rejilla de disponibilidad deshabilitaba el día en
   curso por creerlo pasado. Se comprobó a las 18:13 del 29-jul: toISOString
   decía 2026-07-30.

   Todo lo que compare contra un `date` de Postgres —que no tiene zona— tiene
   que pasar por aquí. */
function fechaISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const hoyISO = () => fechaISO(new Date());

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
    descripcion: 'Doce años ayudando a familias a entender qué cubre realmente su póliza. Me especializo en gastos médicos y vida; explico sin tecnicismos y acompaño el trámite completo cuando hay siniestro.',
    cedula: 'A1-448210', anios_experiencia: 12, ciudad: 'Guadalajara', zona: 'Providencia',
    lat: 20.71, lng: -103.39, whatsapp: '523310000002',
    ramos: ['gastos_medicos', 'vida', 'auto', 'hogar'],
    especialidades: ['gastos_medicos', 'vida'],
    modalidades: ['oficina', 'domicilio', 'videollamada'],
    idiomas: ['Español', 'Inglés'],
    disponible: true, verificado: true, es_destacado: true, top10: true, es_nuevo: false,
    calificacion: 4.67, num_resenas: 3, num_citas: 148,
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
    cedula: 'A1-905611', anios_experiencia: 3, ciudad: 'Tlaquepaque', zona: 'Tlaquepaque',
    lat: 20.64, lng: -103.312, whatsapp: '523310000005',
    ramos: ['vida', 'educativo', 'gastos_medicos'],
    especialidades: ['vida', 'educativo'],
    modalidades: ['oficina', 'domicilio', 'videollamada', 'cafe'],
    idiomas: ['Español'],
    disponible: true, verificado: false, es_destacado: false, top10: false, es_nuevo: true,
    calificacion: 5.0, num_resenas: 1, num_citas: 21,
  },
  {
    id: 'demo-5', slug: 'carolina-vega', nombre: 'Carolina Vega',
    foto: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Vida, ahorro y retiro',
    descripcion: 'Trabajo planes de vida con componente de ahorro. Me tomo dos sesiones antes de proponer nada: primero entender en qué gastas, luego cuánto puedes apartar sin que te duela.',
    cedula: 'A1-512044', anios_experiencia: 9, ciudad: 'Guadalajara', zona: 'Providencia',
    lat: 20.706, lng: -103.384, whatsapp: '523310000006',
    ramos: ['vida', 'educativo', 'gastos_medicos'],
    especialidades: ['vida', 'educativo'],
    modalidades: ['oficina', 'videollamada'],
    idiomas: ['Español', 'Inglés'],
    disponible: true, verificado: true, es_destacado: true, top10: true, es_nuevo: false,
    calificacion: 4.75, num_resenas: 4, num_citas: 127,
  },
  {
    id: 'demo-6', slug: 'ricardo-ibarra', nombre: 'Ricardo Ibarra',
    foto: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Auto y hogar para familias',
    descripcion: 'Autos y casa, que es lo que casi todos necesitan primero. Contesto WhatsApp el mismo día y te acompaño si chocas, aunque sea domingo.',
    cedula: 'A2-238190', anios_experiencia: 6, ciudad: 'Zapopan', zona: 'Zapopan',
    lat: 20.7284, lng: -103.3968, whatsapp: '523310000007',
    ramos: ['auto', 'hogar', 'vida'],
    especialidades: ['auto', 'hogar'],
    modalidades: ['oficina', 'domicilio', 'videollamada'],
    idiomas: ['Español'],
    disponible: true, verificado: true, es_destacado: false, top10: false, es_nuevo: false,
    calificacion: 4.67, num_resenas: 3, num_citas: 84,
  },
  {
    id: 'demo-7', slug: 'mariana-cordero', nombre: 'Mariana Cordero',
    foto: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Gastos médicos y seguros de vida',
    descripcion: 'Me especializo en gastos médicos mayores para personas con preexistencias, que es donde más gente se queda fuera. Reviso caso por caso qué aseguradora acepta qué.',
    cedula: 'A1-667320', anios_experiencia: 11, ciudad: 'Guadalajara', zona: 'Centro',
    lat: 20.6817, lng: -103.3435, whatsapp: '523310000008',
    ramos: ['gastos_medicos', 'vida', 'hogar'],
    especialidades: ['gastos_medicos', 'vida'],
    modalidades: ['oficina', 'domicilio', 'videollamada'],
    idiomas: ['Español', 'Inglés'],
    disponible: true, verificado: true, es_destacado: true, top10: false, es_nuevo: false,
    calificacion: 4.75, num_resenas: 4, num_citas: 156,
  },
  {
    id: 'demo-8', slug: 'diego-salcedo', nombre: 'Diego Salcedo',
    foto: 'https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Autos, motos y seguro de vida',
    descripcion: 'Autos y motos, incluyendo lo que casi nadie quiere asegurar: repartidores y motociclistas. También armo coberturas de vida para quien trabaja por su cuenta.',
    cedula: 'A2-401558', anios_experiencia: 5, ciudad: 'Guadalajara', zona: 'Chapultepec',
    lat: 20.674, lng: -103.373, whatsapp: '523310000009',
    ramos: ['auto', 'vida', 'gastos_medicos'],
    especialidades: ['auto', 'vida'],
    modalidades: ['oficina', 'domicilio', 'cafe'],
    idiomas: ['Español'],
    disponible: true, verificado: true, es_destacado: false, top10: false, es_nuevo: false,
    calificacion: 4.5, num_resenas: 2, num_citas: 67,
  },
  {
    id: 'demo-9', slug: 'valeria-ocampo', nombre: 'Valeria Ocampo',
    foto: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Gastos médicos y plan educativo',
    descripcion: 'Atiendo sobre todo a familias jóvenes: el primer seguro de gastos médicos y el plan de la universidad de los niños. Trabajo mucho por videollamada porque sé lo que es tener bebés en casa.',
    cedula: 'A1-780412', anios_experiencia: 8, ciudad: 'Zapopan', zona: 'Andares',
    lat: 20.713, lng: -103.411, whatsapp: '523310000010',
    ramos: ['gastos_medicos', 'educativo', 'vida'],
    especialidades: ['gastos_medicos', 'educativo'],
    modalidades: ['oficina', 'videollamada', 'domicilio'],
    idiomas: ['Español', 'Inglés'],
    disponible: true, verificado: true, es_destacado: false, top10: true, es_nuevo: false,
    calificacion: 5.0, num_resenas: 3, num_citas: 112,
  },
  {
    id: 'demo-10', slug: 'emilio-cardenas', nombre: 'Emilio Cárdenas',
    foto: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Responsabilidad civil y fianzas',
    descripcion: 'Empresarial y fianzas. Trabajo con despachos, constructoras y proveedores de gobierno que necesitan fianza de cumplimiento y no saben por dónde empezar.',
    cedula: 'A1-334907', anios_experiencia: 13, ciudad: 'Guadalajara', zona: 'Providencia',
    lat: 20.716, lng: -103.394, whatsapp: '523310000011',
    ramos: ['empresarial', 'fianzas', 'auto'],
    especialidades: ['empresarial', 'fianzas'],
    modalidades: ['oficina', 'videollamada'],
    idiomas: ['Español', 'Inglés'],
    disponible: true, verificado: true, es_destacado: true, top10: false, es_nuevo: false,
    calificacion: 4.67, num_resenas: 3, num_citas: 98,
  },
  {
    id: 'demo-11', slug: 'paulina-renteria', nombre: 'Paulina Rentería',
    foto: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Vida y protección del hogar',
    descripcion: 'Seguros de vida y de casa habitación. Me gusta el trabajo de revisar pólizas viejas: casi siempre están mal aseguradas, por arriba o por abajo.',
    cedula: 'A2-556183', anios_experiencia: 4, ciudad: 'Zapopan', zona: 'Zapopan',
    lat: 20.7164, lng: -103.3848, whatsapp: '523310000012',
    ramos: ['vida', 'hogar', 'auto'],
    especialidades: ['vida', 'hogar'],
    modalidades: ['oficina', 'domicilio', 'videollamada'],
    idiomas: ['Español'],
    disponible: true, verificado: true, es_destacado: false, top10: false, es_nuevo: false,
    calificacion: 4.5, num_resenas: 2, num_citas: 52,
  },
  {
    id: 'demo-12', slug: 'arturo-lozano', nombre: 'Arturo Lozano',
    foto: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Empresarial, flotillas y patrimonio',
    descripcion: 'Veintiocho años en el ramo. He visto tres crisis y sé qué pólizas aguantan y cuáles no. Atiendo empresas medianas y patrimonios familiares.',
    cedula: 'A1-102776', anios_experiencia: 28, ciudad: 'Guadalajara', zona: 'Centro',
    lat: 20.6807, lng: -103.3535, whatsapp: '523310000013',
    ramos: ['empresarial', 'auto', 'hogar', 'fianzas'],
    especialidades: ['empresarial', 'auto'],
    modalidades: ['oficina', 'domicilio', 'videollamada'],
    idiomas: ['Español', 'Inglés'],
    disponible: true, verificado: true, es_destacado: true, top10: true, es_nuevo: false,
    calificacion: 4.8, num_resenas: 5, num_citas: 312,
  },
  {
    id: 'demo-13', slug: 'sebastian-munoz', nombre: 'Sebastián Muñoz',
    foto: 'https://images.unsplash.com/photo-1552374196-c4e7ffc6e126?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Auto y hogar',
    descripcion: 'Llevo dos años en esto y me tomo el tiempo que otros ya no tienen. Si es tu primer seguro, te explico desde qué significa deducible.',
    cedula: 'A2-889021', anios_experiencia: 2, ciudad: 'Tlaquepaque', zona: 'Tlaquepaque',
    lat: 20.646, lng: -103.308, whatsapp: '523310000014',
    ramos: ['auto', 'hogar'],
    especialidades: ['auto', 'hogar'],
    modalidades: ['oficina', 'domicilio', 'cafe', 'videollamada'],
    idiomas: ['Español'],
    disponible: true, verificado: false, es_destacado: false, top10: false, es_nuevo: true,
    calificacion: 5.0, num_resenas: 1, num_citas: 14,
  },
  {
    id: 'demo-14', slug: 'regina-fuentes', nombre: 'Regina Fuentes',
    foto: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Plan educativo y seguro de vida',
    descripcion: 'Planes educativos, sobre todo. Me buscan papás que quieren asegurar la universidad de sus hijos y no saben si les conviene un seguro o una inversión. Les enseño las dos cuentas.',
    cedula: 'A1-445902', anios_experiencia: 6, ciudad: 'Tlajomulco', zona: 'Tlajomulco',
    lat: 20.4786, lng: -103.4413, whatsapp: '523310000015',
    ramos: ['educativo', 'vida', 'gastos_medicos'],
    especialidades: ['educativo', 'vida'],
    modalidades: ['oficina', 'domicilio', 'videollamada'],
    idiomas: ['Español'],
    disponible: true, verificado: true, es_destacado: false, top10: false, es_nuevo: false,
    calificacion: 4.67, num_resenas: 3, num_citas: 61,
  },
  {
    id: 'demo-15', slug: 'oscar-villalobos', nombre: 'Óscar Villalobos',
    foto: 'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Flotillas y transporte de carga',
    descripcion: 'Flotillas y transporte de carga. Si mueves mercancía, el seguro de la unidad es la mitad del problema: falta la carga, la responsabilidad civil y el conductor.',
    cedula: 'A2-673140', anios_experiencia: 10, ciudad: 'Zapopan', zona: 'Zapopan',
    lat: 20.7184, lng: -103.3988, whatsapp: '523310000016',
    ramos: ['auto', 'empresarial', 'fianzas'],
    especialidades: ['auto', 'empresarial'],
    modalidades: ['oficina', 'domicilio'],
    idiomas: ['Español'],
    disponible: false, verificado: true, es_destacado: false, top10: false, es_nuevo: false,
    calificacion: 4.5, num_resenas: 2, num_citas: 143,
  },
  {
    id: 'demo-16', slug: 'adriana-solis', nombre: 'Adriana Solís',
    foto: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Gastos médicos mayores y vida',
    descripcion: 'Veintidós años en gastos médicos. Conozco los hospitales, a los médicos y los procesos de cada aseguradora. Cuando hay un siniestro grave, eso es lo que hace la diferencia.',
    cedula: 'A1-208855', anios_experiencia: 22, ciudad: 'Guadalajara', zona: 'Providencia',
    lat: 20.717, lng: -103.387, whatsapp: '523310000017',
    ramos: ['gastos_medicos', 'vida', 'educativo'],
    especialidades: ['gastos_medicos', 'vida'],
    modalidades: ['oficina', 'domicilio', 'videollamada'],
    idiomas: ['Español', 'Inglés'],
    disponible: true, verificado: true, es_destacado: true, top10: true, es_nuevo: false,
    calificacion: 4.8, num_resenas: 5, num_citas: 268,
  },
  {
    id: 'demo-17', slug: 'fernanda-cazares', nombre: 'Fernanda Cázares',
    foto: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Seguros para PyME',
    descripcion: 'Empresarial para negocios chicos: la papelería, el restaurante, el consultorio. Coberturas que sí caben en el presupuesto de una empresa de diez personas.',
    cedula: 'A1-591274', anios_experiencia: 9, ciudad: 'Zapopan', zona: 'Andares',
    lat: 20.706, lng: -103.421, whatsapp: '523310000018',
    ramos: ['empresarial', 'gastos_medicos', 'hogar', 'fianzas'],
    especialidades: ['empresarial', 'gastos_medicos'],
    modalidades: ['oficina', 'videollamada', 'domicilio'],
    idiomas: ['Español', 'Inglés'],
    disponible: true, verificado: true, es_destacado: false, top10: false, es_nuevo: false,
    calificacion: 4.67, num_resenas: 3, num_citas: 104,
  },
  {
    id: 'demo-18', slug: 'ximena-robles', nombre: 'Ximena Robles',
    foto: 'https://images.unsplash.com/photo-1580894732444-8ecded7900cd?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Hogar y automóvil',
    descripcion: 'Casa habitación y auto. Me tocó vivir una inundación en 2019 y desde entonces reviso con lupa las coberturas de fenómenos hidrometeorológicos, que casi nadie lee.',
    cedula: 'A2-712638', anios_experiencia: 5, ciudad: 'Guadalajara', zona: 'Centro',
    lat: 20.6717, lng: -103.3415, whatsapp: '523310000019',
    ramos: ['hogar', 'auto', 'vida'],
    especialidades: ['hogar', 'auto'],
    modalidades: ['oficina', 'domicilio', 'cafe'],
    idiomas: ['Español'],
    disponible: true, verificado: true, es_destacado: false, top10: false, es_nuevo: false,
    calificacion: 4.5, num_resenas: 2, num_citas: 48,
  },
  {
    id: 'demo-19', slug: 'alonso-guerra', nombre: 'Alonso Guerra',
    foto: 'https://images.unsplash.com/photo-1584999734482-0361aecad844?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Vida y ahorro para jóvenes profesionistas',
    descripcion: 'Trabajo con gente de mi generación: primer trabajo formal, primer seguro, primeras ganas de ahorrar. Sin discursos de miedo.',
    cedula: 'A2-940517', anios_experiencia: 3, ciudad: 'Guadalajara', zona: 'Chapultepec',
    lat: 20.684, lng: -103.365, whatsapp: '523310000020',
    ramos: ['vida', 'educativo', 'auto'],
    especialidades: ['vida', 'educativo'],
    modalidades: ['cafe', 'videollamada', 'oficina'],
    idiomas: ['Español', 'Inglés'],
    disponible: true, verificado: true, es_destacado: false, top10: false, es_nuevo: true,
    calificacion: 5.0, num_resenas: 2, num_citas: 29,
  },
  {
    id: 'demo-20', slug: 'rodrigo-palomar', nombre: 'Rodrigo Palomar',
    foto: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Fianzas y riesgos empresariales',
    descripcion: 'Diecisiete años en fianzas: cumplimiento, anticipo, vicios ocultos y judiciales. Trabajo con constructoras y con proveedores del sector público.',
    cedula: 'A1-160349', anios_experiencia: 17, ciudad: 'Zapopan', zona: 'Andares',
    lat: 20.704, lng: -103.413, whatsapp: '523310000021',
    ramos: ['fianzas', 'empresarial', 'auto'],
    especialidades: ['fianzas', 'empresarial'],
    modalidades: ['oficina', 'videollamada'],
    idiomas: ['Español', 'Inglés'],
    disponible: true, verificado: true, es_destacado: true, top10: false, es_nuevo: false,
    calificacion: 4.67, num_resenas: 3, num_citas: 176,
  },
  {
    id: 'demo-21', slug: 'daniela-ceballos', nombre: 'Daniela Ceballos',
    foto: 'https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Auto y casa habitación',
    descripcion: 'Autos y casa. Trabajo mucho con mujeres que compran su primer coche o su primer departamento y no quieren que las traten como si no entendieran.',
    cedula: 'A2-627450', anios_experiencia: 4, ciudad: 'Tlaquepaque', zona: 'Tlaquepaque',
    lat: 20.645, lng: -103.316, whatsapp: '523310000022',
    ramos: ['auto', 'hogar', 'vida'],
    especialidades: ['auto', 'hogar'],
    modalidades: ['oficina', 'domicilio', 'videollamada', 'cafe'],
    idiomas: ['Español'],
    disponible: true, verificado: true, es_destacado: false, top10: false, es_nuevo: false,
    calificacion: 4.67, num_resenas: 3, num_citas: 57,
  },
  {
    id: 'demo-22', slug: 'claudia-mercado', nombre: 'Claudia Mercado',
    foto: 'https://images.unsplash.com/photo-1546961329-78bef0414d7c?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Gastos médicos y hogar',
    descripcion: 'Gastos médicos para familias y adultos mayores, que es donde las pólizas se ponen caras y hay que saber comparar. También aseguro casas.',
    cedula: 'A1-483726', anios_experiencia: 7, ciudad: 'Zapopan', zona: 'Zapopan',
    lat: 20.7244, lng: -103.3858, whatsapp: '523310000023',
    ramos: ['gastos_medicos', 'hogar', 'vida'],
    especialidades: ['gastos_medicos', 'hogar'],
    modalidades: ['oficina', 'domicilio', 'videollamada'],
    idiomas: ['Español'],
    disponible: true, verificado: true, es_destacado: false, top10: false, es_nuevo: false,
    calificacion: 4.67, num_resenas: 3, num_citas: 89,
  },
  {
    id: 'demo-23', slug: 'natalia-esquivel', nombre: 'Natalia Esquivel',
    foto: 'https://images.unsplash.com/photo-1607746882042-944635dfe10e?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Vida y gastos médicos',
    descripcion: 'Vida y gastos médicos. Me interesa mucho la parte de sucesión: que el dinero llegue a quien tiene que llegar, sin pleitos ni trámites eternos.',
    cedula: 'A1-357291', anios_experiencia: 10, ciudad: 'Guadalajara', zona: 'Providencia',
    lat: 20.705, lng: -103.396, whatsapp: '523310000024',
    ramos: ['vida', 'gastos_medicos', 'educativo'],
    especialidades: ['vida', 'gastos_medicos'],
    modalidades: ['oficina', 'videollamada', 'domicilio'],
    idiomas: ['Español', 'Inglés'],
    disponible: true, verificado: true, es_destacado: false, top10: true, es_nuevo: false,
    calificacion: 4.75, num_resenas: 4, num_citas: 131,
  },
  {
    id: 'demo-24', slug: 'renata-aguilar', nombre: 'Renata Aguilar',
    foto: 'https://images.unsplash.com/photo-1554151228-14d9def656e4?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Plan educativo y protección familiar',
    descripcion: 'Planes educativos y seguros de vida para papás jóvenes. Hago la cuenta de cuánto cuesta realmente una carrera dentro de quince años, que es el número que a nadie le gusta ver.',
    cedula: 'A2-802914', anios_experiencia: 5, ciudad: 'Guadalajara', zona: 'Centro',
    lat: 20.6827, lng: -103.3525, whatsapp: '523310000025',
    ramos: ['educativo', 'vida', 'gastos_medicos'],
    especialidades: ['educativo', 'vida'],
    modalidades: ['oficina', 'videollamada', 'domicilio', 'cafe'],
    idiomas: ['Español'],
    disponible: true, verificado: true, es_destacado: false, top10: false, es_nuevo: false,
    calificacion: 4.5, num_resenas: 2, num_citas: 63,
  },
  {
    id: 'demo-25', slug: 'isabel-navarro', nombre: 'Isabel Navarro',
    foto: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Auto y seguro de vida',
    descripcion: 'Autos y vida en la zona sur. Vivo en Tlajomulco, así que si hay un siniestro por acá llego en veinte minutos.',
    cedula: 'A2-119503', anios_experiencia: 6, ciudad: 'Tlajomulco', zona: 'Tlajomulco',
    lat: 20.4676, lng: -103.4503, whatsapp: '523310000026',
    ramos: ['auto', 'vida', 'hogar'],
    especialidades: ['auto', 'vida'],
    modalidades: ['oficina', 'domicilio', 'videollamada'],
    idiomas: ['Español'],
    disponible: true, verificado: true, es_destacado: false, top10: false, es_nuevo: false,
    calificacion: 4.5, num_resenas: 2, num_citas: 44,
  },
  {
    id: 'demo-26', slug: 'gabriela-ponce', nombre: 'Gabriela Ponce',
    foto: 'https://images.unsplash.com/photo-1611432579699-484f7990b127?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Hogar, vida y responsabilidad civil',
    descripcion: 'Casa habitación y responsabilidad civil familiar, que es la cobertura más barata y la que menos gente contrata. También seguros de vida.',
    cedula: 'A1-742086', anios_experiencia: 8, ciudad: 'Tlaquepaque', zona: 'Tlaquepaque',
    lat: 20.636, lng: -103.305, whatsapp: '523310000027',
    ramos: ['hogar', 'vida', 'auto'],
    especialidades: ['hogar', 'vida'],
    modalidades: ['oficina', 'domicilio', 'videollamada'],
    idiomas: ['Español'],
    disponible: true, verificado: true, es_destacado: false, top10: false, es_nuevo: false,
    calificacion: 4.67, num_resenas: 3, num_citas: 71,
  },
  {
    id: 'demo-27', slug: 'andres-mora', nombre: 'Andrés Mora',
    foto: 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Auto, flotillas y negocio',
    descripcion: 'Autos particulares y flotillas medianas. Llevo once años y sigo haciendo lo mismo: cotizo con varias aseguradoras y te enseño las tres opciones, no solo la que más me conviene.',
    cedula: 'A2-295640', anios_experiencia: 11, ciudad: 'Zapopan', zona: 'Zapopan',
    lat: 20.7274, lng: -103.3948, whatsapp: '523310000028',
    ramos: ['auto', 'empresarial', 'hogar'],
    especialidades: ['auto', 'empresarial'],
    modalidades: ['oficina', 'domicilio', 'videollamada'],
    idiomas: ['Español'],
    disponible: true, verificado: true, es_destacado: false, top10: false, es_nuevo: false,
    calificacion: 4.67, num_resenas: 3, num_citas: 118,
  },
  {
    id: 'demo-28', slug: 'tomas-bribiesca', nombre: 'Tomás Bribiesca',
    foto: 'https://images.unsplash.com/photo-1595152772835-219674b2a8a6?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Auto y hogar en el Centro',
    descripcion: 'Atiendo el Centro y la zona Olímpica. Autos, casa y lo básico de vida. Voy a donde estés: local, casa o café.',
    cedula: 'A2-508371', anios_experiencia: 3, ciudad: 'Guadalajara', zona: 'Centro',
    lat: 20.6697, lng: -103.3445, whatsapp: '523310000029',
    ramos: ['auto', 'hogar', 'vida'],
    especialidades: ['auto', 'hogar'],
    modalidades: ['domicilio', 'cafe', 'oficina'],
    idiomas: ['Español'],
    disponible: false, verificado: false, es_destacado: false, top10: false, es_nuevo: true,
    calificacion: 4.0, num_resenas: 1, num_citas: 11,
  },
  {
    id: 'demo-29', slug: 'lucia-arriaga', nombre: 'Lucía Arriaga',
    foto: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Gastos médicos internacionales',
    descripcion: 'Gastos médicos con cobertura internacional, para quien viaja o tiene familia fuera. También planes educativos con estudios en el extranjero.',
    cedula: 'A1-863052', anios_experiencia: 14, ciudad: 'Zapopan', zona: 'Andares',
    lat: 20.714, lng: -103.422, whatsapp: '523310000030',
    ramos: ['gastos_medicos', 'educativo', 'vida'],
    especialidades: ['gastos_medicos', 'educativo'],
    modalidades: ['oficina', 'videollamada'],
    idiomas: ['Español', 'Inglés', 'Francés'],
    disponible: true, verificado: true, es_destacado: true, top10: true, es_nuevo: false,
    calificacion: 4.75, num_resenas: 4, num_citas: 187,
  },
  {
    id: 'demo-30', slug: 'javier-zepeda', nombre: 'Javier Zepeda',
    foto: 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=600&h=700&fit=crop&crop=faces&auto=format&q=75',
    titulo: 'Empresarial y flotillas corporativas',
    descripcion: 'Riesgos empresariales para empresas medianas: planta, inventario, flotilla y responsabilidad civil, todo en un mismo programa para que no queden huecos entre pólizas.',
    cedula: 'A1-674128', anios_experiencia: 9, ciudad: 'Guadalajara', zona: 'Providencia',
    lat: 20.707, lng: -103.386, whatsapp: '523310000031',
    ramos: ['empresarial', 'auto', 'fianzas', 'hogar'],
    especialidades: ['empresarial', 'auto'],
    modalidades: ['oficina', 'videollamada', 'domicilio'],
    idiomas: ['Español', 'Inglés'],
    disponible: true, verificado: true, es_destacado: false, top10: false, es_nuevo: false,
    calificacion: 4.67, num_resenas: 3, num_citas: 95,
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
  const hero = $('#hero');
  if (!hero) return;

  // Se pausa al pasar el mouse: nada peor que leer y que la slide se vaya.
  hero.addEventListener('mouseenter', pausarCarrusel);
  hero.addEventListener('mouseleave', reiniciarCarrusel);

  // En un celular no hay mouseenter, así que el hero rotaba mientras el
  // visitante leía y el botón se le iba de abajo del dedo. Al tocar se para;
  // se reanuda al levantar el dedo, con margen para completar el toque.
  hero.addEventListener('touchstart', pausarCarrusel, { passive: true });
  hero.addEventListener('touchend', () => setTimeout(reiniciarCarrusel, 4000), { passive: true });

  // Con la pestaña en segundo plano no tiene sentido gastar el intervalo.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pausarCarrusel(); else reiniciarCarrusel();
  });
}

function pausarCarrusel() {
  clearInterval(heroTimer);
  heroTimer = null;
}

function reiniciarCarrusel() {
  pausarCarrusel();
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

/* Antes cualquier fallo decía «Correo o contraseña incorrectos», incluido el
   límite de intentos, el correo sin confirmar y una caída de red. Eso deja al
   usuario probando la misma contraseña una y otra vez sin saber que el problema
   es otro. Ahora se distingue, y lo que no se reconoce se muestra tal cual en
   vez de esconderse detrás de un mensaje genérico. */
function motivoDeLoginFallido(error) {
  const codigo = (error.code || '').toLowerCase();
  const texto = (error.message || '').toLowerCase();
  const es = (x) => codigo.includes(x) || texto.includes(x);

  if (es('invalid_credentials') || es('invalid login credentials')) {
    return 'Correo o contraseña incorrectos.';
  }
  if (es('email_not_confirmed') || es('email not confirmed')) {
    return 'Esa cuenta existe pero su correo no está confirmado. Tu director tiene que confirmarla.';
  }
  if (es('rate limit') || es('over_request_rate')) {
    return 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.';
  }
  if (es('user_banned')) return 'Esa cuenta está bloqueada. Contacta a tu director.';
  if (es('failed to fetch') || es('network')) {
    return 'No hay conexión con el servidor. Revisa tu internet.';
  }
  // Nada reconocido: se muestra el mensaje original, que es más útil que
  // inventar una causa.
  return `No se pudo entrar: ${error.message || 'error desconocido'}`;
}

async function doLogin() {
  const err   = $('#loginError');
  const email = $('#loginEmail').value.trim();
  const pass  = $('#loginPass').value;

  const fallar = (msg) => {
    if (err) { err.style.display = 'block'; err.querySelector('span').textContent = msg; }
  };
  if (err) err.style.display = 'none';

  if (!window.sbClient) {
    fallar('El sistema todavía no está conectado a su base de datos. Avisa a quien lo administra.');
    return;
  }
  if (!email || !pass) { fallar('Escribe tu correo y tu contraseña.'); return; }

  const { error } = await sbClient.auth.signInWithPassword({ email, password: pass });
  if (error) { fallar(motivoDeLoginFallido(error)); return; }

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
  await reflejarSesionEnPublico();

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
  // Dos ramos, no tres: con la tarjeta a 5 por fila, el tercero salta de línea
  // y descuadra la altura de toda la fila.
  const ramos = (a.ramos || []).slice(0, 2)
    .map((r) => `<span class="pill pill-sm">${esc((RAMOS[r] || {}).label || r)}</span>`).join('');

  // La distancia solo aparece si el visitante compartió su ubicación; ocupa el
  // lugar de los años de experiencia, que es el dato menos decisivo de los dos.
  const kmSobreFoto = a._km !== null && a._km !== undefined
    ? `<span class="agente-card-sf-km">a ${a._km.toFixed(1)} km</span>`
    : `<span class="agente-card-sf-exp"><i class="fas fa-id-card"></i> ${a.anios_experiencia || 0} años</span>`;

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
        <div class="agente-card-sobrefoto">
          <div class="agente-card-sf-nombre">
            <span class="agente-card-sf-n">${esc(a.nombre)}${a.verificado
              ? '<i class="fas fa-circle-check ver-badge" title="Cédula verificada"></i>' : ''}</span>
            <span class="agente-card-sf-rate">★ ${Number(a.calificacion).toFixed(1)}
              <small>(${a.num_resenas || 0})</small></span>
          </div>
          <div class="agente-card-sf-meta">
            <span><i class="fas fa-location-dot"></i> ${esc(a.zona || a.ciudad || '')}</span>
            <span class="agente-card-sf-sep">·</span>
            ${kmSobreFoto}
          </div>
        </div>
      </a>
      <div class="agente-card-body">
        <p class="agente-card-desc">${esc(a.titulo || '')}</p>
        <div class="agente-card-tags">${ramos}</div>
        <a class="btn btn-acento btn-sm agente-card-cta" href="perfil.html?a=${esc(a.slug)}">
          <i class="fas fa-calendar-check"></i> Agendar
        </a>
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
    { autor: 'Carlos M.', calificacion: 5, texto: 'Ana me explicó punto por punto qué cubría y qué no. Es la primera vez que entiendo mi póliza.', dias: 8 },
    { autor: 'Patricia N.', calificacion: 5, texto: 'Me acompañó todo el trámite del siniestro. Contestaba el teléfono a las 10 de la noche.', dias: 25 },
    { autor: 'Eduardo L.', calificacion: 4, texto: 'Muy clara y honesta. Me dijo que no me convenía el plan que yo quería y me explicó por qué.', dias: 42 },
  ],
  'luis-torres': [
    { autor: 'Héctor V.', calificacion: 5, texto: 'Nos reestructuró la flotilla y bajamos 18% la prima con la misma cobertura.', dias: 8 },
    { autor: 'Adriana C.', calificacion: 4, texto: 'Buen servicio, respondió rápido cada duda.', dias: 25 },
  ],
  'sofia-beltran': [
    { autor: 'Transportes del Bajío', calificacion: 5, texto: 'Manejó nuestras fianzas de cumplimiento sin un solo retraso en tres años.', dias: 10 },
  ],
  'miguel-aguirre': [
    { autor: 'Rodrigo P.', calificacion: 5, texto: 'Joven pero muy preparado. Me hizo números que nadie me había hecho.', dias: 11 },
  ],
  'carolina-vega': [
    { autor: 'Mónica T.', calificacion: 5, texto: 'Me hizo ver que estaba pagando de más por una cobertura que no usaba. Ajustamos y ahorro 400 pesos al mes.', dias: 10 },
    { autor: 'Jorge A.', calificacion: 5, texto: 'Paciente y clarísima. Me explicó tres veces lo del fondo de ahorro hasta que lo entendí.', dias: 27 },
    { autor: 'Silvia R.', calificacion: 4, texto: 'Buen trato. Tardó un poco en mandarme la propuesta pero valió la pena.', dias: 44 },
    { autor: 'Néstor B.', calificacion: 5, texto: 'La recomendé con mi hermano y también quedó contento.', dias: 61 },
  ],
  'ricardo-ibarra': [
    { autor: 'Fabiola M.', calificacion: 5, texto: 'Choqué un sábado en la noche y me contestó al segundo timbrazo. Eso vale más que cualquier descuento.', dias: 11 },
    { autor: 'Ignacio P.', calificacion: 4, texto: 'Cumplido y derecho. Sin letras chiquitas.', dias: 28 },
    { autor: 'Lorena S.', calificacion: 5, texto: 'Nos aseguró la casa y el coche en el mismo trámite. Muy práctico.', dias: 45 },
  ],
  'mariana-cordero': [
    { autor: 'Verónica H.', calificacion: 5, texto: 'Tengo diabetes y tres agentes me habían dicho que no era asegurable. Ella encontró la forma.', dias: 12 },
    { autor: 'Raúl E.', calificacion: 5, texto: 'Sabe muchísimo. Le pregunté por deducibles y coaseguros y me explicó con ejemplos de mi propio caso.', dias: 29 },
    { autor: 'Ana Lucía G.', calificacion: 5, texto: 'Excelente. Me acompañó a la cita del hospital para revisar la cobertura.', dias: 46 },
    { autor: 'Marco A.', calificacion: 4, texto: 'Muy buena asesora, aunque cuesta agendar con ella porque siempre está llena.', dias: 63 },
  ],
  'diego-salcedo': [
    { autor: 'Kevin R.', calificacion: 5, texto: 'Soy repartidor y nadie me quería asegurar la moto. Diego sí.', dias: 10 },
    { autor: 'Tania V.', calificacion: 4, texto: 'Buena atención y precio justo.', dias: 27 },
  ],
  'valeria-ocampo': [
    { autor: 'Diana C.', calificacion: 5, texto: 'Nos atendió por videollamada a las 9 de la noche con el bebé dormido. Muy humana.', dias: 11 },
    { autor: 'Alejandro M.', calificacion: 5, texto: 'Comparó cuatro planes educativos en una tabla y nos dejó decidir. Cero presión.', dias: 28 },
    { autor: 'Brenda L.', calificacion: 5, texto: 'Clarísima con los números. Sabe explicar sin marear.', dias: 45 },
  ],
  'emilio-cardenas': [
    { autor: 'Constructora Arjona', calificacion: 5, texto: 'Nos sacó la fianza de cumplimiento en cuatro días cuando la licitación cerraba en cinco.', dias: 12 },
    { autor: 'Despacho Vera y Asoc.', calificacion: 5, texto: 'Serio y bien preparado. Entiende de contratos, no solo de pólizas.', dias: 29 },
    { autor: 'Ismael T.', calificacion: 4, texto: 'Muy profesional. El trámite tardó pero él estuvo encima todo el tiempo.', dias: 46 },
  ],
  'paulina-renteria': [
    { autor: 'Rosario D.', calificacion: 5, texto: 'Revisó la póliza que tenía desde hace ocho años y estaba asegurada por la mitad del valor de mi casa.', dias: 13 },
    { autor: 'Gerardo N.', calificacion: 4, texto: 'Atenta y puntual.', dias: 30 },
  ],
  'arturo-lozano': [
    { autor: 'Grupo Industrial Poniente', calificacion: 5, texto: 'Lleva nuestra cuenta desde 2011. Nunca hemos tenido un siniestro mal atendido.', dias: 10 },
    { autor: 'Rebeca F.', calificacion: 5, texto: 'Es de la vieja escuela: te visita, te explica en papel y te llama para recordarte la renovación.', dias: 27 },
    { autor: 'Martín O.', calificacion: 5, texto: 'El mejor asesor con el que he trabajado. Sabe de seguros y sabe de negocios.', dias: 44 },
    { autor: 'Elena Q.', calificacion: 4, texto: 'Muy bueno, aunque no es el más rápido con el WhatsApp. Prefiere el teléfono.', dias: 61 },
    { autor: 'Hugo S.', calificacion: 5, texto: 'Me salvó de una cláusula que me dejaba sin cobertura en el almacén.', dias: 78 },
  ],
  'sebastian-munoz': [
    { autor: 'Cristina B.', calificacion: 5, texto: 'Era mi primer seguro de coche y no entendía nada. Me explicó con muchísima paciencia.', dias: 12 },
  ],
  'regina-fuentes': [
    { autor: 'Karla J.', calificacion: 5, texto: 'Nos hizo la comparación contra un fondo de inversión sin adornar nada a su favor. Eso me dio confianza.', dias: 11 },
    { autor: 'Omar P.', calificacion: 4, texto: 'Buena asesoría, muy honesta.', dias: 28 },
    { autor: 'Susana M.', calificacion: 5, texto: 'Le agendé por el sitio y me confirmó en menos de una hora.', dias: 45 },
  ],
  'oscar-villalobos': [
    { autor: 'Fletes del Occidente', calificacion: 5, texto: 'Aseguró 22 unidades y la carga. Nos ahorró un dineral contra lo que traíamos.', dias: 13 },
    { autor: 'Benjamín A.', calificacion: 4, texto: 'Sabe mucho de transporte. A veces tarda en contestar pero resuelve.', dias: 30 },
  ],
  'adriana-solis': [
    { autor: 'Guillermo R.', calificacion: 5, texto: 'Mi esposa estuvo internada tres semanas. Adriana estuvo en el hospital más veces que algunos familiares.', dias: 10 },
    { autor: 'Norma I.', calificacion: 5, texto: 'Sabe exactamente a quién llamar en la aseguradora. Nos autorizaron en horas lo que llevaba días atorado.', dias: 27 },
    { autor: 'Pablo C.', calificacion: 5, texto: 'Impecable. Es la asesora que le recomiendo a mi familia.', dias: 44 },
    { autor: 'Lourdes V.', calificacion: 5, texto: 'Muchos años de experiencia y se nota en cada respuesta.', dias: 61 },
    { autor: 'Andrés G.', calificacion: 4, texto: 'Excelente en lo suyo. Su agenda está muy saturada, hay que planear.', dias: 78 },
  ],
  'fernanda-cazares': [
    { autor: 'Panadería La Espiga', calificacion: 5, texto: 'Nos armó una cobertura del local y del equipo por menos de lo que pensábamos.', dias: 13 },
    { autor: 'Dr. Everardo N.', calificacion: 5, texto: 'Aseguró el consultorio y me incluyó responsabilidad civil profesional. No sabía que existía.', dias: 30 },
    { autor: 'Miriam Z.', calificacion: 4, texto: 'Muy atenta con las PyMEs, que normalmente no le interesan a nadie.', dias: 47 },
  ],
  'ximena-robles': [
    { autor: 'Teresa L.', calificacion: 5, texto: 'Se inundó la planta baja y estábamos cubiertos gracias a que ella insistió en ese endoso.', dias: 10 },
    { autor: 'Roberto M.', calificacion: 4, texto: 'Atenta y muy clara.', dias: 27 },
  ],
  'alonso-guerra': [
    { autor: 'Daniel F.', calificacion: 5, texto: 'Me explicó el seguro de vida sin el discurso catastrofista de siempre. Muy fresco.', dias: 10 },
    { autor: 'Ale N.', calificacion: 5, texto: 'Nos vimos en un café, súper relajado, y salí con las cosas claras.', dias: 27 },
  ],
  'rodrigo-palomar': [
    { autor: 'Edificaciones del Valle', calificacion: 5, texto: 'Tres obras públicas seguidas, tres fianzas sin un solo contratiempo.', dias: 12 },
    { autor: 'Ing. Salvador U.', calificacion: 5, texto: 'Domina el tema de fianzas como pocos en Guadalajara.', dias: 29 },
    { autor: 'Grupo Constructor Mendive', calificacion: 4, texto: 'Muy competente. El precio no es el más bajo pero el servicio lo justifica.', dias: 46 },
  ],
  'daniela-ceballos': [
    { autor: 'Paola R.', calificacion: 5, texto: 'Por fin alguien que me habla a mí y no a mi esposo cuando pregunto por el seguro del coche.', dias: 13 },
    { autor: 'Erika T.', calificacion: 5, texto: 'Aseguró mi departamento y me explicó cada cobertura. Excelente.', dias: 30 },
    { autor: 'Julio C.', calificacion: 4, texto: 'Buen servicio y buena disposición.', dias: 47 },
  ],
  'claudia-mercado': [
    { autor: 'Josefina A.', calificacion: 5, texto: 'Encontró un plan para mi mamá de 71 años cuando ya nos habíamos resignado.', dias: 12 },
    { autor: 'Salvador E.', calificacion: 4, texto: 'Buena asesora, muy dedicada.', dias: 29 },
    { autor: 'Cecilia P.', calificacion: 5, texto: 'Comparó cinco opciones en una hoja y me dejó escoger con calma.', dias: 46 },
  ],
  'natalia-esquivel': [
    { autor: 'Familia Cuéllar', calificacion: 5, texto: 'Cuando falleció mi papá, el pago salió en dos semanas. Ella se encargó de todo el papeleo.', dias: 13 },
    { autor: 'Ernesto M.', calificacion: 5, texto: 'Me explicó lo de los beneficiarios preferentes, que yo tenía mal puesto desde hacía años.', dias: 30 },
    { autor: 'Alicia B.', calificacion: 5, texto: 'Muy profesional y muy humana en un tema que no es fácil de hablar.', dias: 47 },
    { autor: 'Sergio D.', calificacion: 4, texto: 'Buena asesoría. Recomendada.', dias: 64 },
  ],
  'renata-aguilar': [
    { autor: 'Mauricio H.', calificacion: 5, texto: 'La proyección que nos hizo nos abrió los ojos. Empezamos a ahorrar ese mismo mes.', dias: 11 },
    { autor: 'Liliana G.', calificacion: 4, texto: 'Muy clara y sin presionar.', dias: 28 },
  ],
  'isabel-navarro': [
    { autor: 'Néstor A.', calificacion: 5, texto: 'Vive cerca y de verdad llega. Me acompañó con el ajustador.', dias: 11 },
    { autor: 'Perla M.', calificacion: 4, texto: 'Buena atención, muy accesible.', dias: 28 },
  ],
  'gabriela-ponce': [
    { autor: 'Ramiro V.', calificacion: 5, texto: 'Mi perro mordió a un vecino y la responsabilidad civil cubrió todo. Ni sabía que la tenía.', dias: 11 },
    { autor: 'Dulce C.', calificacion: 5, texto: 'Aseguró la casa completa y me explicó qué pasa en un temblor.', dias: 28 },
    { autor: 'Arnulfo P.', calificacion: 4, texto: 'Cumplida y clara.', dias: 45 },
  ],
  'andres-mora': [
    { autor: 'Refaccionaria El Tapatío', calificacion: 5, texto: 'Nos maneja seis camionetas desde hace años. Cero problemas.', dias: 8 },
    { autor: 'Leticia R.', calificacion: 5, texto: 'Me enseñó tres cotizaciones distintas sin que se lo pidiera. Muy transparente.', dias: 25 },
    { autor: 'Joaquín S.', calificacion: 4, texto: 'Buen asesor, siempre disponible.', dias: 42 },
  ],
  'tomas-bribiesca': [
    { autor: 'Marisol E.', calificacion: 4, texto: 'Apenas va empezando pero se nota que le echa ganas. Muy atento.', dias: 12 },
  ],
  'lucia-arriaga': [
    { autor: 'Familia Zambrano', calificacion: 5, texto: 'Mi hijo estudia en Canadá y su cobertura funcionó sin un solo problema cuando se enfermó.', dias: 10 },
    { autor: 'Hilda N.', calificacion: 5, texto: 'Domina las pólizas internacionales, que son un mundo aparte.', dias: 27 },
    { autor: 'Gonzalo M.', calificacion: 5, texto: 'Habla inglés perfecto y eso ayudó muchísimo con la aseguradora extranjera.', dias: 44 },
    { autor: 'Verónica S.', calificacion: 4, texto: 'Excelente, aunque es de las más solicitadas y hay que esperar.', dias: 61 },
  ],
  'javier-zepeda': [
    { autor: 'Plásticos de Occidente', calificacion: 5, texto: 'Unificó siete pólizas dispersas en un solo programa. Encontramos dos huecos de cobertura.', dias: 10 },
    { autor: 'Lic. Fabián R.', calificacion: 4, texto: 'Ordenado y muy metódico. Sabe lo que hace.', dias: 27 },
    { autor: 'Alma D.', calificacion: 5, texto: 'Nos hizo un mapa de riesgos de la planta antes de cotizar. Nadie había hecho eso.', dias: 44 },
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

  // La marca sale de CONFIG y no escrita a mano: «Asegura» era el nombre viejo
  // del proyecto y seguía saliendo en el título de cada perfil.
  document.title = `${PERFIL.nombre} — agente de seguros en ${PERFIL.zona || PERFIL.ciudad} | ${CONFIG.MARCA}`;
  GALERIA = [PERFIL.foto].concat(FOTOS_APOYO);

  // La agenda se pide junto con las reseñas: el calendario del sidebar la
  // necesita para saber qué días ofrecer.
  const [resenas] = await Promise.all([
    cargarResenas(PERFIL),
    cargarAgendaDelPerfil(PERFIL.id),
  ]);
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

  const wa = waLink(a.whatsapp, `Hola ${a.nombre}, te vi en ${CONFIG.MARCA} y quiero preguntarte sobre un seguro.`);

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
  // Los próximos 10 días, marcados con la disponibilidad REAL del agente.
  const cont = $('#pfDias');
  if (cont) {
    const dias = [];
    const d = new Date();
    while (dias.length < 10) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0) dias.push(new Date(d));   // domingo no
    }
    const configurada = AGENDA_CONFIGURADA();
    cont.innerHTML = dias.map((f) => {
      const iso = fechaISO(f);
      // Si el agente configuró su agenda, manda ella. Si nunca la tocó, se
      // muestran los días hábiles como antes: dejarlo sin citas por no haber
      // entrado al panel sería castigarlo por algo que no sabe que existe.
      const cuantas = configurada ? HORAS_LIBRES(iso).length : 0;
      const libre = configurada ? cuantas > 0 : f.getDay() !== 6;
      return `<button class="pf-dia ${libre ? '' : 'ocupado'}"
                ${libre ? `onclick="abrirAgendar('${iso}')"` : 'disabled'}
                title="${libre
                  ? (cuantas ? `${cuantas} horario${cuantas === 1 ? '' : 's'} libre${cuantas === 1 ? '' : 's'}` : 'Con agenda disponible')
                  : 'Sin horarios ese día'}">
        <span class="pf-dia-sem">${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][f.getDay()]}</span>
        <span class="pf-dia-num">${f.getDate()}</span>
        ${libre && cuantas ? `<span class="pf-dia-libres">${cuantas}</span>` : ''}
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
  const hoy = hoyISO();
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
          <select class="form-input" id="citaHora" required></select>
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
  pintarHorasLibres();
  $('#citaFecha').addEventListener('change', pintarHorasLibres);
  openModal('citaModal');
}

/* Llena el selector de horas con las franjas que ese día tiene abiertas.

   Antes la hora era un `<input type="time">` libre: el cliente podía pedir las
   3 de la mañana, o una hora que el agente había cerrado, y la cita entraba
   igual. Ahora solo se ofrece lo que está abierto de verdad. */
function pintarHorasLibres() {
  const sel = $('#citaHora');
  const fecha = $('#citaFecha').value;
  if (!sel) return;

  // Sin agenda configurada se ofrece el horario de oficina completo, coherente
  // con que el calendario muestre los días hábiles abiertos.
  const horas = AGENDA_CONFIGURADA() ? HORAS_LIBRES(fecha) : HORAS_AGENDA;

  if (!horas.length) {
    sel.innerHTML = '<option value="">Sin horarios ese día</option>';
    sel.value = '';
    return;
  }
  const previa = sel.value;
  sel.innerHTML = horas.map((h) => `<option value="${h}">${h}</option>`).join('');
  // Se conserva la hora elegida si sigue disponible en la fecha nueva.
  sel.value = horas.includes(previa) ? previa : horas[Math.floor(horas.length / 2)];
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

/* Cerrar sesión de verdad.

   Antes era `sbClient.auth.signOut(); location.href = ...` — sin esperar. Y
   `signOut()` devuelve una promesa: navegar de inmediato aborta la petición a
   medio vuelo y la sesión se queda viva en localStorage. El usuario creía haber
   salido y seguía dentro; al volver al inicio, el botón de cuenta le ofrecía
   «Mi panel». En una computadora compartida eso es dejar la cuenta abierta.

   Ahora se espera, y solo entonces se navega. `replace` en vez de `href` para
   que el botón de atrás no regrese al panel. */
async function salirPanel(boton) {
  if (boton) {
    boton.disabled = true;
    boton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saliendo…';
  }
  sessionStorage.removeItem('demo_rol');

  if (window.sbClient) {
    try {
      const { error } = await sbClient.auth.signOut();
      if (error) throw error;
    } catch (e) {
      // Si el servidor no contesta —sin red, token ya vencido— al menos se
      // borra la sesión de este dispositivo. Salir nunca debe fallar en
      // silencio y dejar al usuario dentro.
      console.warn('signOut remoto falló, se cierra solo aquí:', e.message);
      try { await sbClient.auth.signOut({ scope: 'local' }); } catch (x) { /* ya no hay nada que borrar */ }
    }
  }
  location.replace('index.html');
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
      ? { nombre: 'Luis Lujano', rol: 'director' }
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
  return fechaISO(d);   // local, no UTC: ver la nota de `hoyISO()`
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

/* Los paneles arrancan con los arreglos de arriba y `cargarDatosDirector()`
   los sustituye por lo que haya en Supabase. Se mantiene el respaldo demo para
   que el panel siga siendo navegable sin base — igual que hace `cargarAgentes()`
   con el directorio público. */
/* Mi fila de `usuarios` con la sesión abierta. Lleva nombre, correo de
   contacto y rol — que no son lo mismo que el correo de acceso, que vive en
   Supabase Auth. */
let MI_USUARIO = null;

let CITAS       = CITAS_DEMO;
let RESENAS_MOD = RESENAS_PENDIENTES;   // pendientes de moderar
let RESENAS_OK  = [];                   // ya publicadas
let POSTULACIONES = [];
let DATOS_REALES_PANEL = false;

async function cargarDatosDirector(sesion) {
  if (!window.sbClient) return;
  // Con sesión demo no se consulta: el RLS le respondería cero filas al
  // anónimo y esos ceros pisarían los arreglos de respaldo, dejando el panel
  // vacío en vez de navegable.
  if (sesion && sesion.demo) return;
  // `agentes` viene de la vista pública, que trae id y slug: con eso se cruzan
  // las citas, que en la base guardan `agente_id`, con el resto del panel, que
  // trabaja por slug.
  const porId = new Map(AGENTES.map((a) => [a.id, a.slug]));
  try {
    const [citas, resenas, postulaciones] = await Promise.all([
      sbClient.from('citas')
        .select('id, agente_id, cliente_nombre, cliente_whatsapp, modalidad, ramo_interes, fecha, hora, estado, mensaje')
        .order('fecha', { ascending: false }),
      // Todas las reseñas de un jalón y se separan en memoria: son pocas y así
      // la pestaña de publicadas también sale de la base en vez de un arreglo.
      sbClient.from('resenas')
        .select('id, agente_id, autor, calificacion, texto, aprobada, rechazada, created_at')
        .order('created_at', { ascending: false }),
      sbClient.from('postulaciones')
        .select('id, nombre, whatsapp, ciudad, cedula, experiencia, ramos, mensaje, estado, created_at')
        .order('created_at', { ascending: false }),
    ]);
    if (citas.error)        throw citas.error;
    if (resenas.error)      throw resenas.error;
    if (postulaciones.error) throw postulaciones.error;

    CITAS = (citas.data || []).map((c) => ({
      id: c.id,
      agente: porId.get(c.agente_id) || '',
      cliente: c.cliente_nombre,
      wa: c.cliente_whatsapp,
      modalidad: c.modalidad,
      ramo: c.ramo_interes,
      fecha: String(c.fecha).slice(0, 10),
      hora: String(c.hora || '').slice(0, 5),
      estado: c.estado,
      // `mensaje` es lo que escribió el cliente al agendar. `notas` es otra
      // columna, privada del agente: leerla aquí mostraba las notas internas
      // como si fueran palabras del cliente.
      mensaje: c.mensaje || '',
    }));
    const todas = (resenas.data || []).map((r) => ({
      id: r.id,
      agente: porId.get(r.agente_id) || '',
      autor: r.autor,
      calificacion: r.calificacion,
      texto: r.texto,
      aprobada: r.aprobada,
      rechazada: r.rechazada,
      dias: Math.max(0, Math.round((Date.now() - new Date(r.created_at)) / 86400000)),
    }));
    RESENAS_MOD  = todas.filter((r) => !r.aprobada && !r.rechazada);
    RESENAS_OK   = todas.filter((r) => r.aprobada);
    POSTULACIONES = (postulaciones.data || []).filter((p) => p.estado !== 'rechazado');
    DATOS_REALES_PANEL = true;
  } catch (e) {
    console.warn('No se pudieron leer citas/reseñas de Supabase, usando demo:', e.message);
  }
}

const agentePorSlug = (slug) => AGENTES.find((a) => a.slug === slug) || {};
const citasDeEquipo = () => CITAS.map((c) => ({ ...c, ag: agentePorSlug(c.agente) }));
const esHoy = (f) => f === hoyISO();

/* ── Gráficas del panel ─────────────────────────────────────────────────────
   A diferencia del proyecto de referencia, donde las cuatro gráficas son
   arreglos escritos a mano, aquí salen de `CITAS` — o sea de Supabase. Si el
   equipo tiene pocas citas, se van a ver pocas: es el dato, no un error.

   Chart.js se carga por CDN en panel-director.html. Si no cargó, cada tarjeta
   dice por qué en vez de dejar un hueco blanco.                              */
const GRAFICAS = [];

function tokenColor(nombre, respaldo) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  return v || respaldo;
}

function ejesSobrios(color) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color }, grid: { display: false } },
      y: { beginAtZero: true, ticks: { color, precision: 0 }, grid: { color: 'rgba(0,0,0,.06)' } },
    },
  };
}

function buildGraficasDirector() {
  // Al cambiar de sección el HTML se reemplaza entero y los <canvas> viejos
  // desaparecen; sin destruirlas antes, Chart.js conserva las instancias y
  // vuelve a dibujar sobre lienzos que ya no están en el documento.
  while (GRAFICAS.length) { try { GRAFICAS.pop().destroy(); } catch (e) { /* ya no existía */ } }

  const lienzos = ['gCitasMes', 'gEstados', 'gPorAgente', 'gRamos'].map((id) => $('#' + id));
  if (!lienzos[0]) return;

  if (typeof Chart === 'undefined') {
    lienzos.forEach((c) => c && c.parentElement.replaceChildren(
      Object.assign(document.createElement('p'), {
        className: 'admin-vacio',
        textContent: 'No se pudo cargar Chart.js. Revisa la conexión.',
      })));
    return;
  }

  const azul    = tokenColor('--vaxti-azul', '#00224f');
  const naranja = tokenColor('--vaxti-naranja', '#fe6031');
  const tinta   = tokenColor('--t2', '#5a6478');
  const citas   = CITAS;

  const vacio = (canvas, msg) => canvas.parentElement.replaceChildren(
    Object.assign(document.createElement('p'), { className: 'admin-vacio', textContent: msg }));

  /* 1 · Citas por mes — los 6 meses hasta hoy, incluidos los que van en cero.
         Sin rellenar los huecos, tres citas salteadas parecen una tendencia. */
  const meses = [];
  const hoy = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    meses.push({
      clave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      etiqueta: ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
                 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][d.getMonth()],
    });
  }
  GRAFICAS.push(new Chart(lienzos[0], {
    type: 'line',
    data: {
      labels: meses.map((m) => m.etiqueta),
      datasets: [{
        data: meses.map((m) => citas.filter((c) => c.fecha.slice(0, 7) === m.clave).length),
        borderColor: naranja,
        backgroundColor: 'rgba(254,96,49,.10)',
        fill: true, tension: .35,
        pointBackgroundColor: naranja, pointRadius: 4,
      }],
    },
    options: ejesSobrios(tinta),
  }));

  /* 2 · Estados — dona. Solo los estados que existen; una leyenda con cuatro
         ceros no dice nada. */
  const porEstado = {};
  citas.forEach((c) => { porEstado[c.estado] = (porEstado[c.estado] || 0) + 1; });
  const estados = Object.keys(porEstado);
  if (!estados.length) vacio(lienzos[1], 'Todavía no hay citas.');
  else GRAFICAS.push(new Chart(lienzos[1], {
    type: 'doughnut',
    data: {
      labels: estados.map((e) => (ETIQUETA_ESTADO[e] || { txt: e }).txt),
      datasets: [{
        data: estados.map((e) => porEstado[e]),
        backgroundColor: [naranja, azul, '#4caf82', '#8892a4', '#e05252'],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '62%',
      plugins: { legend: { position: 'bottom', labels: { color: tinta, font: { size: 11 }, boxWidth: 12 } } },
    },
  }));

  /* 3 · Citas por agente — barras horizontales: los nombres completos no caben
         en el eje X de un móvil. */
  if (!AGENTES.length) vacio(lienzos[2], 'Todavía no hay agentes.');
  else GRAFICAS.push(new Chart(lienzos[2], {
    type: 'bar',
    data: {
      labels: AGENTES.map((a) => a.nombre),
      datasets: [{
        data: AGENTES.map((a) => citas.filter((c) => c.agente === a.slug).length),
        backgroundColor: azul, borderRadius: 4, barThickness: 18,
      }],
    },
    options: { ...ejesSobrios(tinta), indexAxis: 'y' },
  }));

  /* 4 · Ramos — de `ramo_interes`, o sea lo que el cliente vino a preguntar,
         no lo que el agente dice que vende. */
  const porRamo = {};
  citas.forEach((c) => { if (c.ramo) porRamo[c.ramo] = (porRamo[c.ramo] || 0) + 1; });
  const ramos = Object.keys(porRamo).sort((a, b) => porRamo[b] - porRamo[a]);
  if (!ramos.length) vacio(lienzos[3], 'Ninguna cita trae ramo de interés.');
  else GRAFICAS.push(new Chart(lienzos[3], {
    type: 'bar',
    data: {
      labels: ramos.map((r) => (RAMOS[r] || {}).label || r),
      datasets: [{ data: ramos.map((r) => porRamo[r]), backgroundColor: naranja, borderRadius: 4 }],
    },
    options: ejesSobrios(tinta),
  }));
}

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

  MI_USUARIO = sesion.usuario;
  MI_USUARIO_ID = sesion.demo ? null : sesion.usuario.id;

  await Promise.all([cargarDatosDirector(sesion), cargarCorreoAcceso()]);

  $('#pdQuien').innerHTML = `<b>${esc(sesion.usuario.nombre)}</b>${sesion.demo ? ' · demo' : ''}`;

  const pendientes = RESENAS_MOD.length;
  if (pendientes) $('#pdBadgeResenas').textContent = pendientes;
  // Solo las que nadie ha tocado. Antes era un '2' escrito a mano.
  $('#pdBadgePost').textContent = POSTULACIONES.filter((p) => p.estado === 'nueva').length || '';

  const ir = (sec) => {
    $$('.admin-nav-item[data-sec], .panel-bottom-nav-item[data-sec]')
      .forEach((b) => b.classList.toggle('activo', b.dataset.sec === sec));
    main.innerHTML = (SECCIONES_DIRECTOR[sec] || (() => '<p>Sección en construcción.</p>'))();
    main.scrollTop = 0;
    if (sec === 'resenas')       activarModeracion();
    if (sec === 'agentes') repintarAgentes();
    if (sec === 'config')     activarConfig();
    if (sec === 'afiliacion') activarAfiliacion();
    if (sec === 'postulaciones') activarPostulaciones();
    if (sec === 'dashboard') buildGraficasDirector();
    if (sec === 'cartera')   entrarACartera(() => { main.innerHTML = seccionCartera(true); });
    if (sec === 'equipo') {
      if (EQUIPO.cargado) activarEquipo();
      else cargarEquipo().then(() => { main.innerHTML = seccionEquipo(); activarEquipo(); });
    }
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
        toques aquí se guarda. Desaparece sola al conectar la base de datos.
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
        ${kpi('fa-clock', 'Reseñas por aprobar', RESENAS_MOD.length, 'esperando tu revisión', RESENAS_MOD.length ? 'alerta' : '')}
        ${kpi('fa-file-contract', 'Pólizas colocadas', AGENTES.reduce((s, a) => s + (a.num_citas || 0), 0), 'histórico')}
        ${kpi('fa-coins', 'Prima del equipo', '$' + (prima / 1000).toFixed(0) + 'k', 'estimada anual')}
      </div>

      <div class="graficas-grid">
        <section class="admin-card grafica-card">
          <h2>Citas por mes</h2>
          <p class="grafica-sub">Últimos 6 meses</p>
          <div class="grafica-lienzo"><canvas id="gCitasMes"></canvas></div>
        </section>

        <section class="admin-card grafica-card">
          <h2>En qué estado están</h2>
          <p class="grafica-sub">Todas las citas del equipo</p>
          <div class="grafica-lienzo"><canvas id="gEstados"></canvas></div>
        </section>

        <section class="admin-card grafica-card">
          <h2>Citas por agente</h2>
          <p class="grafica-sub">Quién está recibiendo la demanda</p>
          <div class="grafica-lienzo"><canvas id="gPorAgente"></canvas></div>
        </section>

        <section class="admin-card grafica-card">
          <h2>Ramos más solicitados</h2>
          <p class="grafica-sub">Lo que la gente viene a preguntar</p>
          <div class="grafica-lienzo"><canvas id="gRamos"></canvas></div>
        </section>
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
          ${citas.filter((c) => c.fecha >= hoyISO())
                 .sort((a, b) => a.fecha.localeCompare(b.fecha))
                 .slice(0, 6).map(filaCita).join('')}
        </ul>
      </section>`;
  },

  agentes() {
    const lista = ordenarAgentesPanel(AGENTES.slice(), ORDEN_AGENTES);
    const def = ORDENES_PANEL.find((o) => o.clave === ORDEN_AGENTES) || ORDENES_PANEL[0];
    return `
      <h1 class="admin-page-title">Agentes</h1>
      <p class="admin-page-sub">${AGENTES.length} en tu equipo · ${def.pie}</p>
      <div class="admin-acciones-top ag-barra">
        <label class="ag-orden-label" for="agOrden">Ordenar por</label>
        <select class="form-input ag-orden" id="agOrden">
          ${ORDENES_PANEL.map((o) => `<option value="${o.clave}"
             ${o.clave === ORDEN_AGENTES ? 'selected' : ''}>${o.txt}</option>`).join('')}
        </select>
        <button class="btn btn-acento btn-sm" onclick="abrirAltaAgente()">
          <i class="fas fa-plus"></i> Agregar agente
        </button>
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr>
            <th>Agente</th><th>Zona</th><th>Ramos</th><th class="col-num">Citas</th>
            <th class="col-num">Cartera</th><th>Calificación</th><th>Estado</th><th></th>
          </tr></thead>
          <tbody>
            ${lista.map((a) => `
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
                <td class="col-num">${a.num_citas || 0}</td>
                <td class="col-num">${(() => {
                  const c = carteraDe(a);
                  return c.polizas
                    ? `${c.polizas}<br><span class="tabla-sub">${money(c.prima)}</span>`
                    : '<span class="tabla-sub">sin pólizas</span>';
                })()}</td>
                <td>
                  ${Number(a.num_resenas)
                    ? `${estrellas(a.calificacion)} ${Number(a.calificacion).toFixed(1)}
                       <span class="tabla-sub">${a.num_resenas} reseña${a.num_resenas === 1 ? '' : 's'}</span>`
                    : '<span class="tabla-sub">sin reseñas todavía</span>'}
                </td>
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
      <p class="admin-nota"><i class="fas fa-circle-info"></i> ${def.nota}</p>
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
    // Con base conectada salen de `resenas`; sin base, del respaldo demo.
    const aprobadas = DATOS_REALES_PANEL ? RESENAS_OK
      : Object.entries(RESENAS_DEMO).flatMap(([slug, rs]) => rs.map((r) => ({ ...r, agente: slug })));
    return `
      <h1 class="admin-page-title">Reseñas</h1>
      <p class="admin-page-sub">Nada se publica sin que tú lo apruebes</p>
      <div class="tabs-bar">
        <button class="tab-btn activo" data-tab="pend">Pendientes (${RESENAS_MOD.length})</button>
        <button class="tab-btn" data-tab="apro">Publicadas (${aprobadas.length})</button>
      </div>
      <div class="tab-panel activo" id="tab-pend">
        ${RESENAS_MOD.length ? RESENAS_MOD.map((r) => `
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
    const ETIQUETA = {
      nueva:      { txt: 'Nueva',      clase: 'pill-warn' },
      contactado: { txt: 'Contactado', clase: 'pill-acento' },
      aceptado:   { txt: 'Aceptado',   clase: 'pill-ok' },
    };
    if (!POSTULACIONES.length) return `
      <h1 class="admin-page-title">Postulaciones</h1>
      <p class="admin-page-sub">Agentes que quieren entrar a tu equipo</p>
      <p class="admin-vacio">Ninguna postulación pendiente. Llegan del formulario de
        <a href="unete.html" target="_blank" rel="noopener">Únete</a>.</p>`;

    return `
      <h1 class="admin-page-title">Postulaciones</h1>
      <p class="admin-page-sub">${POSTULACIONES.length} esperando respuesta</p>
      ${POSTULACIONES.map((p) => {
        const e = ETIQUETA[p.estado] || { txt: p.estado, clase: 'pill-off' };
        return `
        <article class="admin-card postulacion" data-post="${esc(p.id)}">
          <div class="resena-mod-head">
            <div>
              <strong>${esc(p.nombre)}</strong>
              <span class="table-sub">${esc(p.ciudad || '')}${p.experiencia ? ' · ' + esc(p.experiencia) : ''}</span>
            </div>
            <div class="post-pills">
              <span class="pill ${e.clase} pill-sm">${e.txt}</span>
              ${p.cedula ? `<span class="pill pill-ok pill-sm">Céd. ${esc(p.cedula)}</span>`
                         : '<span class="pill pill-warn pill-sm">Sin cédula</span>'}
            </div>
          </div>
          ${(p.ramos || []).length ? `<p class="post-ramos">${p.ramos.map((r) =>
            `<span class="pill pill-sm">${esc((RAMOS[r] || {}).label || r)}</span>`).join(' ')}</p>` : ''}
          <p>${esc(p.mensaje || '')}</p>
          <div class="resena-mod-btns">
            <a class="btn btn-wa btn-sm" data-post-accion="contactado"
               href="${esc(waLink(p.whatsapp, `Hola ${p.nombre}, vi tu postulación a Vaxti.`))}"
               target="_blank" rel="noopener">
              <i class="fab fa-whatsapp"></i> Contactar
            </a>
            <button class="btn btn-acento btn-sm" data-post-accion="aceptado">
              <i class="fas fa-check"></i> Aceptar
            </button>
            <button class="btn btn-ghost btn-sm" data-post-accion="rechazado">Descartar</button>
          </div>
        </article>`;
      }).join('')}
      <p class="admin-nota"><i class="fas fa-circle-info"></i>
        Aceptar solo marca la postulación: dar de alta al agente es aparte, en
        <b>Agentes</b>, porque además hay que crearle su cuenta de acceso.</p>`;
  },

  ingresos() {
    // Antes esto era `num_citas * 1800` con 12% fijo: números inventados
    // presentados como ingresos del equipo. Ahora sale de `polizas`, que es
    // donde está el dato real, con la comisión que trae cada póliza.
    if (!CARTERA.cargado) {
      cargarCartera().then(() => { const m = $('#pdMain'); if (m) m.innerHTML = SECCIONES_DIRECTOR.ingresos(); });
      return '<p class="admin-vacio"><i class="fas fa-spinner fa-spin"></i> Cargando pólizas…</p>';
    }
    if (CARTERA.error) return `
      <h1 class="admin-page-title">Ingresos</h1>
      <p class="admin-vacio">${esc(CARTERA.error)}</p>`;

    const vivas = CARTERA.polizas.filter((p) => p.estatus === 'activa' || p.estatus === 'por_vencer');
    if (!vivas.length) return `
      <h1 class="admin-page-title">Ingresos</h1>
      <p class="admin-page-sub">Sale de las pólizas capturadas</p>
      <p class="admin-vacio">Todavía no hay pólizas. Cárgalas desde
        <b>Cartera → Importar de Excel</b> y estos números se llenan solos.</p>`;

    const porAgente = new Map();
    vivas.forEach((p) => {
      const k = p.agente_nombre || '—';
      if (!porAgente.has(k)) porAgente.set(k, { nombre: k, polizas: 0, prima: 0, comision: 0 });
      const f = porAgente.get(k);
      f.polizas += 1;
      f.prima   += Number(p.prima_anual || 0);
      f.comision += Number(p.prima_anual || 0) * Number(p.comision_pct || 0) / 100;
    });
    const filas = [...porAgente.values()].sort((a, b) => b.prima - a.prima);
    const prima = filas.reduce((s, f) => s + f.prima, 0);
    const comision = filas.reduce((s, f) => s + f.comision, 0);
    const pctReal = prima ? (comision / prima * 100) : 0;

    return `
      <h1 class="admin-page-title">Ingresos</h1>
      <p class="admin-page-sub">De las ${vivas.length} pólizas vigentes del equipo</p>
      <div class="kpi-grid kpi-grid-4">
        ${kpi('fa-coins', 'Prima bajo gestión', money(prima), 'anual, pólizas vigentes')}
        ${kpi('fa-percent', 'Comisión', money(comision), `${pctReal.toFixed(1)}% promedio real`)}
        ${kpi('fa-users', 'Agentes con cartera', filas.length, `de ${AGENTES.length}`)}
        ${kpi('fa-chart-line', 'Prima promedio', money(prima / vivas.length), 'por póliza')}
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Agente</th><th class="col-num">Pólizas</th>
            <th class="col-num">Prima anual</th><th class="col-num">Comisión</th>
            <th class="col-num">% medio</th></tr></thead>
          <tbody>${filas.map((f) => `
            <tr><td><strong>${esc(f.nombre)}</strong></td>
            <td class="col-num">${f.polizas}</td>
            <td class="col-num">${money(f.prima)}</td>
            <td class="col-num">${money(f.comision)}</td>
            <td class="col-num">${f.prima ? (f.comision / f.prima * 100).toFixed(1) : '0.0'}%</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="admin-nota"><i class="fas fa-circle-info"></i>
        Es la comisión sobre prima anual de las pólizas vigentes, con el
        porcentaje que trae cada una. No incluye lo ya cobrado ni las pólizas
        canceladas o no renovadas.</p>`;
  },

  afiliacion() {
    if (!AFILIACION.cargado) {
      cargarAfiliacion().then(() => {
        const m = $('#pdMain');
        if (m) { m.innerHTML = SECCIONES_DIRECTOR.afiliacion(); activarAfiliacion(); }
      });
      return '<p class="admin-vacio"><i class="fas fa-spinner fa-spin"></i> Cargando…</p>';
    }
    if (AFILIACION.error) return `
      <h1 class="admin-page-title">Afiliación</h1>
      <p class="admin-vacio">${esc(AFILIACION.error)}</p>`;

    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const diasDelMes = Math.round((hoy - inicioMes) / 86400000) + 1;

    const filas = AFILIACION.filas.map((a) => {
      const alta = a.created_at ? new Date(a.created_at) : null;
      const desdeMes = alta && alta > inicioMes ? alta : inicioMes;
      const susp = diasSuspendidoEnMes(a, inicioMes, hoy);
      const facturables = Math.max(0,
        Math.round((hoy - desdeMes) / 86400000) + 1 - susp);
      return { ...a, alta, susp, facturables };
    });

    // Oculto sigue contando como publicado para el cobro: el agente sigue
    // operando y recibiendo citas, solo no aparece en el directorio. Lo único
    // que descuenta días es suspender.
    const publicados = filas.filter((f) => !f.suspended && f.activo).length;
    const suspendidos = filas.filter((f) => f.suspended).length;
    const totalFacturable = filas.reduce((s, f) => s + f.facturables, 0);

    return `
      <h1 class="admin-page-title">Afiliación</h1>
      <p class="admin-page-sub">Cuántos días estuvo publicado cada agente este mes</p>

      <div class="kpi-grid kpi-grid-4">
        ${kpi('fa-users', 'Publicados hoy', publicados, `de ${filas.length} en el equipo`)}
        ${kpi('fa-ban', 'Suspendidos', suspendidos, 'fuera del sitio',
              suspendidos ? 'alerta' : '')}
        ${kpi('fa-calendar-day', 'Días facturables', totalFacturable, `del ${1} al ${diasDelMes} de este mes`)}
        ${kpi('fa-hourglass-half', 'Días no facturables', filas.reduce((s, f) => s + f.susp, 0), 'por suspensión')}
      </div>

      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr>
            <th>Agente</th><th>Plan</th><th>En el equipo desde</th>
            <th class="col-num">Días publicado</th><th class="col-num">Días suspendido</th>
            <th>Estado</th>
          </tr></thead>
          <tbody>
            ${filas.map((f) => `
              <tr data-afil="${esc(f.id)}">
                <td><strong>${esc(f.nombre)}</strong></td>
                <td>
                  <select class="form-input afil-plan" data-agente-id="${esc(f.id)}">
                    ${PLANES.map((p) => `<option value="${p.clave}"
                      ${p.clave === (f.plan || 'beta') ? 'selected' : ''}>${p.txt}</option>`).join('')}
                  </select>
                </td>
                <td>${f.alta ? fechaCorta(fechaISO(f.alta)) +
                      ' ' + f.alta.getFullYear() : '—'}</td>
                <td class="col-num">${f.facturables}</td>
                <td class="col-num">${f.susp
                    ? `<span class="pill pill-warn pill-sm">${f.susp}</span>` : '0'}</td>
                <td><span class="pill ${f.suspended || !f.activo ? 'pill-off'
                      : f.hidden ? 'pill-warn' : 'pill-ok'} pill-sm">
                      ${f.suspended ? 'Suspendido' : !f.activo ? 'Inactivo'
                        : f.hidden ? 'Oculto' : 'Publicado'}</span></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div id="afilAviso"></div>

      <p class="admin-nota"><i class="fas fa-circle-info"></i>
        Se cuentan días, no dinero: <b>el precio de la afiliación todavía no
        está definido</b>. Lo que sí queda registrado es cuántos días estuvo
        publicado cada quien, que es sobre lo que se cobrará cuando haya
        precio. Suspender a alguien descuenta esos días automáticamente;
        ocultarlo no, porque sigue recibiendo citas.</p>`;
  },

  // El Director ve la cartera de todo su equipo — con la columna de agente.
  cartera() { return seccionCartera(true); },
  equipo()  { return seccionEquipo(); },

  config() {
    const u = MI_USUARIO || {};
    return `
      <h1 class="admin-page-title">Configuración</h1>
      <p class="admin-page-sub">Tu acceso, tus datos y los del sitio</p>

      <section class="admin-card">
        <h2>Tu acceso</h2>
        <p class="modal-texto">Con esto entras al panel. Es lo único que se
          valida al iniciar sesión.</p>
        <div class="cfg-dato">
          <div>
            <span class="form-label">Correo de acceso</span>
            <b id="cfgCorreoActual">${esc(CORREO_ACCESO || '—')}</b>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="abrirCambioCorreo()">
            <i class="fas fa-envelope"></i> Cambiar
          </button>
        </div>
        <div class="cfg-dato">
          <div>
            <span class="form-label">Contraseña</span>
            <b>••••••••</b>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="abrirCambioPassword()">
            <i class="fas fa-key"></i> Cambiar
          </button>
        </div>
      </section>

      <section class="admin-card">
        <h2>Tus datos</h2>
        <p class="modal-texto">Cómo apareces dentro del panel. El correo de aquí
          es de contacto: <b>no</b> sirve para iniciar sesión.</p>
        <div class="form-group">
          <label class="form-label" for="cfgNombre">Nombre</label>
          <input class="form-input" id="cfgNombre" value="${esc(u.nombre || '')}" />
        </div>
        <div class="imp-mapeo">
          <div class="form-group">
            <label class="form-label" for="cfgEmail">Correo de contacto</label>
            <input class="form-input" id="cfgEmail" type="email" value="${esc(u.email || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="cfgTel">Teléfono</label>
            <input class="form-input" id="cfgTel" value="${esc(u.telefono || '')}" />
          </div>
        </div>
        <button class="btn btn-acento btn-sm" id="cfgGuardarDatos">
          <i class="fas fa-floppy-disk"></i> Guardar
        </button>
        <div id="cfgAvisoDatos"></div>
      </section>

      <section class="admin-card">
        <h2>El sitio</h2>
        <p class="modal-texto">Estos datos son parte de la configuración del sitio,
          no de tu cuenta: cambiarlos requiere publicar una nueva versión. Si
          necesitas ajustar alguno, pídelo a quien administra el sistema.</p>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <tbody>
              <tr><td>Marca</td><td><b>${esc(CONFIG.MARCA)} ${esc(CONFIG.SUBMARCA || '')}</b></td></tr>
              <tr><td>Aseguradora</td><td><b>${esc(CONFIG.ASEGURADORA || '—')}</b></td></tr>
              <tr><td>Ciudad</td><td><b>${esc(CONFIG.CIUDAD)}</b></td></tr>
              <tr><td>WhatsApp central</td><td><b>+${esc(CONFIG.WHATSAPP_CENTRAL)}</b></td></tr>
            </tbody>
          </table>
        </div>
      </section>`;
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

  $$('[data-mod]').forEach((b) => b.addEventListener('click', async () => {
    const art = b.closest('.resena-mod');
    const id = art.dataset.resena;
    const aprobar = b.dataset.mod === 'aprobar';
    art.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    art.style.opacity = '.5';

    if (!window.sbClient || !DATOS_REALES_PANEL) {
      showToast(aprobar ? 'Publicada. En demo no se guarda.' : 'Rechazada. En demo no se guarda.');
      return;
    }
    try {
      // `rechazada` existe para que lo descartado no vuelva a la cola: el
      // Director solo tiene `grant update` sobre resenas, no puede borrarlas.
      const { error } = await sbClient.from('resenas')
        .update(aprobar ? { aprobada: true } : { rechazada: true })
        .eq('id', id);
      if (error) throw error;
      art.remove();
      // El trigger `resenas_recalcular` ya actualizó calificación y num_resenas
      // del agente; hay que releer para que el resto del panel no mienta.
      await Promise.all([cargarAgentes(), cargarDatosDirector({ demo: false })]);
      showToast(aprobar ? 'Publicada. Ya se ve en su perfil.' : 'Descartada.');
      const badge = $('#pdBadgeResenas');
      if (badge) badge.textContent = RESENAS_MOD.length || '';
    } catch (e) {
      art.style.opacity = '1';
      art.querySelectorAll('button').forEach((x) => { x.disabled = false; });
      showToast('No se pudo guardar: ' + (e.message || 'error'));
    }
  }));
}

function activarGestionAgentes() {
  $$('[data-accion]').forEach((b) => b.addEventListener('click', async () => {
    const fila = b.closest('tr');
    const slug = fila.dataset.agente;
    const ag = AGENTES.find((a) => a.slug === slug);
    const nombre = fila.querySelector('strong').textContent;
    const accion = b.dataset.accion;

    if (!window.sbClient || !ag || !ag.id) {
      fila.style.opacity = accion === 'suspender' ? '.4' : '.7';
      showToast('En demo no se guarda.');
      return;
    }

    // Se alterna: el mismo botón oculta y vuelve a mostrar. Sin esto no habría
    // forma de deshacer desde la interfaz.
    const activando = accion === 'ocultar' ? !ag.hidden : !ag.suspended;
    const parche = accion === 'ocultar'
      ? { hidden: activando }
      : { suspended: activando, suspended_from: activando ? hoyISO() : null };

    b.disabled = true;
    try {
      const { error } = await sbClient.from('agentes').update(parche).eq('id', ag.id);
      if (error) throw error;
      await cargarAgentes();
      // Repinta por el mismo camino que la navegación, para no perder el
      // selector de orden ni el orden que el Director tenía elegido.
      repintarAgentes();
      showToast(accion === 'ocultar'
        ? (activando ? `${nombre} ya no aparece en el sitio, pero sigue recibiendo citas.`
                     : `${nombre} vuelve a aparecer en el sitio.`)
        : (activando ? `${nombre} queda suspendido: fuera del sitio y sin agenda.`
                     : `${nombre} vuelve a estar activo.`));
    } catch (e) {
      b.disabled = false;
      showToast('No se pudo guardar: ' + (e.message || 'error'));
    }
  }));
}

function activarPostulaciones() {
  $$('[data-post-accion]').forEach((b) => b.addEventListener('click', async () => {
    const art = b.closest('.postulacion');
    const id = art.dataset.post;
    const estado = b.dataset.postAccion;
    if (!window.sbClient || !DATOS_REALES_PANEL) { showToast('En demo no se guarda.'); return; }
    try {
      const { error } = await sbClient.from('postulaciones').update({ estado }).eq('id', id);
      if (error) throw error;
      await cargarDatosDirector({ demo: false });
      const main = $('#pdMain');
      if (main) { main.innerHTML = SECCIONES_DIRECTOR.postulaciones(); activarPostulaciones(); }
      const badge = $('#pdBadgePost');
      if (badge) badge.textContent = POSTULACIONES.filter((p) => p.estado === 'nueva').length || '';
      showToast(estado === 'aceptado' ? 'Marcada como aceptada.'
              : estado === 'rechazado' ? 'Descartada.' : 'Marcada como contactada.');
    } catch (e) {
      showToast('No se pudo guardar: ' + (e.message || 'error'));
    }
  }));
}

/* ===========================================================================
   15. Panel del Agente (panel-agente.html)
   =========================================================================== */
let YO_AGENTE = null;
let DISPONIBLE = true;

/* Mi fila en `usuarios`. Es la que llevan `clientes.agente_id`,
   `polizas.agente_id` y `actividad.agente_id`, así que hace falta para
   escribir cualquier cosa de cartera. NO sale de la vista pública. */
let MI_USUARIO_ID = null;

/* `AGENTES` viene de `v_agentes_publico`, que a propósito no expone
   `usuario_id`: es una vista pública y filtrar por ahí lo publicaría. Para
   saber cuál de los agentes soy hay que preguntarle a la tabla `agentes` con
   la sesión abierta; el RLS deja leer la propia fila.

   Antes esto se resolvía con `AGENTES.find(a => a.usuario_id === ...)`, que
   nunca encontraba nada porque esa columna no existe en la vista, y caía en
   `AGENTES[0]`: cualquier agente que entrara veía el panel del primero. */
async function identificarAgente(sesion) {
  if (sesion.demo) { MI_USUARIO_ID = null; return AGENTES[0]; }
  MI_USUARIO_ID = sesion.usuario.id;
  if (!window.sbClient) return AGENTES[0];
  try {
    const { data, error } = await sbClient
      .from('agentes').select('*').eq('usuario_id', sesion.usuario.id).maybeSingle();
    if (error) throw error;
    if (!data) return AGENTES[0];
    // Se combina con la fila de la vista, que trae los agregados ya calculados
    // (num_citas, num_resenas, ramos…) que la tabla no tiene.
    return Object.assign({}, AGENTES.find((a) => a.id === data.id) || {}, data);
  } catch (e) {
    console.warn('No se pudo identificar al agente:', e.message);
    return AGENTES[0];
  }
}

async function initPanelAgente() {
  const main = $('#paMain');
  if (!main) return;

  const sesion = await guardPanel('agente');
  if (!sesion) return;

  YO_AGENTE = await identificarAgente(sesion);
  MI_USUARIO = sesion.usuario;
  DISPONIBLE = !!YO_AGENTE.disponible;

  await Promise.all([cargarDatosAgente(sesion), cargarCorreoAcceso()]);

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

  const porConfirmar = misCitasDeHoy().filter((c) => c.estado === 'pendiente').length;
  $('#paBadgeCitas').textContent = porConfirmar || '';

  pintarToggle();
  [$('#paToggle'), $('#paToggleMovil')].forEach((b) =>
    b && b.addEventListener('click', async () => {
      // Se pinta primero para que responda al instante; si la base rechaza el
      // cambio se regresa, en vez de mostrar un estado que no es cierto.
      const antes = DISPONIBLE;
      DISPONIBLE = !DISPONIBLE;
      pintarToggle();
      if (await guardarDisponible(DISPONIBLE)) {
        showToast(DISPONIBLE
          ? 'Ahora apareces como disponible en el directorio.'
          : 'Ya no apareces como disponible. Tu perfil sigue publicado.');
      } else {
        DISPONIBLE = antes;
        pintarToggle();
      }
    }));

  const ir = (sec) => {
    $$('.admin-nav-item[data-sec], .panel-bottom-nav-item[data-sec]')
      .forEach((b) => b.classList.toggle('activo', b.dataset.sec === sec));
    main.innerHTML = (SECCIONES_AGENTE[sec] || (() => '<p>Sección en construcción.</p>'))();
    main.scrollTop = 0;

    // Enganchar lo que ya está pintado…
    activarPanelAgente(sec);
    if (sec === 'contenido') activarTabsCitas();

    // …y traer lo que aún no se ha cargado. Cada sección se pide una sola vez;
    // al volver, ya está en memoria y solo se reenganchan los eventos.
    if (sec === 'cartera') entrarACartera(() => { main.innerHTML = seccionCartera(false); activarTabsCartera(); });
    if (sec === 'clientes'  && !CLIENTES.cargado)  cargarClientes().then(repintarClientes);
    if (sec === 'actividad' && !ACTIVIDAD.cargado) {
      cargarActividad().then(() => { main.innerHTML = seccionActividad(); activarActividad(); });
    }
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
    const mias = misCitasDeHoy();
    const prox = mias.filter((c) => c.fecha >= hoyISO());
    // Reseñas propias de la base; sin conexión, el respaldo demo.
    const todas = DATOS_REALES_AGENTE ? MIS_RESENAS
      : (RESENAS_DEMO[YO_AGENTE.slug] || []).map((r) => ({ ...r, aprobada: true }));
    const resenas = todas.filter((r) => r.aprobada);
    const porAprobar = todas.filter((r) => !r.aprobada && !r.rechazada).length;
    const mes = new Date().toISOString().slice(0, 7);
    const polizasMes = CARTERA.cargado
      ? CARTERA.polizas.filter((p) => String(p.fecha_inicio || '').slice(0, 7) === mes).length
      : null;
    return `
      <h1 class="admin-page-title">Hola, ${esc(YO_AGENTE.nombre.split(' ')[0])}</h1>
      <p class="admin-page-sub">Esto es lo que tienes por delante</p>
      <div class="kpi-grid">
        ${kpi('fa-calendar-check', 'Próximas citas', prox.length, `${mias.filter((c) => c.estado === 'pendiente').length} por confirmar`, prox.length ? 'alerta' : '')}
        ${kpi('fa-calendar-check', 'Citas atendidas', YO_AGENTE.num_citas || 0, 'histórico')}
        ${kpi('fa-star', 'Tu calificación', Number(YO_AGENTE.calificacion).toFixed(1), `${resenas.length} reseñas`)}
        ${kpi('fa-comment-dots', 'Reseñas publicadas', resenas.length, 'visibles en tu perfil')}
        ${kpi('fa-clock', 'Reseñas por aprobar', porAprobar, 'las revisa tu director', porAprobar ? 'alerta' : '')}
        ${kpi('fa-file-contract', 'Pólizas del mes', polizasMes === null ? '—' : polizasMes,
              polizasMes === null ? 'abre Mi cartera para calcularlo' : 'con fecha de inicio este mes')}
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
    const mias = misCitasDeHoy();
    const hoy = hoyISO();
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
    // La rejilla mostraba «Lun–Sáb» en abstracto, pero `disponibilidad` guarda
    // FECHAS concretas (fecha + hora_ini). Eran dos cosas distintas y por eso
    // nada se podía guardar. Ahora la rejilla ES la semana real: cada casilla
    // corresponde exactamente a una fila de la tabla.
    const horas = HORAS_AGENDA;
    const dias = diasDeLaSemana(SEMANA_OFFSET);
    const hoy = hoyISO();
    const abierta = (fecha, hora) => {
      const f = MI_AGENDA.find((d) => d.fecha === fecha && String(d.hora_ini).slice(0, 5) === hora);
      return f ? f.disponible : false;
    };

    // Una cita ya agendada en esa franja. Se muestra encima de la casilla: de
    // nada sirve saber que el horario está abierto si no se ve quién viene.
    // Las canceladas no cuentan: ese hueco volvió a estar libre.
    const citaEn = (fecha, hora) => misCitasDeHoy().find((c) =>
      c.fecha === fecha && c.hora === hora && c.estado !== 'cancelada');

    return `
      <h1 class="admin-page-title">Disponibilidad</h1>
      <p class="admin-page-sub">Toca una casilla para abrir o cerrar ese horario</p>

      <div class="admin-acciones-top semana-nav">
        <button class="btn btn-ghost btn-sm" data-semana="-1" ${SEMANA_OFFSET <= 0 ? 'disabled' : ''}>
          <i class="fas fa-chevron-left"></i> <span class="rotulo">Semana anterior</span>
        </button>
        <b class="semana-titulo">${rotuloSemana(dias)}</b>
        <button class="btn btn-ghost btn-sm" data-semana="1">
          <span class="rotulo">Siguiente</span> <i class="fas fa-chevron-right"></i>
        </button>
      </div>

      <section class="admin-card">
        <div class="semana-grid" style="grid-template-columns: 60px repeat(${dias.length}, 1fr)">
          <div></div>
          ${dias.map((d) => `<div class="semana-cab ${d.iso === hoy ? 'es-hoy' : ''}">
              ${d.dia}<span class="semana-num">${d.num}</span></div>`).join('')}
          ${horas.map((h) => `
            <div class="semana-hora">${h}</div>
            ${dias.map((d) => {
              const pasado = d.iso < hoy;
              const cita = citaEn(d.iso, h);
              // Con cita agendada la casilla no se puede cerrar: el cliente ya
              // tiene el compromiso. Para librarla hay que cancelar la cita en
              // Mis citas, y así queda claro que hay alguien a quien avisarle.
              const e = cita ? (ETIQUETA_ESTADO[cita.estado] || { txt: cita.estado }) : null;
              if (cita) return `<button class="semana-celda con-cita"
                        data-fecha="${d.iso}" data-hora="${h}" disabled
                        title="${esc(cita.cliente)} · ${e.txt} · para cambiarlo, cancela la cita"
                        aria-label="${d.dia} ${d.num}, ${h}: cita con ${esc(cita.cliente)}">
                        <span class="celda-cita">${esc(cita.cliente.split(' ')[0])}</span>
                      </button>`;
              return `<button class="semana-celda ${abierta(d.iso, h) ? 'abierto' : 'cerrado'}"
                        data-fecha="${d.iso}" data-hora="${h}" ${pasado ? 'disabled' : ''}
                        title="${abierta(d.iso, h) ? 'Abierto — toca para cerrar' : 'Cerrado — toca para abrir'}"
                        aria-label="${d.dia} ${d.num}, ${h}"></button>`;
            }).join('')}`).join('')}
        </div>
        <p class="admin-nota" style="margin-top:1rem">
          <span class="leyenda-punto abierto"></span> Abierto para citas ·
          <span class="leyenda-punto cerrado"></span> Cerrado ·
          <span class="leyenda-punto con-cita"></span> Ya tienes cita ·
          los días que ya pasaron no se pueden cambiar
        </p>
        <div id="paAgendaAviso"></div>
      </section>

      <section class="admin-card">
        <h2>Bloquear un día completo</h2>
        <p class="admin-vacio" style="text-align:left">
          Vacaciones, capacitación o cualquier día que no puedas atender. Cierra
          todos los horarios de ese día de una vez.
        </p>
        <div class="acciones">
          <input class="form-input" type="date" id="paBloqueo" min="${hoy}" style="max-width:200px" />
          <button class="btn btn-acento btn-sm" id="paBloquear">
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
        <p class="admin-nota"><i class="fas fa-triangle-exclamation"></i>
          <b>Estas fotos son provisionales, de un banco de imágenes, y son las
          mismas para todo el equipo.</b> Salen en tu perfil público mientras no
          haya fotos tuyas. La subida todavía no está lista; en cuanto lo esté,
          las tuyas las reemplazan.</p>
        <div class="contenido-grid">
          <img src="${esc(YO_AGENTE.foto)}" alt="" />
          ${FOTOS_APOYO.map((u) => `<img src="${esc(u)}" alt="" />`).join('')}
          <button class="subir-foto" onclick="showToast('La subida de fotos todavía no está lista. Por ahora pídele a tu director que las cargue.')">
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
          <button class="subir-foto" onclick="showToast('La subida de fotos todavía no está lista. Por ahora pídele a tu director que las cargue.')">
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
        <input type="checkbox" data-ramo="${k}" ${tiene ? 'checked' : ''} />
        <i class="fas ${v.icono}"></i> ${esc(v.label)}
        ${esp ? '<span class="pill pill-acento pill-sm">Especialidad</span>' : ''}
      </label>`;
    }).join('');

    const modos = Object.entries(MODALIDADES).map(([k, v]) => {
      const tiene = (YO_AGENTE.modalidades || []).includes(k);
      return `<label class="check-ramo ${tiene ? 'activo' : ''}">
        <input type="checkbox" data-modalidad="${k}" ${tiene ? 'checked' : ''} />
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
          <label class="form-label" for="pfTitulo">Titular</label>
          <input class="form-input" id="pfTitulo" value="${esc(YO_AGENTE.titulo || '')}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="pfDesc">Sobre ti</label>
          <textarea class="form-input" id="pfDesc" rows="4">${esc(YO_AGENTE.descripcion || '')}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="pfZona">Zona</label>
            <input class="form-input" id="pfZona" value="${esc(YO_AGENTE.zona || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="pfWa">WhatsApp</label>
            <input class="form-input" id="pfWa" value="+${esc(YO_AGENTE.whatsapp || '')}" />
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

      <button class="btn btn-acento btn-lg" id="paGuardarPerfil">
        <i class="fas fa-floppy-disk"></i> Guardar cambios
      </button>
      <div id="paPerfilAviso"></div>`;
  },

  // El agente ve solo lo suyo: el RLS ya filtra las dos vistas, así que la
  // misma plantilla sirve sin la columna de agente, que aquí sobra.
  cartera()   { return seccionCartera(false); },
  clientes()  { return seccionClientes(); },
  actividad() { return seccionActividad(); },

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

/* Si esa cita ya produjo un cliente, ofrecer registrarlo otra vez crearía un
   duplicado. Devuelve false mientras los clientes no estén cargados: es mejor
   ofrecer el botón y que el selector filtre, que esconderlo por no saber. */
function citaYaEsCliente(citaId) {
  if (!CLIENTES.cargado) return false;
  return CLIENTES.filas.some((c) => c.cita_origen_id === citaId);
}

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
          ${c.estado === 'pendiente' ? `
            <button class="btn btn-acento btn-sm" data-cita-id="${esc(c.id)}" data-cita-estado="confirmada">
              <i class="fas fa-check"></i> Confirmar</button>
            <button class="btn btn-ghost btn-sm" data-cita-id="${esc(c.id)}" data-cita-estado="cancelada">
              <i class="fas fa-xmark"></i> Cancelar</button>` : ''}
          ${c.estado === 'confirmada' ? `
            <button class="btn btn-acento btn-sm" data-cita-id="${esc(c.id)}" data-cita-estado="completada">
              <i class="fas fa-circle-check"></i> Ya la atendí</button>
            <button class="btn btn-ghost btn-sm" data-cita-id="${esc(c.id)}" data-cita-estado="no_asistio">
              <i class="fas fa-user-slash"></i> No llegó</button>` : ''}
          <a class="btn btn-wa btn-sm" href="${esc(waLink(c.wa, `Hola ${c.cliente}, te escribo por tu cita.`))}"
             target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> Escribir</a>
          ${c.estado === 'completada' ? (citaYaEsCliente(c.id)
            ? '<span class="pill pill-ok pill-sm"><i class="fas fa-user-check"></i> Ya es tu cliente</span>'
            : `<button class="btn btn-ghost btn-sm" onclick="abrirNuevoCliente('${esc(c.id)}')">
                 <i class="fas fa-user-plus"></i> Registrar como cliente
               </button>`) : ''}
          <button class="btn btn-ghost btn-sm" onclick="abrirResenaCliente('${esc(c.cliente)}', '${esc(c.wa || '')}')">
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

/* Reseña de cliente — privada entre el equipo y el Director (tabla
   `resenas_clientes`). Nunca se muestra en el sitio público. */
function abrirResenaCliente(cliente, wa) {
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
    <div class="imp-mapeo">
      <div class="form-group">
        <label class="form-label" for="rcCliente">Cliente</label>
        <input class="form-input" id="rcCliente" value="${esc(cliente || '')}" placeholder="Nombre" />
      </div>
      <div class="form-group">
        <label class="form-label" for="rcWa">WhatsApp *</label>
        <input class="form-input" id="rcWa" value="${esc(wa || '')}" placeholder="+52..." />
        <p class="modal-texto imp-nota">Es con lo que el equipo lo reconoce si
          vuelve a aparecer; el nombre se escribe de muchas formas.</p>
      </div>
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
      <label class="form-label" for="rcNota">Nota (opcional)</label>
      <textarea class="form-input" id="rcNota" rows="2" placeholder="Algo que le sirva al equipo…"></textarea>
    </div>
    <button class="btn btn-acento w-full" id="rcGuardar">
      <i class="fas fa-floppy-disk"></i> Guardar nota
    </button>
    <div id="rcAviso"></div>`;

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
  $('#rcGuardar').addEventListener('click', guardarResenaCliente);
  openModal('clienteModal');
}

async function guardarResenaCliente() {
  const aviso = $('#rcAviso');
  const wa = $('#rcWa').value.replace(/[^\d+]/g, '');
  const nombre = $('#rcCliente').value.trim();
  const tipo = ($('.rc-tipo.activo') || {}).dataset ? $('.rc-tipo.activo').dataset.tipo : 'bueno';
  const tags = $$('.rc-tag.activo').map((b) => b.textContent.trim());

  if (!wa) { aviso.innerHTML = '<p class="imp-error">Falta el WhatsApp: es la llave con la que el equipo lo reconoce.</p>'; return; }
  if (!window.sbClient || !DATOS_REALES_AGENTE || !YO_AGENTE || !YO_AGENTE.id) {
    aviso.innerHTML = '<p class="imp-error">En modo demostración no se guarda.</p>'; return;
  }

  const btn = $('#rcGuardar');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';
  try {
    // La tabla no tiene columna de nombre —se cruza por WhatsApp— así que el
    // nombre se antepone a la nota para que el equipo sepa de quién habla.
    const notas = [nombre, $('#rcNota').value.trim()].filter(Boolean).join(' — ');
    const { error } = await sbClient.from('resenas_clientes').insert({
      agente_id: YO_AGENTE.id, cliente_whatsapp: wa, tipo, tags, notas: notas || null,
    });
    if (error) throw error;
    closeModal('clienteModal');
    showToast('Nota guardada. La ve tu equipo y tu director.');
  } catch (e) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Guardar nota';
    aviso.innerHTML = `<p class="imp-error">No se pudo guardar: ${esc(e.message || 'error')}</p>`;
  }
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

/* ===========================================================================
   19. Cartera — el CRM de pólizas, como sección de los dos paneles

   Antes vivía en `cartera/`, una mini-app aparte con su propio CSS, sus
   propios módulos y su propio login. Se veía y se sentía como otra
   aplicación: fuente del sistema en vez de Poppins, sin Font Awesome, y un
   salto de página al entrar. Aquí se renderiza como una sección más, con los
   mismos componentes que Ingresos o Afiliación.

   Las dos vistas hacen el filtrado por RLS, no por parámetro: el agente ve lo
   suyo y el Director lo de su equipo, sin que el cliente tenga que pedirlo.
   =========================================================================== */

const CARTERA = { polizas: [], oportunidades: [], cargado: false, error: '' };

const OPORTUNIDAD_ETIQUETA = {
  cross_sell:           { txt: 'Venta cruzada',      clase: 'pill-ok'   },
  riesgo_no_renovacion: { txt: 'Riesgo de fuga',     clase: 'pill-err'  },
  revision_cobertura:   { txt: 'Revisar cobertura',  clase: 'pill-warn' },
};

const ESTATUS_POLIZA = {
  activa:      { txt: 'Activa',      clase: 'pill-ok'   },
  por_vencer:  { txt: 'Por vencer',  clase: 'pill-warn' },
  renovada:    { txt: 'Renovada',    clase: 'pill-ok'   },
  cancelada:   { txt: 'Cancelada',   clase: 'pill-off'  },
  no_renovada: { txt: 'No renovada', clase: 'pill-err'  },
};

const money = (n) => '$' + Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 });
const diasPara = (fecha) =>
  Math.round((new Date(fecha + 'T00:00:00') - new Date().setHours(0, 0, 0, 0)) / 86400000);

async function cargarCartera() {
  if (!window.sbClient) { CARTERA.error = 'Sin conexión a la base.'; CARTERA.cargado = true; return; }
  try {
    const [pol, opo] = await Promise.all([
      sbClient.from('v_polizas_detalle').select('*').order('fecha_vencimiento'),
      // Abiertas = las que todavía hay que trabajar. Los valores del CHECK son
      // nueva / en_proceso / ganada / descartada; no existe 'abierta'.
      sbClient.from('v_oportunidades_detalle').select('*').in('estatus', ['nueva', 'en_proceso']),
    ]);
    if (pol.error) throw pol.error;
    if (opo.error) throw opo.error;
    CARTERA.polizas = pol.data || [];
    CARTERA.oportunidades = opo.data || [];
    CARTERA.error = '';
  } catch (e) {
    CARTERA.error = e.message || 'No se pudo leer la cartera.';
    console.warn('Cartera:', e);
  }
  CARTERA.cargado = true;
}

/* Una sola plantilla para los dos paneles. `conAgente` agrega la columna de
   quién es cada póliza: al Director le importa, al agente le sobra. */
function seccionCartera(conAgente) {
  if (!CARTERA.cargado) return '<p class="admin-vacio"><i class="fas fa-spinner fa-spin"></i> Cargando cartera…</p>';
  if (CARTERA.error) return `<p class="admin-vacio">${esc(CARTERA.error)}</p>`;

  const pol = CARTERA.polizas;
  const vivas = pol.filter((p) => p.estatus === 'activa' || p.estatus === 'por_vencer');
  const prima = vivas.reduce((s, p) => s + Number(p.prima_anual || 0), 0);
  const comision = vivas.reduce((s, p) => s + Number(p.prima_anual || 0) * Number(p.comision_pct || 0) / 100, 0);
  const porVencer = vivas.filter((p) => { const d = diasPara(p.fecha_vencimiento); return d >= 0 && d <= 60; });
  const clientes = new Set(pol.map((p) => p.cliente_id)).size;

  const filaPoliza = (p) => {
    const e = ESTATUS_POLIZA[p.estatus] || { txt: p.estatus, clase: 'pill-off' };
    return `<tr>
      <td><b>${esc(p.cliente_nombre)}</b>${conAgente ? `<br><span class="tabla-sub">${esc(p.agente_nombre || '')}</span>` : ''}</td>
      <td>${esc((RAMOS[p.ramo] || {}).label || p.ramo)}</td>
      <td class="col-num">${esc(p.numero_poliza)}</td>
      <td class="col-num">${money(p.prima_anual)}</td>
      <td>${fechaCorta(p.fecha_vencimiento)}</td>
      <td><span class="pill ${e.clase} pill-sm">${e.txt}</span></td>
    </tr>`;
  };

  const filaVence = (p) => {
    const d = diasPara(p.fecha_vencimiento);
    return `<tr>
      <td><b>${esc(p.cliente_nombre)}</b>${conAgente ? `<br><span class="tabla-sub">${esc(p.agente_nombre || '')}</span>` : ''}</td>
      <td>${esc((RAMOS[p.ramo] || {}).label || p.ramo)}</td>
      <td class="col-num">${money(p.prima_anual)}</td>
      <td>${fechaCorta(p.fecha_vencimiento)}</td>
      <td><span class="pill ${d <= 15 ? 'pill-err' : d <= 30 ? 'pill-warn' : 'pill-off'} pill-sm">
            ${d < 0 ? 'vencida' : d === 0 ? 'hoy' : `en ${d} d`}</span></td>
      ${p.cliente_telefono ? `<td><a class="btn btn-ghost btn-sm" target="_blank" rel="noopener"
          href="https://wa.me/${esc(String(p.cliente_telefono).replace(/\D/g, ''))}">
          <i class="fab fa-whatsapp"></i></a></td>` : '<td></td>'}
    </tr>`;
  };

  const filaOportunidad = (o) => {
    const t = OPORTUNIDAD_ETIQUETA[o.tipo] || { txt: o.tipo, clase: 'pill-off' };
    return `<tr>
      <td><b>${esc(o.cliente_nombre)}</b>${conAgente ? `<br><span class="tabla-sub">${esc(o.agente_nombre || '')}</span>` : ''}</td>
      <td><span class="pill ${t.clase} pill-sm">${t.txt}</span></td>
      <td>${o.ramo_sugerido ? esc((RAMOS[o.ramo_sugerido] || {}).label || o.ramo_sugerido) : '—'}</td>
      <td class="tabla-motivo">${esc(o.motivo)}</td>
      <td class="col-num">${o.valor_estimado ? money(o.valor_estimado) : '—'}</td>
    </tr>`;
  };

  const tabla = (cabeceras, filas, vacio) => filas.length
    ? `<div class="admin-table-wrap"><table class="admin-table">
         <thead><tr>${cabeceras.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
         <tbody>${filas.join('')}</tbody></table></div>`
    : `<p class="admin-vacio">${vacio}</p>`;

  const colCliente = conAgente ? 'Cliente / Agente' : 'Cliente';

  return `
    <h1 class="admin-page-title">Cartera</h1>
    <p class="admin-page-sub">Las pólizas que ya vendiste, y a quién conviene hablarle</p>

    <div class="admin-acciones-top">
      <button class="btn btn-acento btn-sm" onclick="abrirImportador()">
        <i class="fas fa-file-arrow-up"></i> Importar de Excel
      </button>
    </div>

    <div class="kpi-grid">
      ${kpi('fa-file-contract', 'Pólizas vigentes', vivas.length, `${pol.length} en total`)}
      ${kpi('fa-users', 'Clientes', clientes, 'con al menos una póliza')}
      ${kpi('fa-coins', 'Prima anual', money(prima), 'de las vigentes')}
      ${kpi('fa-hand-holding-dollar', 'Comisión estimada', money(comision), 'sobre la prima vigente')}
      ${kpi('fa-clock', 'Vencen en 60 días', porVencer.length, 'requieren contacto', porVencer.length ? 'alerta' : '')}
      ${kpi('fa-lightbulb', 'Oportunidades', CARTERA.oportunidades.length, 'detectadas por el sistema')}
    </div>

    <div class="tabs-bar">
      <button class="tab-btn activo" data-tab="polizas">Pólizas (${pol.length})</button>
      <button class="tab-btn" data-tab="vencen">Por vencer (${porVencer.length})</button>
      <button class="tab-btn" data-tab="oport">Oportunidades (${CARTERA.oportunidades.length})</button>
    </div>

    <section class="admin-card" data-panel="polizas">
      ${tabla([colCliente, 'Ramo', 'Póliza', 'Prima', 'Vence', 'Estatus'],
              pol.map(filaPoliza),
              'No hay pólizas todavía. Usa «Importar de Excel» para subir la cartera que ya tienes.')}
    </section>

    <section class="admin-card oculto" data-panel="vencen">
      ${tabla([colCliente, 'Ramo', 'Prima', 'Vence', 'Faltan', ''],
              porVencer.map(filaVence),
              'Nada vence en los próximos 60 días.')}
    </section>

    <section class="admin-card oculto" data-panel="oport">
      ${tabla([colCliente, 'Tipo', 'Ramo sugerido', 'Por qué', 'Valor est.'],
              CARTERA.oportunidades.map(filaOportunidad),
              'Sin oportunidades abiertas. Se generan solas a partir de las pólizas.')}
      <p class="admin-nota"><i class="fas fa-circle-info"></i>
        Las detecta un motor de reglas en la base: venta cruzada a vida o gastos
        médicos, pólizas que vencen sin contacto reciente, y clientes con una
        sola póliza desde hace tiempo.</p>
    </section>`;
}

/* Mismo patrón que la moderación de reseñas, scoped a `.tabs-bar` para no
   enganchar botones de otra sección que siga en el DOM. */
function activarTabsCartera() {
  const btns = $$('.tabs-bar .tab-btn[data-tab]');
  btns.forEach((b) => b.addEventListener('click', () => {
    btns.forEach((x) => x.classList.toggle('activo', x === b));
    $$('[data-panel]').forEach((p) => p.classList.toggle('oculto', p.dataset.panel !== b.dataset.tab));
  }));
}

/* ===========================================================================
   20. Importador de cartera desde CSV

   El equipo tiene su cartera en Excel. Sin esto el CRM arranca vacío y nadie
   captura cientos de pólizas a mano — está anotado como el mayor riesgo de
   adopción del proyecto.

   Se lee CSV y no .xlsx a propósito: leer Excel de verdad obliga a meter
   SheetJS (~400KB), la primera dependencia nueva del proyecto después de
   Chart.js, para ahorrarle al usuario un «Guardar como» que hace una vez.
   =========================================================================== */

/* Parser de CSV de verdad, no un `split(',')`: los nombres traen comas
   («Pérez, S.A. de C.V.»), las notas traen comillas y saltos de línea, y
   Excel escapa las comillas duplicándolas. */
function parsearCSV(texto) {
  const filas = [];
  let campo = '', fila = [], enComillas = false;
  texto = texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n');  // BOM de Excel + CRLF
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else enComillas = false;
      } else campo += c;
    } else if (c === '"') enComillas = true;
    else if (c === ',' || c === ';') { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => f.some((c) => c.trim() !== ''));
}

const COLUMNAS_IMPORT = [
  { clave: 'cliente',      etiqueta: 'Cliente',        obligatoria: true  },
  { clave: 'telefono',     etiqueta: 'Teléfono',       obligatoria: false },
  { clave: 'email',        etiqueta: 'Correo',         obligatoria: false },
  { clave: 'rfc',          etiqueta: 'RFC',            obligatoria: false },
  { clave: 'ramo',         etiqueta: 'Ramo',           obligatoria: true  },
  { clave: 'numero',       etiqueta: 'Número póliza',  obligatoria: true  },
  { clave: 'prima',        etiqueta: 'Prima anual',    obligatoria: true  },
  { clave: 'comision',     etiqueta: 'Comisión %',     obligatoria: false },
  { clave: 'inicio',       etiqueta: 'Fecha inicio',   obligatoria: true  },
  { clave: 'vencimiento',  etiqueta: 'Fecha vence',    obligatoria: true  },
  { clave: 'aseguradora',  etiqueta: 'Aseguradora',    obligatoria: false },
  { clave: 'forma_pago',   etiqueta: 'Forma de pago',  obligatoria: false },
];

/* Sinónimos para adivinar el mapeo. Nadie titula sus columnas igual, y
   obligar a renombrar el Excel antes de subirlo mata la adopción. */
const SINONIMOS = {
  cliente:     ['cliente', 'nombre', 'asegurado', 'contratante', 'titular'],
  telefono:    ['telefono', 'teléfono', 'celular', 'whatsapp', 'tel', 'movil', 'móvil'],
  email:       ['email', 'correo', 'e-mail', 'mail'],
  rfc:         ['rfc'],
  ramo:        ['ramo', 'producto', 'tipo', 'linea', 'línea'],
  numero:      ['numero', 'número', 'poliza', 'póliza', 'no. poliza', 'num poliza', 'numero de poliza', 'no poliza'],
  prima:       ['prima', 'prima anual', 'importe', 'monto', 'valor'],
  comision:    ['comision', 'comisión', 'comision %', '% comision', 'porcentaje'],
  inicio:      ['inicio', 'fecha inicio', 'vigencia desde', 'desde', 'emision', 'emisión', 'fecha de inicio'],
  vencimiento: ['vencimiento', 'fecha vencimiento', 'vence', 'vigencia hasta', 'hasta', 'fin', 'fecha fin'],
  aseguradora: ['aseguradora', 'compania', 'compañia', 'compañía', 'empresa'],
  forma_pago:  ['forma de pago', 'forma pago', 'periodicidad', 'pago', 'frecuencia'],
};

const normaliza = (s) => String(s || '').toLowerCase().trim()
  // U+0300–U+036F son los diacríticos que NFD separa de su letra. Van como
  // escapes y no como caracteres literales: literales son invisibles en un
  // editor y cualquier guardado en otra codificación los rompe sin que se note.
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function adivinarMapeo(cabeceras) {
  const mapa = {};
  COLUMNAS_IMPORT.forEach(({ clave }) => {
    const opciones = (SINONIMOS[clave] || []).map(normaliza);
    const i = cabeceras.findIndex((h) => opciones.includes(normaliza(h)));
    // Segundo intento, más laxo: que la cabecera contenga el sinónimo.
    const j = i >= 0 ? i : cabeceras.findIndex((h) => opciones.some((o) => normaliza(h).includes(o)));
    if (j >= 0) mapa[clave] = j;
  });
  return mapa;
}

/* Fechas: Excel en español escupe dd/mm/aaaa, y `new Date()` lo lee como
   mes/día. Se convierte a mano; una fecha mal leída no falla, solo guarda el
   año equivocado, que es peor. */
function aFechaISO(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    let [, d, mes, a] = m;
    if (a.length === 2) a = (Number(a) > 50 ? '19' : '20') + a;
    return `${a}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

const aNumero = (v) => {
  const s = String(v || '').replace(/[^0-9.-]/g, '');
  // Sin un solo dígito no es un número. Sin esta guarda, «noesnumero» pierde
  // todas sus letras, queda en '' y `Number('')` es 0: la basura entraba como
  // prima cero sin que nada avisara, que es peor que rechazarla.
  if (!/\d/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const RAMO_SINONIMOS = {
  auto: ['auto', 'automovil', 'automóvil', 'autos', 'vehiculo', 'vehículo', 'coche', 'flotilla'],
  vida: ['vida', 'vida individual', 'temporal', 'dotal'],
  gastos_medicos: ['gastos medicos', 'gastos médicos', 'gmm', 'salud', 'gastos medicos mayores', 'medico', 'médico'],
  hogar: ['hogar', 'casa', 'casa habitacion', 'casa habitación', 'daños', 'danos'],
  empresarial: ['empresarial', 'empresa', 'negocio', 'pyme', 'responsabilidad civil', 'rc'],
  educativo: ['educativo', 'educacion', 'educación', 'universitario', 'ahorro', 'escolar'],
  fianzas: ['fianzas', 'fianza', 'cumplimiento'],
};

function aRamo(v) {
  const n = normaliza(v);
  if (!n) return null;
  for (const [ramo, ops] of Object.entries(RAMO_SINONIMOS)) {
    if (ops.some((o) => n === o || n.includes(o))) return ramo;
  }
  return null;
}

const FORMAS_PAGO = ['anual', 'semestral', 'trimestral', 'mensual'];
function aFormaPago(v) {
  const n = normaliza(v);
  return FORMAS_PAGO.find((f) => n.includes(f)) || null;
}

/* Valida una fila y devuelve { ok, datos, errores }. Se valida TODO antes de
   escribir nada: importar la mitad y fallar a media tabla deja al usuario sin
   saber qué entró y qué no. */
function validarFila(celdas, mapa, nFila) {
  const v = (clave) => (mapa[clave] === undefined ? '' : (celdas[mapa[clave]] || '').trim());
  const errores = [];

  const nombre = v('cliente');
  if (!nombre) errores.push('falta el cliente');

  const ramo = aRamo(v('ramo'));
  if (!ramo) errores.push(`ramo no reconocido: «${v('ramo') || 'vacío'}»`);

  const numero = v('numero');
  if (!numero) errores.push('falta el número de póliza');

  const prima = aNumero(v('prima'));
  if (prima === null || prima < 0) errores.push(`prima inválida: «${v('prima') || 'vacío'}»`);

  const inicio = aFechaISO(v('inicio'));
  if (!inicio) errores.push(`fecha de inicio inválida: «${v('inicio') || 'vacío'}»`);

  const vencimiento = aFechaISO(v('vencimiento'));
  if (!vencimiento) errores.push(`fecha de vencimiento inválida: «${v('vencimiento') || 'vacío'}»`);

  // El CHECK `polizas_vigencia_ck` rechaza esto en la base; mejor decirlo aquí.
  if (inicio && vencimiento && vencimiento < inicio) errores.push('vence antes de empezar');

  const comision = aNumero(v('comision'));

  return {
    fila: nFila,
    ok: errores.length === 0,
    errores,
    datos: {
      cliente: { nombre, telefono: v('telefono') || null, email: v('email') || null, rfc: v('rfc') || null },
      poliza: {
        aseguradora: v('aseguradora') || (window.CONFIG && CONFIG.ASEGURADORA) || 'GNP',
        ramo, numero_poliza: numero,
        prima_anual: prima,
        comision_pct: (comision !== null && comision >= 0 && comision <= 100) ? comision : null,
        fecha_inicio: inicio, fecha_vencimiento: vencimiento,
        forma_pago: aFormaPago(v('forma_pago')),
      },
    },
  };
}

/* ── Interfaz del importador ────────────────────────────────────────────────
   Tres pasos en un modal: pegar/elegir archivo → revisar el mapeo y la vista
   previa → importar. El paso del medio existe porque nadie titula sus columnas
   igual, y porque conviene enseñar qué se va a guardar antes de guardarlo.  */
const IMPORT = { filas: [], cabeceras: [], mapa: {}, validadas: [], agenteId: null };

function abrirImportador() {
  if (!$('#modalImportar')) {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-overlay" id="modalImportar">
        <div class="modal modal-ancho">
          <div class="modal-header">
            <h3 class="modal-title">Importar cartera</h3>
            <button class="modal-close" onclick="closeModal('modalImportar')"><i class="fas fa-times"></i></button>
          </div>
          <div id="impCuerpo"></div>
        </div>
      </div>`);
  }
  IMPORT.filas = []; IMPORT.validadas = [];
  pintarImportPaso1();
  openModal('modalImportar');
}

function pintarImportPaso1() {
  $('#impCuerpo').innerHTML = `
    <p class="modal-texto">
      Exporta tu Excel con <b>Archivo → Guardar como → CSV UTF-8</b> y súbelo aquí.
      Una fila por póliza; si un cliente tiene varias, se repite su nombre.
    </p>

    <label class="imp-soltar" for="impArchivo">
      <i class="fas fa-file-csv"></i>
      <span>Elige tu archivo .csv</span>
      <input type="file" id="impArchivo" accept=".csv,text/csv" class="oculto">
    </label>

    <details class="imp-ayuda">
      <summary>¿Qué columnas necesita?</summary>
      <p class="modal-texto">Se reconocen solas por el título, con sus variantes
        habituales. Obligatorias en <b>negrita</b>:</p>
      <ul class="imp-lista">
        ${COLUMNAS_IMPORT.map((c) => `<li>${c.obligatoria ? `<b>${c.etiqueta}</b>` : c.etiqueta}</li>`).join('')}
      </ul>
      <p class="modal-texto">Las fechas pueden ir como <code>dd/mm/aaaa</code> o
        <code>aaaa-mm-dd</code>. El ramo se reconoce por nombre común
        («GMM», «Automóvil», «Daños»…).</p>
    </details>

    <div id="impAviso"></div>`;

  $('#impArchivo').addEventListener('change', (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    const lector = new FileReader();
    lector.onload = () => procesarCSV(String(lector.result));
    lector.onerror = () => { $('#impAviso').innerHTML =
      '<p class="imp-error">No se pudo leer el archivo.</p>'; };
    // UTF-8 explícito: Excel en Windows guarda en Latin-1 y sin esto los
    // acentos entran rotos, el mismo problema que costó una sesión entera.
    lector.readAsText(f, 'UTF-8');
  });
}

async function procesarCSV(texto) {
  const filas = parsearCSV(texto);
  if (filas.length < 2) {
    $('#impAviso').innerHTML = '<p class="imp-error">El archivo no tiene filas de datos.</p>';
    return;
  }
  IMPORT.cabeceras = filas[0];
  IMPORT.filas = filas.slice(1);
  IMPORT.mapa = adivinarMapeo(IMPORT.cabeceras);
  // El Director necesita su equipo para poder elegir a quién asignarle la
  // cartera. Si entró directo a Cartera sin pasar por Equipo, todavía no está.
  if ($('#pdMain') && !EQUIPO.cargado) await cargarEquipo();
  pintarImportPaso2();
}

function pintarImportPaso2() {
  const faltantes = COLUMNAS_IMPORT.filter((c) => c.obligatoria && IMPORT.mapa[c.clave] === undefined);
  const opciones = (sel) => `<option value="">— sin asignar —</option>` +
    IMPORT.cabeceras.map((h, i) =>
      `<option value="${i}" ${sel === i ? 'selected' : ''}>${esc(h || `columna ${i + 1}`)}</option>`).join('');

  // El Director elige a quién se le carga; el agente solo puede a sí mismo.
  //
  // La lista sale de `v_resumen_agente` y no de `AGENTES`: la vista pública no
  // expone `usuario_id` —a propósito, es pública— y es justo la columna que
  // llevan `clientes.agente_id` y `polizas.agente_id`. Filtrando `AGENTES` por
  // ese campo el selector salía vacío y no se podía importar nada.
  const soyDirector = !!$('#pdMain');
  const equipo = EQUIPO.filas.filter((f) => f.usuario_id);
  const selectorAgente = !soyDirector ? '' : (equipo.length ? `
    <div class="imp-campo">
      <label for="impAgente"><b>¿De quién es esta cartera?</b></label>
      <select id="impAgente">
        ${equipo.map((f) => `<option value="${esc(f.usuario_id)}">${esc(f.agente_nombre)}</option>`).join('')}
      </select>
      <p class="modal-texto imp-nota">Todas las pólizas del archivo se le asignan a esta persona.</p>
    </div>`
    : '<p class="imp-error">No se pudo cargar tu equipo. Recarga la página e intenta de nuevo.</p>');

  $('#impCuerpo').innerHTML = `
    <p class="modal-texto">
      <b>${IMPORT.filas.length}</b> filas leídas. Revisa que cada dato apunte a
      la columna correcta y corrige lo que haga falta.
    </p>
    ${selectorAgente}
    ${faltantes.length ? `<p class="imp-error">
      Falta asignar: ${faltantes.map((c) => c.etiqueta).join(', ')}.</p>` : ''}

    <div class="imp-mapeo">
      ${COLUMNAS_IMPORT.map((c) => `
        <div class="imp-campo">
          <label for="map_${c.clave}">${c.obligatoria ? `<b>${c.etiqueta}</b>` : c.etiqueta}</label>
          <select id="map_${c.clave}" data-clave="${c.clave}">${opciones(IMPORT.mapa[c.clave])}</select>
        </div>`).join('')}
    </div>

    <div class="modal-acciones">
      <button class="btn btn-ghost btn-sm" onclick="pintarImportPaso1()">Atrás</button>
      <button class="btn btn-acento btn-sm" id="impRevisar">Revisar los datos</button>
    </div>`;

  $$('#impCuerpo select[data-clave]').forEach((s) => s.addEventListener('change', () => {
    const v = s.value;
    if (v === '') delete IMPORT.mapa[s.dataset.clave];
    else IMPORT.mapa[s.dataset.clave] = Number(v);
  }));

  $('#impRevisar').addEventListener('click', () => {
    const falta = COLUMNAS_IMPORT.filter((c) => c.obligatoria && IMPORT.mapa[c.clave] === undefined);
    if (falta.length) { pintarImportPaso2(); return; }
    IMPORT.agenteId = soyDirector ? $('#impAgente').value : MI_USUARIO_ID;
    IMPORT.validadas = IMPORT.filas.map((f, i) => validarFila(f, IMPORT.mapa, i + 2));
    pintarImportPaso3();
  });
}

function pintarImportPaso3() {
  const buenas = IMPORT.validadas.filter((v) => v.ok);
  const malas  = IMPORT.validadas.filter((v) => !v.ok);
  const prima  = buenas.reduce((s, v) => s + v.datos.poliza.prima_anual, 0);
  const clientes = new Set(buenas.map((v) => normaliza(v.datos.cliente.nombre))).size;

  $('#impCuerpo').innerHTML = `
    <div class="imp-resumen">
      <div><b>${buenas.length}</b><span>pólizas listas</span></div>
      <div><b>${clientes}</b><span>clientes</span></div>
      <div><b>${money(prima)}</b><span>prima anual</span></div>
      <div class="${malas.length ? 'imp-malas' : ''}"><b>${malas.length}</b><span>con problemas</span></div>
    </div>

    ${malas.length ? `
      <details class="imp-ayuda" open>
        <summary>${malas.length} fila(s) que se van a omitir</summary>
        <ul class="imp-lista imp-errores">
          ${malas.slice(0, 30).map((m) => `<li><b>Fila ${m.fila}:</b> ${esc(m.errores.join('; '))}</li>`).join('')}
          ${malas.length > 30 ? `<li>…y ${malas.length - 30} más</li>` : ''}
        </ul>
        <p class="modal-texto">Corrígelas en tu Excel y vuelve a subirlo; las
          que ya entraron no se duplican, porque el número de póliza es único
          por aseguradora.</p>
      </details>` : ''}

    ${buenas.length ? `
      <p class="modal-texto">Primeras filas, como quedarían guardadas:</p>
      <div class="admin-table-wrap imp-previa">
        <table class="admin-table">
          <thead><tr><th>Cliente</th><th>Ramo</th><th>Póliza</th><th>Prima</th><th>Vence</th></tr></thead>
          <tbody>${buenas.slice(0, 5).map((v) => `<tr>
            <td>${esc(v.datos.cliente.nombre)}</td>
            <td>${esc((RAMOS[v.datos.poliza.ramo] || {}).label || v.datos.poliza.ramo)}</td>
            <td class="col-num">${esc(v.datos.poliza.numero_poliza)}</td>
            <td class="col-num">${money(v.datos.poliza.prima_anual)}</td>
            <td>${fechaCorta(v.datos.poliza.fecha_vencimiento)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>` : '<p class="imp-error">No hay ninguna fila válida para importar.</p>'}

    <div class="modal-acciones">
      <button class="btn btn-ghost btn-sm" onclick="pintarImportPaso2()">Atrás</button>
      <button class="btn btn-acento btn-sm" id="impGuardar" ${buenas.length ? '' : 'disabled'}>
        <i class="fas fa-cloud-arrow-up"></i> Importar ${buenas.length} póliza(s)
      </button>
    </div>
    <div id="impProgreso"></div>`;

  const btn = $('#impGuardar');
  if (btn) btn.addEventListener('click', () => guardarImportacion(buenas));
}

async function guardarImportacion(buenas) {
  const btn = $('#impGuardar');
  const prog = $('#impProgreso');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importando…';

  if (!window.sbClient) { prog.innerHTML = '<p class="imp-error">Sin conexión a la base.</p>'; return; }
  if (!IMPORT.agenteId) {
    prog.innerHTML = '<p class="imp-error">No se pudo determinar de quién es la cartera.</p>';
    btn.disabled = false; return;
  }

  try {
    // Un cliente puede traer varias pólizas: se agrupa por nombre para no
    // crear cuatro «Juan Pérez» distintos con una póliza cada uno.
    const porCliente = new Map();
    buenas.forEach((v) => {
      const k = normaliza(v.datos.cliente.nombre);
      if (!porCliente.has(k)) porCliente.set(k, { cliente: v.datos.cliente, polizas: [] });
      porCliente.get(k).polizas.push(v.datos.poliza);
    });

    // Reusar los clientes que ya existen con ese nombre, en vez de duplicarlos.
    const { data: yaHay, error: eLee } = await sbClient
      .from('clientes').select('id, nombre').eq('agente_id', IMPORT.agenteId);
    if (eLee) throw eLee;
    const existentes = new Map((yaHay || []).map((c) => [normaliza(c.nombre), c.id]));

    const nuevos = [...porCliente.entries()].filter(([k]) => !existentes.has(k));
    if (nuevos.length) {
      const { data, error } = await sbClient.from('clientes')
        .insert(nuevos.map(([, g]) => ({ ...g.cliente, agente_id: IMPORT.agenteId })))
        .select('id, nombre');
      if (error) throw error;
      (data || []).forEach((c) => existentes.set(normaliza(c.nombre), c.id));
    }

    const polizas = [];
    porCliente.forEach((g, k) => g.polizas.forEach((p) =>
      polizas.push({ ...p, cliente_id: existentes.get(k), agente_id: IMPORT.agenteId })));

    // `upsert` sobre (aseguradora, numero_poliza), que es único: reimportar el
    // mismo archivo actualiza en vez de reventar con un error de duplicado.
    const { error: ePol } = await sbClient.from('polizas')
      .upsert(polizas, { onConflict: 'aseguradora,numero_poliza' });
    if (ePol) throw ePol;

    // Con pólizas nuevas el motor de reglas tiene material que analizar.
    // Se pasa el agente explícitamente: `generar_mis_oportunidades()` genera
    // para quien llama, y cuando el Director importa la cartera de alguien de
    // su equipo, quien llama no es el dueño de esas pólizas.
    let oportunidades = 0;
    try {
      const { data, error } = await sbClient.rpc('generar_oportunidades_de', { p_agente: IMPORT.agenteId });
      if (error) throw error;
      oportunidades = Number(data) || 0;
    } catch (e) { console.warn('No se generaron oportunidades:', e.message); }

    prog.innerHTML = `<p class="imp-ok">
      <i class="fas fa-circle-check"></i>
      Listo: ${polizas.length} póliza(s) de ${porCliente.size} cliente(s).
      ${oportunidades ? `Se detectaron ${oportunidades} oportunidad(es).` : ''}
    </p>`;
    btn.innerHTML = 'Importado';

    await cargarCartera();
    setTimeout(() => { closeModal('modalImportar'); recargarSeccionCartera(); }, 1600);
  } catch (e) {
    console.error(e);
    prog.innerHTML = `<p class="imp-error">No se pudo importar: ${esc(e.message || 'error desconocido')}</p>`;
    btn.disabled = false;
    btn.innerHTML = 'Reintentar';
  }
}

/* Repinta la sección de cartera del panel en el que estemos. */
function recargarSeccionCartera() {
  const pd = $('#pdMain'), pa = $('#paMain');
  if (pd && $('.tab-btn[data-tab="polizas"]')) { pd.innerHTML = seccionCartera(true);  activarTabsCartera(); }
  else if (pa && $('.tab-btn[data-tab="polizas"]')) { pa.innerHTML = seccionCartera(false); activarTabsCartera(); }
}

/* Entrar a Cartera: la primera vez se lee de la base, y mientras tanto la
   sección ya está pintada con su estado de carga. Después se sirve de memoria,
   para que cambiar de sección y volver sea instantáneo como en Ingresos. */
function entrarACartera(repintar) {
  if (CARTERA.cargado) { activarTabsCartera(); return; }
  cargarCartera().then(() => { repintar(); activarTabsCartera(); });
}

/* ===========================================================================
   21. Cartera — pantallas portadas de la mini-app vieja

   Equipo (Director) · Clientes y Actividad (Agente). Se apoyan en la misma
   `v_resumen_agente` y en las tablas `clientes` y `actividad` que ya usaba
   `cartera/`, pero pintadas con los componentes del panel.
   =========================================================================== */

const EQUIPO = { filas: [], actividad: [], cargado: false, error: '' };

async function cargarEquipo() {
  if (!window.sbClient) { EQUIPO.error = 'Sin conexión a la base.'; EQUIPO.cargado = true; return; }
  const hace30 = new Date(Date.now() - 30 * 86400000).toISOString();
  try {
    // La cartera hace falta para poder desglosar los números al hacer clic;
    // sin ella la tabla se vería igual pero las celdas no abrirían nada.
    const [resumen, act, cli] = await Promise.all([
      sbClient.from('v_resumen_agente').select('*').order('prima_bajo_gestion', { ascending: false }),
      sbClient.from('actividad')
        .select('id, agente_id, cliente_id, tipo, descripcion, fecha, resultado')
        .gte('fecha', hace30).order('fecha', { ascending: false }),
      sbClient.from('clientes').select('id, nombre'),
      CARTERA.cargado ? Promise.resolve() : cargarCartera(),
    ]);
    if (resumen.error) throw resumen.error;
    if (act.error)     throw act.error;
    if (cli.error)     throw cli.error;
    EQUIPO.filas = resumen.data || [];
    const nombre = new Map((cli.data || []).map((c) => [c.id, c.nombre]));
    EQUIPO.actividad = (act.data || []).map((a) => ({ ...a, cliente_nombre: nombre.get(a.cliente_id) || '—' }));
    EQUIPO.error = '';
  } catch (e) {
    EQUIPO.error = e.message || 'No se pudo leer el equipo.';
    console.warn('Equipo:', e);
  }
  EQUIPO.cargado = true;
}

/* Los mismos filtros que usa `v_resumen_agente` para contar. Se definen una
   sola vez y los usan la tabla y el desglose: si divergen, el número de la
   celda no coincide con lo que se abre al hacer clic, que es peor que no
   poder hacer clic. */
const VIVA = (p) => p.estatus === 'activa' || p.estatus === 'por_vencer';

const DETALLE_EQUIPO = {
  polizas: {
    titulo: 'Pólizas vigentes',
    filtrar: (id) => CARTERA.polizas.filter((p) => p.agente_id === id && VIVA(p)),
  },
  vencen: {
    // Sin límite inferior, igual que la vista: una póliza ya vencida y sin
    // renovar sigue siendo trabajo pendiente, no algo que deba desaparecer.
    titulo: 'Vencen en 30 días',
    filtrar: (id) => CARTERA.polizas.filter((p) => p.agente_id === id && VIVA(p) &&
      diasPara(p.fecha_vencimiento) <= 30),
  },
  oportunidades: {
    titulo: 'Oportunidades abiertas',
    filtrar: (id) => CARTERA.oportunidades.filter((o) => o.agente_id === id),
  },
  actividad: {
    titulo: 'Actividad de los últimos 30 días',
    filtrar: (id) => EQUIPO.actividad.filter((a) => a.agente_id === id),
  },
};

function seccionEquipo() {
  if (!EQUIPO.cargado) return '<p class="admin-vacio"><i class="fas fa-spinner fa-spin"></i> Cargando equipo…</p>';
  if (EQUIPO.error)   return `<p class="admin-vacio">${esc(EQUIPO.error)}</p>`;
  if (!EQUIPO.filas.length) return `
    <h1 class="admin-page-title">Equipo</h1>
    <p class="admin-page-sub">Cómo va la cartera de cada quien</p>
    <p class="admin-vacio">Todavía no hay agentes con cartera.</p>`;

  const total = (campo) => EQUIPO.filas.reduce((s, f) => s + Number(f[campo] || 0), 0);

  return `
    <h1 class="admin-page-title">Equipo</h1>
    <p class="admin-page-sub">Cómo va la cartera de cada quien</p>

    <div class="kpi-grid">
      ${kpi('fa-file-contract', 'Pólizas del equipo', total('polizas_vigentes'), 'vigentes')}
      ${kpi('fa-coins', 'Prima bajo gestión', money(total('prima_bajo_gestion')), 'suma del equipo')}
      ${kpi('fa-triangle-exclamation', 'Vencen en 30 días', total('vencen_30d'), 'de todo el equipo',
            total('vencen_30d') ? 'alerta' : '')}
      ${kpi('fa-lightbulb', 'Oportunidades nuevas', total('oportunidades_nuevas'), 'sin trabajar')}
    </div>

    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr>
          <th>Agente</th><th>Zona</th>
          <th class="col-num">Pólizas</th><th class="col-num">Prima</th>
          <th class="col-num">Vencen 30d</th><th class="col-num">Oportunidades</th>
          <th class="col-num">Actividad 30d</th><th>Estado</th>
        </tr></thead>
        <tbody>
          ${EQUIPO.filas.map((f) => {
            const inactivo = f.suspended || !f.activo;
            // Abiertas = nuevas + en proceso, el mismo criterio que Cartera.
            // La vista las cuenta por separado; si aquí se usara solo
            // `oportunidades_nuevas`, el desglose mostraría más de las que
            // dice el número.
            const oport = Number(f.oportunidades_nuevas || 0) + Number(f.oportunidades_en_proceso || 0);
            const abridor = (tipo, n, dentro) => Number(n) > 0
              ? `<button class="celda-link" data-agente-id="${esc(f.usuario_id)}" data-detalle="${tipo}"
                   title="Ver el detalle">${dentro}</button>`
              : dentro;
            return `<tr>
              <td><b>${esc(f.agente_nombre)}</b><br><span class="tabla-sub">${esc(f.email || '')}</span></td>
              <td>${esc(f.zona || '—')}</td>
              <td class="col-num">${abridor('polizas', f.polizas_vigentes, String(f.polizas_vigentes || 0))}</td>
              <td class="col-num">${money(f.prima_bajo_gestion)}</td>
              <td class="col-num">${abridor('vencen', f.vencen_30d,
                    Number(f.vencen_30d) ? `<span class="pill pill-warn pill-sm">${f.vencen_30d}</span>` : '0')}</td>
              <td class="col-num">${abridor('oportunidades', oport, String(oport))}</td>
              <td class="col-num">${abridor('actividad', f.actividad_30d,
                    Number(f.actividad_30d) === 0 && Number(f.polizas_vigentes) > 0
                      ? '<span class="pill pill-err pill-sm">0</span>' : String(f.actividad_30d || 0))}</td>
              <td><span class="pill ${inactivo ? 'pill-off' : 'pill-ok'} pill-sm">
                    ${f.suspended ? 'Suspendido' : f.activo ? 'Activo' : 'Inactivo'}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    <p class="admin-nota"><i class="fas fa-circle-info"></i>
      Los números subrayados se abren: dale clic y ves exactamente qué pólizas,
      qué vencimientos o qué contactos hay detrás, para poder decirle al agente
      en qué tiene que trabajar. «Actividad 30d» en rojo es un agente con
      pólizas a su nombre que no ha registrado un solo contacto en el último
      mes: la señal más temprana de una cartera que se va a caer en la
      renovación.</p>`;
}

/* ── Desglose de una celda de Equipo ──────────────────────────────────────── */
function activarEquipo() {
  $$('.celda-link').forEach((b) => b.addEventListener('click', () =>
    abrirDetalleEquipo(b.dataset.agenteId, b.dataset.detalle)));
}

function abrirDetalleEquipo(usuarioId, tipo) {
  const def = DETALLE_EQUIPO[tipo];
  const fila = EQUIPO.filas.find((f) => f.usuario_id === usuarioId);
  if (!def || !fila) return;
  const datos = def.filtrar(usuarioId);

  const tabla = (cabeceras, filas) => `
    <div class="admin-table-wrap detalle-tabla">
      <table class="admin-table">
        <thead><tr>${cabeceras.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${filas.join('')}</tbody>
      </table>
    </div>`;

  let cuerpo;
  if (!datos.length) {
    cuerpo = '<p class="admin-vacio">Nada que mostrar aquí.</p>';
  } else if (tipo === 'polizas' || tipo === 'vencen') {
    const total = datos.reduce((s, p) => s + Number(p.prima_anual || 0), 0);
    cuerpo = tabla(['Cliente', 'Ramo', 'Póliza', 'Prima', 'Vence', tipo === 'vencen' ? 'Faltan' : 'Estatus'],
      datos.slice().sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento)).map((p) => {
        const d = diasPara(p.fecha_vencimiento);
        const e = ESTATUS_POLIZA[p.estatus] || { txt: p.estatus, clase: 'pill-off' };
        return `<tr>
          <td><b>${esc(p.cliente_nombre)}</b>${p.cliente_telefono
              ? `<br><a class="tabla-sub" target="_blank" rel="noopener"
                   href="https://wa.me/${esc(String(p.cliente_telefono).replace(/\D/g, ''))}">
                   <i class="fab fa-whatsapp"></i> ${esc(p.cliente_telefono)}</a>` : ''}</td>
          <td>${esc((RAMOS[p.ramo] || {}).label || p.ramo)}</td>
          <td class="col-num">${esc(p.numero_poliza)}</td>
          <td class="col-num">${money(p.prima_anual)}</td>
          <td>${fechaCorta(p.fecha_vencimiento)}</td>
          <td>${tipo === 'vencen'
              ? `<span class="pill ${d < 0 ? 'pill-err' : d <= 15 ? 'pill-err' : 'pill-warn'} pill-sm">
                   ${d < 0 ? `vencida hace ${-d} d` : d === 0 ? 'hoy' : `en ${d} d`}</span>`
              : `<span class="pill ${e.clase} pill-sm">${e.txt}</span>`}</td>
        </tr>`;
      }))
      + `<p class="detalle-total">Prima anual sumada: <b>${money(total)}</b></p>`;
  } else if (tipo === 'oportunidades') {
    cuerpo = tabla(['Cliente', 'Tipo', 'Ramo sugerido', 'Por qué', 'Valor est.'],
      datos.map((o) => {
        const t = OPORTUNIDAD_ETIQUETA[o.tipo] || { txt: o.tipo, clase: 'pill-off' };
        return `<tr>
          <td><b>${esc(o.cliente_nombre)}</b></td>
          <td><span class="pill ${t.clase} pill-sm">${t.txt}</span></td>
          <td>${o.ramo_sugerido ? esc((RAMOS[o.ramo_sugerido] || {}).label || o.ramo_sugerido) : '—'}</td>
          <td class="tabla-motivo">${esc(o.motivo)}</td>
          <td class="col-num">${o.valor_estimado ? money(o.valor_estimado) : '—'}</td>
        </tr>`;
      }));
  } else {
    cuerpo = `<ul class="act-lista">${datos.map((a) => {
      const t = TIPO_ACTIVIDAD[a.tipo] || { txt: a.tipo, icono: 'fa-circle' };
      const r = RESULTADO_ACTIVIDAD[a.resultado];
      const d = Math.round((Date.now() - new Date(a.fecha)) / 86400000);
      return `<li class="act-item">
        <span class="act-icono"><i class="fa${a.tipo === 'whatsapp' ? 'b' : 's'} ${t.icono}"></i></span>
        <div class="act-cuerpo">
          <div class="act-cabeza"><b>${esc(a.cliente_nombre)}</b>
            <span class="tabla-sub">${t.txt} · ${d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`}</span></div>
          <p class="act-texto">${esc(a.descripcion)}</p>
        </div>
        ${r ? `<span class="pill ${r.clase} pill-sm">${r.txt}</span>` : ''}
      </li>`;
    }).join('')}</ul>`;
  }

  const viejo = $('#modalDetalle');
  if (viejo) viejo.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="modalDetalle">
      <div class="modal modal-ancho">
        <div class="modal-header">
          <div>
            <h3 class="modal-title">${def.titulo}</h3>
            <p class="modal-sub">${esc(fila.agente_nombre)} · ${datos.length} registro(s)</p>
          </div>
          <button class="modal-close" onclick="closeModal('modalDetalle')"><i class="fas fa-times"></i></button>
        </div>
        ${cuerpo}
      </div>
    </div>`);
  openModal('modalDetalle');
}

/* ── Clientes (panel del Agente) ─────────────────────────────────────────── */
const CLIENTES = { filas: [], cargado: false, error: '', filtro: '' };

async function cargarClientes() {
  if (!window.sbClient) { CLIENTES.error = 'Sin conexión a la base.'; CLIENTES.cargado = true; return; }
  try {
    // El RLS ya limita a los propios; no hace falta filtrar por agente aquí.
    const { data, error } = await sbClient
      .from('clientes').select('id, nombre, telefono, email, rfc, cita_origen_id, created_at').order('nombre');
    if (error) throw error;
    CLIENTES.filas = data || [];
    CLIENTES.error = '';
  } catch (e) {
    CLIENTES.error = e.message || 'No se pudieron leer los clientes.';
    console.warn('Clientes:', e);
  }
  CLIENTES.cargado = true;
}

function seccionClientes() {
  if (!CLIENTES.cargado) return '<p class="admin-vacio"><i class="fas fa-spinner fa-spin"></i> Cargando clientes…</p>';
  if (CLIENTES.error)   return `<p class="admin-vacio">${esc(CLIENTES.error)}</p>`;

  const q = normaliza(CLIENTES.filtro);
  const lista = q ? CLIENTES.filas.filter((c) =>
    normaliza(c.nombre).includes(q) || String(c.telefono || '').includes(CLIENTES.filtro.trim())) : CLIENTES.filas;

  return `
    <h1 class="admin-page-title">Mis clientes</h1>
    <p class="admin-page-sub">${CLIENTES.filas.length} en tu cartera</p>

    <div class="admin-acciones-top cli-barra">
      <input class="form-input cli-buscar" id="cliBuscar" placeholder="Buscar por nombre o teléfono…"
             value="${esc(CLIENTES.filtro)}" />
      <button class="btn btn-acento btn-sm" onclick="abrirNuevoCliente()">
        <i class="fas fa-user-plus"></i> Nuevo cliente
      </button>
    </div>

    ${lista.length ? `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Cliente</th><th>Teléfono</th><th>Correo</th><th>RFC</th><th></th></tr></thead>
          <tbody>
            ${lista.map((c) => `<tr>
              <td><b>${esc(c.nombre)}</b></td>
              <td class="col-num">${esc(c.telefono || '—')}</td>
              <td>${esc(c.email || '—')}</td>
              <td class="col-num">${esc(c.rfc || '—')}</td>
              <td>${c.telefono ? `<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener"
                    href="https://wa.me/${esc(String(c.telefono).replace(/\D/g, ''))}">
                    <i class="fab fa-whatsapp"></i></a>` : ''}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`
    : `<p class="admin-vacio">${CLIENTES.filas.length
        ? 'Ningún cliente coincide con esa búsqueda.'
        : 'Todavía no tienes clientes. Impórtalos desde Cartera o da de alta uno aquí.'}</p>`}`;
}

/* Un solo punto de repintado: la sección se vuelve a generar y se reengancha
   sola. Evita pasar la función a sí misma por parámetro. */
function repintarClientes() {
  const main = $('#paMain');
  if (!main) return;
  main.innerHTML = seccionClientes();
  activarClientes();
}

function activarClientes() {
  const inp = $('#cliBuscar');
  if (!inp) return;
  inp.addEventListener('input', () => {
    CLIENTES.filtro = inp.value;
    repintarClientes();
    // Repintar reemplaza el input, así que hay que devolver el foco y dejar el
    // cursor al final o se escribe al revés.
    const nuevo = $('#cliBuscar');
    if (nuevo) { nuevo.focus(); nuevo.setSelectionRange(nuevo.value.length, nuevo.value.length); }
  });
}

/* `citaId` opcional: cuando se entra desde una cita ya atendida, llega
   preseleccionada. Es lo que llena `clientes.cita_origen_id`, la columna que
   permite saber cuántas de las citas que llegan del directorio terminan en
   venta — el número que dice si el producto sirve. Estaba en el esquema desde
   el principio y nadie la llenaba. */
async function abrirNuevoCliente(citaId) {
  // Al entrar desde una cita puede que los clientes no estén cargados: sin
  // ellos no se sabe qué citas ya produjeron uno y se ofrecerían repetidas.
  if (!CLIENTES.cargado) await cargarClientes();

  // Se regenera cada vez en vez de reutilizarse: la lista de citas elegibles
  // cambia conforme se registran clientes, y un modal cacheado la mostraría
  // desactualizada.
  const viejo = $('#modalCliente');
  if (viejo) viejo.remove();

  // Solo las citas que ya se atendieron y que todavía no tienen cliente: una
  // cita produce un cliente, no varios.
  const usadas = new Set(CLIENTES.filas.map((c) => c.cita_origen_id).filter(Boolean));
  const elegibles = misCitasDeHoy().filter((c) =>
    ['completada', 'confirmada'].includes(c.estado) && !usadas.has(c.id));

  const cita = elegibles.find((c) => c.id === citaId) || null;

  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="modalCliente">
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">Nuevo cliente</h3>
          <button class="modal-close" onclick="closeModal('modalCliente')"><i class="fas fa-times"></i></button>
        </div>
        <div class="form-group">
          <label class="form-label" for="cliCita">¿De qué cita salió?</label>
          <select class="form-input" id="cliCita">
            <option value="">— no vino de una cita —</option>
            ${elegibles.map((c) => `<option value="${esc(c.id)}"
              ${c.id === citaId ? 'selected' : ''}>${esc(c.cliente)} · ${fechaCorta(c.fecha)}
              · ${esc((RAMOS[c.ramo] || {}).label || c.ramo || 'sin ramo')}</option>`).join('')}
          </select>
          <p class="modal-texto imp-nota">Con esto se puede medir cuántas de las
            citas que te llegan terminan en venta. Si el cliente te buscó por
            fuera, déjalo en «no vino de una cita».</p>
        </div>
        <div class="form-group">
          <label class="form-label" for="cliNombre">Nombre *</label>
          <input class="form-input" id="cliNombre" autocomplete="off"
                 value="${esc(cita ? cita.cliente : '')}" />
        </div>
        <div class="imp-mapeo">
          <div class="form-group"><label class="form-label" for="cliTel">Teléfono</label>
            <input class="form-input" id="cliTel" placeholder="+52..."
                   value="${esc(cita ? (cita.wa || '') : '')}" /></div>
          <div class="form-group"><label class="form-label" for="cliMail">Correo</label>
            <input class="form-input" id="cliMail" type="email" /></div>
          <div class="form-group"><label class="form-label" for="cliRfc">RFC</label>
            <input class="form-input" id="cliRfc" /></div>
          <div class="form-group"><label class="form-label" for="cliNac">Fecha de nacimiento</label>
            <input class="form-input" id="cliNac" type="date" /></div>
        </div>
        <div class="modal-acciones">
          <button class="btn btn-ghost btn-sm" onclick="closeModal('modalCliente')">Cancelar</button>
          <button class="btn btn-acento btn-sm" id="cliGuardar">
            <i class="fas fa-floppy-disk"></i> Guardar
          </button>
        </div>
        <div id="cliAviso"></div>
      </div>
    </div>`);

  // Al elegir una cita se copian nombre y teléfono, que ya los dio el cliente
  // al agendar: volverlos a teclear es una fuente de errores de dedo.
  $('#cliCita').addEventListener('change', (ev) => {
    const c = elegibles.find((x) => x.id === ev.target.value);
    if (!c) return;
    $('#cliNombre').value = c.cliente || '';
    if (!$('#cliTel').value) $('#cliTel').value = c.wa || '';
  });

  $('#cliGuardar').addEventListener('click', guardarCliente);
  openModal('modalCliente');
  $('#cliNombre').focus();
}

async function guardarCliente() {
  const aviso = $('#cliAviso');
  const nombre = $('#cliNombre').value.trim();
  if (!nombre) { aviso.innerHTML = '<p class="imp-error">El nombre es obligatorio.</p>'; return; }
  if (!window.sbClient || !MI_USUARIO_ID) {
    aviso.innerHTML = '<p class="imp-error">No se pudo identificar tu cuenta.</p>'; return;
  }
  const btn = $('#cliGuardar');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';
  try {
    const { error } = await sbClient.from('clientes').insert({
      agente_id: MI_USUARIO_ID,
      nombre,
      telefono: $('#cliTel').value.trim() || null,
      email: $('#cliMail').value.trim() || null,
      rfc: $('#cliRfc').value.trim() || null,
      fecha_nacimiento: $('#cliNac').value || null,
      // De aquí sale la métrica de conversión. Vacío significa que el cliente
      // llegó por otro lado, y eso también es información.
      cita_origen_id: $('#cliCita').value || null,
    });
    if (error) throw error;
    CLIENTES.cargado = false;
    await cargarClientes();
    closeModal('modalCliente');
    // El modal se puede abrir desde Mis clientes o desde una cita atendida.
    // Repintar clientes cuando se está en citas dejaría la pantalla equivocada.
    if ($('#cliBuscar')) repintarClientes();
    else showToast(`${nombre} quedó registrado como tu cliente.`);
  } catch (e) {
    aviso.innerHTML = `<p class="imp-error">No se pudo guardar: ${esc(e.message || 'error')}</p>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Guardar';
  }
}

/* ── Actividad (panel del Agente) ────────────────────────────────────────────
   Cada llamada, WhatsApp o visita que se registra aquí es lo que alimenta la
   regla de «póliza que vence sin contacto reciente» y la columna en rojo del
   panel de Equipo. Sin esto la cartera es una lista muerta.                  */
const ACTIVIDAD = { filas: [], clientes: [], cargado: false, error: '' };

const TIPO_ACTIVIDAD = {
  llamada:    { txt: 'Llamada',     icono: 'fa-phone' },
  whatsapp:   { txt: 'WhatsApp',    icono: 'fa-whatsapp' },
  visita:     { txt: 'Visita',      icono: 'fa-handshake' },
  cotizacion: { txt: 'Cotización',  icono: 'fa-file-invoice-dollar' },
  renovacion: { txt: 'Renovación',  icono: 'fa-rotate' },
  siniestro:  { txt: 'Siniestro',   icono: 'fa-car-burst' },
};

const RESULTADO_ACTIVIDAD = {
  pendiente:     { txt: 'Pendiente',     clase: 'pill-warn' },
  cerrado:       { txt: 'Cerrado',       clase: 'pill-ok'   },
  sin_respuesta: { txt: 'Sin respuesta', clase: 'pill-off'  },
  rechazado:     { txt: 'Rechazado',     clase: 'pill-err'  },
};

async function cargarActividad() {
  if (!window.sbClient) { ACTIVIDAD.error = 'Sin conexión a la base.'; ACTIVIDAD.cargado = true; return; }
  try {
    const [act, cli] = await Promise.all([
      sbClient.from('actividad')
        .select('id, cliente_id, tipo, descripcion, fecha, resultado')
        .order('fecha', { ascending: false }).limit(100),
      sbClient.from('clientes').select('id, nombre').order('nombre'),
    ]);
    if (act.error) throw act.error;
    if (cli.error) throw cli.error;
    ACTIVIDAD.clientes = cli.data || [];
    const porId = new Map(ACTIVIDAD.clientes.map((c) => [c.id, c.nombre]));
    ACTIVIDAD.filas = (act.data || []).map((a) => ({ ...a, cliente_nombre: porId.get(a.cliente_id) || '—' }));
    ACTIVIDAD.error = '';
  } catch (e) {
    ACTIVIDAD.error = e.message || 'No se pudo leer la actividad.';
    console.warn('Actividad:', e);
  }
  ACTIVIDAD.cargado = true;
}

function seccionActividad() {
  if (!ACTIVIDAD.cargado) return '<p class="admin-vacio"><i class="fas fa-spinner fa-spin"></i> Cargando actividad…</p>';
  if (ACTIVIDAD.error)   return `<p class="admin-vacio">${esc(ACTIVIDAD.error)}</p>`;

  const cuando = (f) => {
    const d = Math.round((Date.now() - new Date(f)) / 86400000);
    return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`;
  };

  return `
    <h1 class="admin-page-title">Actividad</h1>
    <p class="admin-page-sub">Lo que has hecho con tus clientes</p>

    ${ACTIVIDAD.clientes.length ? `
      <section class="admin-card">
        <h2>Registrar un contacto</h2>
        <div class="act-chips" id="actChips">
          ${Object.entries(TIPO_ACTIVIDAD).map(([k, v], i) => `
            <button type="button" class="chip-tipo ${i === 0 ? 'activo' : ''}" data-tipo="${k}">
              <i class="fa${k === 'whatsapp' ? 'b' : 's'} ${v.icono}"></i> ${v.txt}
            </button>`).join('')}
        </div>
        <div class="imp-mapeo">
          <div class="form-group">
            <label class="form-label">Cliente *</label>
            <select class="form-input" id="actCliente">
              ${ACTIVIDAD.clientes.map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Resultado</label>
            <select class="form-input" id="actResultado">
              <option value="">— sin definir —</option>
              ${Object.entries(RESULTADO_ACTIVIDAD).map(([k, v]) =>
                `<option value="${k}">${v.txt}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">¿Qué pasó? *</label>
          <input class="form-input" id="actDescripcion" placeholder="Le llamé para la renovación; pidió que le marque el lunes." />
        </div>
        <button class="btn btn-acento btn-sm" id="actGuardar">
          <i class="fas fa-plus"></i> Registrar
        </button>
        <div id="actAviso"></div>
      </section>`
    : '<p class="admin-vacio">Primero necesitas clientes. Impórtalos desde Cartera o da de alta uno en Mis clientes.</p>'}

    <section class="admin-card">
      <h2>Historial</h2>
      ${ACTIVIDAD.filas.length ? `
        <ul class="act-lista">
          ${ACTIVIDAD.filas.map((a) => {
            const t = TIPO_ACTIVIDAD[a.tipo] || { txt: a.tipo, icono: 'fa-circle' };
            const r = RESULTADO_ACTIVIDAD[a.resultado];
            return `<li class="act-item">
              <span class="act-icono"><i class="fa${a.tipo === 'whatsapp' ? 'b' : 's'} ${t.icono}"></i></span>
              <div class="act-cuerpo">
                <div class="act-cabeza">
                  <b>${esc(a.cliente_nombre)}</b>
                  <span class="tabla-sub">${t.txt} · ${cuando(a.fecha)}</span>
                </div>
                <p class="act-texto">${esc(a.descripcion)}</p>
              </div>
              ${r ? `<span class="pill ${r.clase} pill-sm">${r.txt}</span>` : ''}
            </li>`;
          }).join('')}
        </ul>`
      : '<p class="admin-vacio">Sin actividad registrada todavía.</p>'}
    </section>`;
}

function activarActividad() {
  const chips = $$('#actChips .chip-tipo');
  chips.forEach((c) => c.addEventListener('click', () =>
    chips.forEach((x) => x.classList.toggle('activo', x === c))));

  const btn = $('#actGuardar');
  if (btn) btn.addEventListener('click', guardarActividad);
}

async function guardarActividad() {
  const aviso = $('#actAviso');
  const desc = $('#actDescripcion').value.trim();
  const cliente = $('#actCliente').value;
  const activo = $('#actChips .chip-tipo.activo');

  if (!desc)    { aviso.innerHTML = '<p class="imp-error">Escribe qué pasó.</p>'; return; }
  if (!cliente) { aviso.innerHTML = '<p class="imp-error">Elige un cliente.</p>'; return; }
  if (!window.sbClient || !MI_USUARIO_ID) {
    aviso.innerHTML = '<p class="imp-error">No se pudo identificar tu cuenta.</p>'; return;
  }

  const btn = $('#actGuardar');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando…';
  try {
    const { error } = await sbClient.from('actividad').insert({
      agente_id: MI_USUARIO_ID,
      cliente_id: cliente,
      tipo: activo ? activo.dataset.tipo : 'llamada',
      descripcion: desc,
      resultado: $('#actResultado').value || null,
    });
    if (error) throw error;
    ACTIVIDAD.cargado = false;
    await cargarActividad();
    const main = $('#paMain');
    if (main) { main.innerHTML = seccionActividad(); activarActividad(); }
  } catch (e) {
    aviso.innerHTML = `<p class="imp-error">No se pudo registrar: ${esc(e.message || 'error')}</p>`;
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-plus"></i> Registrar';
  }
}

/* ===========================================================================
   22. Ordenar la lista de agentes (panel del Director)

   Sirve para premiar a quien va bien y ver a quién hay que acompañar. Y es
   la base de lo que viene después: decidir el orden en que salen en el sitio
   público. El esquema ya tiene `es_destacado` y `top10` para eso.
   =========================================================================== */

let ORDEN_AGENTES = 'prima';

const ORDENES_PANEL = [
  { clave: 'prima',        txt: 'Más prima colocada',
    pie:  'ordenados por prima bajo gestión',
    nota: 'Prima anual de las pólizas vigentes que tiene cada uno. Es la medida de venta más honesta que hay en la base; las citas solo dicen quién tuvo la conversación, no quién cerró.' },
  { clave: 'prima_asc',    txt: 'Menos prima colocada',
    pie:  'los de menor cartera primero',
    nota: 'Los de abajo son los que necesitan acompañamiento. Ojo con los recién llegados: aparecen aquí sin que signifique mal desempeño.' },
  { clave: 'polizas',      txt: 'Más pólizas',
    pie:  'ordenados por número de pólizas',
    nota: 'Cuenta operaciones, no dinero. Alguien con muchas pólizas chicas sale arriba de quien colocó una empresarial grande.' },
  { clave: 'rating',       txt: 'Mejor calificados',
    pie:  'ordenados por calificación ponderada',
    nota: 'No es el promedio a secas: quien tiene una sola reseña de 5★ no está por encima de quien tiene 40 promediando 4.8. Las calificaciones con pocas opiniones se acercan al promedio del equipo hasta que juntan historial. Los que no tienen ninguna reseña van al final: todavía no hay nada que juzgar.' },
  { clave: 'rating_asc',   txt: 'Peor calificados',
    pie:  'los peor calificados primero',
    nota: 'Mismo cálculo ponderado, al revés, y solo entre quienes SÍ tienen reseñas. Un agente sin reseñas no es un agente malo: es uno nuevo, y ocuparía el lugar del que de verdad tiene un problema.' },
  { clave: 'citas',        txt: 'Más citas atendidas',
    pie:  'ordenados por citas',
    nota: 'Mide actividad, no resultado: son las conversaciones que tuvo, hayan cerrado o no.' },
  { clave: 'abandono',     txt: 'Cartera sin seguimiento',
    pie:  'los que no han contactado a nadie primero',
    nota: 'Agentes con pólizas a su nombre y ningún contacto registrado en 30 días. Es donde se pierde una renovación sin que nadie se entere.' },
  { clave: 'nombre',       txt: 'Nombre (A-Z)',
    pie:  'en orden alfabético',
    nota: 'Sin criterio de desempeño, para cuando solo buscas a alguien.' },
];

/* Lo que cada agente tiene en cartera. Se cruza por `usuario_id`, que la vista
   pública no expone, así que se pasa por `v_resumen_agente` (cargado en
   Equipo) y, si no está, se cae a los agregados de la propia vista. */
function carteraDe(a) {
  const fila = EQUIPO.filas.find((f) => f.agente_id === a.id);
  if (fila) return {
    polizas: Number(fila.polizas_vigentes || 0),
    prima: Number(fila.prima_bajo_gestion || 0),
    actividad: Number(fila.actividad_30d || 0),
  };
  return { polizas: 0, prima: 0, actividad: 0 };
}

/* Cuántas reseñas hacen falta para que la calificación propia pese más que el
   promedio del equipo. Con 5, alguien con 5 opiniones va mitad y mitad. */
const RESENAS_PARA_CONFIAR = 5;

function notaPonderada(a) {
  const conNota = AGENTES.filter((x) => Number(x.num_resenas || 0) > 0);
  const promedioEquipo = conNota.length
    ? conNota.reduce((s, x) => s + Number(x.calificacion || 0), 0) / conNota.length : 0;
  const v = Number(a.num_resenas || 0);
  const R = Number(a.calificacion || 0);
  if (!v) return 0;
  return (v / (v + RESENAS_PARA_CONFIAR)) * R
       + (RESENAS_PARA_CONFIAR / (v + RESENAS_PARA_CONFIAR)) * promedioEquipo;
}

function ordenarAgentesPanel(lista, clave) {
  const c = (a) => carteraDe(a);
  const conResenas = (a) => Number(a.num_resenas || 0) > 0;

  const criterios = {
    prima:     (a, b) => c(b).prima - c(a).prima,
    prima_asc: (a, b) => c(a).prima - c(b).prima,
    polizas:   (a, b) => c(b).polizas - c(a).polizas,
    citas:     (a, b) => (b.num_citas || 0) - (a.num_citas || 0),
    nombre:    (a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'),

    // Promedio ponderado, no el crudo. Con el crudo, alguien con UNA reseña de
    // 5★ le gana a quien tiene 40 promediando 4.8, que es justo lo contrario de
    // lo que el Director necesita ver. Se mezcla la calificación de cada uno
    // con el promedio del equipo, dándole peso según cuántas reseñas tenga:
    // pocas opiniones tiran al promedio general, muchas mandan por sí solas.
    // Es el mismo cálculo con el que IMDb evita que dos votos encabecen la
    // lista. Los que no tienen ninguna reseña van al final en los dos sentidos:
    // no son ni los mejores ni los peores, todavía no tienen historial.
    rating:     (a, b) => (conResenas(b) - conResenas(a)) || (notaPonderada(b) - notaPonderada(a)),
    rating_asc: (a, b) => (conResenas(b) - conResenas(a)) || (notaPonderada(a) - notaPonderada(b)),

    // Primero quien tiene cartera y cero contactos; entre ellos, el de más
    // prima en riesgo. Quien no tiene pólizas no puede estar abandonándolas.
    abandono: (a, b) => {
      const ca = c(a), cb = c(b);
      const riesgo = (x) => (x.polizas > 0 && x.actividad === 0) ? 1 : 0;
      return riesgo(cb) - riesgo(ca) || cb.prima - ca.prima;
    },
  };
  return lista.sort(criterios[clave] || criterios.prima);
}

/* Un solo punto de repintado y de enganche, como en Clientes. La cartera de
   cada agente sale de `v_resumen_agente`; si todavía no está cargada, la lista
   se pinta igual —con ceros en la columna Cartera— y se repinta al llegar, en
   vez de dejar la sección en blanco esperando. */
function repintarAgentes() {
  const main = $('#pdMain');
  if (!main) return;
  main.innerHTML = SECCIONES_DIRECTOR.agentes();
  activarGestionAgentes();
  const sel = $('#agOrden');
  if (sel) sel.addEventListener('change', () => { ORDEN_AGENTES = sel.value; repintarAgentes(); });

  if (!EQUIPO.cargado && window.sbClient) cargarEquipo().then(repintarAgentes);
}

/* ===========================================================================
   23. Cuenta — cambiar correo de acceso, contraseña y datos propios

   Hay DOS correos y confundirlos es lo más fácil del mundo:
     · el de Supabase Auth  → la credencial con la que entras
     · `usuarios.email`     → un dato de contacto que se muestra en el panel
   Cambiar uno no cambia el otro, y la pantalla lo dice explícitamente.
   =========================================================================== */

let CORREO_ACCESO = '';

async function cargarCorreoAcceso() {
  if (!window.sbClient) return;
  try {
    const { data } = await sbClient.auth.getUser();
    CORREO_ACCESO = (data && data.user && data.user.email) || '';
  } catch (e) { console.warn('No se pudo leer el correo de acceso:', e.message); }
}

/* Supabase deja cambiar contraseña con solo tener la sesión abierta. Eso
   significa que una sesión olvidada en una computadora ajena basta para
   quedarse con la cuenta. Se exige la contraseña actual, y la única forma de
   comprobarla es intentar iniciar sesión con ella: si falla, no se toca nada.
   Un intento fallido no cierra la sesión que ya estaba abierta. */
async function confirmarPasswordActual(actual) {
  const { error } = await sbClient.auth.signInWithPassword({
    email: CORREO_ACCESO, password: actual,
  });
  if (error) throw new Error('La contraseña actual no es correcta.');
}

/* Campo de contraseña con el botón de ojo. Usa el mismo `.pass-wrap` y el
   mismo `togglePassword()` que el modal de acceso, para que se comporte igual
   en todo el sitio en vez de tener dos implementaciones que se separan. */
function campoPassword(id, etiqueta, autocomplete, nota) {
  return `
    <div class="form-group">
      <label class="form-label" for="${id}">${etiqueta}</label>
      <div class="pass-wrap">
        <input class="form-input" id="${id}" type="password" autocomplete="${autocomplete}" />
        <button type="button" class="pass-toggle" aria-label="Mostrar contraseña"
                onclick="togglePassword(this)"><i class="fas fa-eye"></i></button>
      </div>
      ${nota ? `<p class="modal-texto imp-nota">${nota}</p>` : ''}
    </div>`;
}

function modalCuenta(id, titulo, cuerpo, textoBoton) {
  const viejo = $('#' + id);
  if (viejo) viejo.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="${id}">
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">${titulo}</h3>
          <button class="modal-close" onclick="closeModal('${id}')"><i class="fas fa-times"></i></button>
        </div>
        ${cuerpo}
        <div class="modal-acciones">
          <button class="btn btn-ghost btn-sm" onclick="closeModal('${id}')">Cancelar</button>
          <button class="btn btn-acento btn-sm" id="${id}Ok">${textoBoton}</button>
        </div>
        <div id="${id}Aviso"></div>
      </div>
    </div>`);
  openModal(id);
}

function abrirCambioPassword() {
  modalCuenta('modalPass', 'Cambiar contraseña', `
    ${campoPassword('passActual', 'Contraseña actual', 'current-password')}
    ${campoPassword('passNueva', 'Contraseña nueva', 'new-password',
      'Mínimo 8 caracteres. Guárdala en tu gestor de contraseñas: si la pierdes, ' +
      'la recuperación va por correo y depende de que el correo de acceso sea una bandeja real.')}
    ${campoPassword('passRepite', 'Repite la nueva', 'new-password')}`, 'Cambiar contraseña');

  $('#modalPassOk').addEventListener('click', async () => {
    const aviso = $('#modalPassAviso');
    const actual = $('#passActual').value;
    const nueva  = $('#passNueva').value;
    const repite = $('#passRepite').value;
    const fallar = (m) => { aviso.innerHTML = `<p class="imp-error">${esc(m)}</p>`; };

    if (!actual)              return fallar('Escribe tu contraseña actual.');
    if (nueva.length < 8)     return fallar('La nueva debe tener al menos 8 caracteres.');
    if (nueva !== repite)     return fallar('Las dos contraseñas nuevas no coinciden.');
    if (nueva === actual)     return fallar('La nueva es igual a la actual.');
    if (!window.sbClient)     return fallar('Sin conexión a la base.');

    const btn = $('#modalPassOk');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cambiando…';
    aviso.innerHTML = '';
    try {
      await confirmarPasswordActual(actual);
      const { error } = await sbClient.auth.updateUser({ password: nueva });
      if (error) throw error;
      aviso.innerHTML = '<p class="imp-ok"><i class="fas fa-circle-check"></i> Listo. La próxima vez entra con la nueva.</p>';
      btn.remove();
      setTimeout(() => closeModal('modalPass'), 2200);
    } catch (e) {
      btn.disabled = false;
      btn.innerHTML = 'Cambiar contraseña';
      fallar(e.message || 'No se pudo cambiar.');
    }
  });
}

function abrirCambioCorreo() {
  modalCuenta('modalCorreo', 'Cambiar correo de acceso', `
    <p class="modal-texto">Hoy entras con <b>${esc(CORREO_ACCESO || '—')}</b>.</p>
    <div class="form-group">
      <label class="form-label" for="mailNuevo">Correo nuevo</label>
      <input class="form-input" id="mailNuevo" type="email" autocomplete="email" />
    </div>
    ${campoPassword('mailPass', 'Tu contraseña actual', 'current-password')}
    <p class="modal-texto imp-nota">
      <b>Ojo:</b> se manda un enlace de confirmación al correo nuevo y el
      cambio <b>no surte efecto</b> hasta que lo abras. Si pones una dirección
      que no existe, el enlace no llega y te quedas con la de siempre — no te
      quedas fuera, pero tampoco cambia nada.
    </p>`, 'Enviar confirmación');

  $('#modalCorreoOk').addEventListener('click', async () => {
    const aviso = $('#modalCorreoAviso');
    const nuevo = $('#mailNuevo').value.trim();
    const pass  = $('#mailPass').value;
    const fallar = (m) => { aviso.innerHTML = `<p class="imp-error">${esc(m)}</p>`; };

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nuevo)) return fallar('Ese correo no tiene forma válida.');
    if (nuevo.toLowerCase() === String(CORREO_ACCESO).toLowerCase()) return fallar('Es el mismo que ya usas.');
    if (!pass)            return fallar('Escribe tu contraseña actual.');
    if (!window.sbClient) return fallar('Sin conexión a la base.');

    const btn = $('#modalCorreoOk');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando…';
    aviso.innerHTML = '';
    try {
      await confirmarPasswordActual(pass);
      const { error } = await sbClient.auth.updateUser({ email: nuevo });
      if (error) throw error;
      aviso.innerHTML = `<p class="imp-ok"><i class="fas fa-circle-check"></i>
        Te mandamos un enlace a <b>${esc(nuevo)}</b>. Ábrelo para que el cambio
        surta efecto; mientras tanto sigue entrando con el correo de siempre.</p>`;
      btn.remove();
    } catch (e) {
      btn.disabled = false;
      btn.innerHTML = 'Enviar confirmación';
      fallar(e.message || 'No se pudo cambiar.');
    }
  });
}

function activarConfig() {
  const btn = $('#cfgGuardarDatos');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const aviso = $('#cfgAvisoDatos');
    const nombre = $('#cfgNombre').value.trim();
    if (!nombre) { aviso.innerHTML = '<p class="imp-error">El nombre no puede quedar vacío.</p>'; return; }
    if (!window.sbClient || !MI_USUARIO_ID) {
      aviso.innerHTML = '<p class="imp-error">Sin sesión con la base.</p>'; return;
    }
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';
    try {
      const parche = {
        nombre,
        email: $('#cfgEmail').value.trim() || null,
        telefono: $('#cfgTel').value.trim() || null,
      };
      const { error } = await sbClient.from('usuarios').update(parche).eq('id', MI_USUARIO_ID);
      if (error) throw error;
      MI_USUARIO = Object.assign({}, MI_USUARIO, parche);
      $('#pdQuien').innerHTML = `<b>${esc(nombre)}</b>`;
      aviso.innerHTML = '<p class="imp-ok"><i class="fas fa-circle-check"></i> Guardado.</p>';
    } catch (e) {
      aviso.innerHTML = `<p class="imp-error">No se pudo guardar: ${esc(e.message || 'error')}</p>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Guardar';
    }
  });
}

/* ===========================================================================
   24. Afiliación — sobre qué se cobra

   No hay tabla de pagos y el precio todavía no está definido (ver §18 de
   CLAUDE.md), así que esta sección NO inventa importes. Cuenta lo único que
   nadie puede reconstruir después: cuántos días estuvo publicado cada agente.
   Ese número sale de `susp_history`, que el trigger `agentes_suspension`
   ahora sí llena.
   =========================================================================== */

const AFILIACION = { filas: [], cargado: false, error: '' };

/* Sin importes a propósito. Ponerle precio a un plan aquí sería inventarlo:
   el esquema de cobro se define con el Director antes de salir de beta. */
const PLANES = [
  { clave: 'beta',      txt: 'Beta — sin costo' },
  { clave: 'mensual',   txt: 'Mensual' },
  { clave: 'anual',     txt: 'Anual' },
  { clave: 'cortesia',  txt: 'Cortesía' },
];

async function cargarAfiliacion() {
  if (!window.sbClient) { AFILIACION.error = 'Sin conexión a la base.'; AFILIACION.cargado = true; return; }
  try {
    // De la tabla y no de la vista pública: `plan`, `susp_history` y
    // `created_at` no se exponen ahí, y con razón.
    const { data, error } = await sbClient.from('agentes')
      .select('id, nombre, plan, activo, hidden, suspended, suspended_from, susp_history, created_at')
      .order('nombre');
    if (error) throw error;
    AFILIACION.filas = data || [];
    AFILIACION.error = '';
  } catch (e) {
    AFILIACION.error = e.message || 'No se pudo leer la afiliación.';
    console.warn('Afiliación:', e);
  }
  AFILIACION.cargado = true;
}

/* Días suspendido dentro del mes en curso. Los rangos de `susp_history` pueden
   venir de meses anteriores o seguir abiertos, así que cada uno se recorta
   contra los límites del mes antes de contarlo. */
function diasSuspendidoEnMes(agente, inicioMes, hoy) {
  const rangos = Array.isArray(agente.susp_history) ? agente.susp_history.slice() : [];
  // Una suspensión en curso puede no estar todavía en el historial si viene de
  // antes del trigger; se toma de `suspended_from` para no perderla.
  if (agente.suspended && agente.suspended_from &&
      !rangos.some((r) => r.desde === agente.suspended_from && !r.hasta)) {
    rangos.push({ desde: agente.suspended_from });
  }
  let dias = 0;
  rangos.forEach((r) => {
    if (!r.desde) return;
    const desde = new Date(r.desde + 'T00:00:00');
    const hasta = r.hasta ? new Date(r.hasta + 'T00:00:00') : hoy;
    const a = desde > inicioMes ? desde : inicioMes;
    const b = hasta < hoy ? hasta : hoy;
    if (b >= a) dias += Math.round((b - a) / 86400000) + 1;
  });
  return dias;
}

function activarAfiliacion() {
  $$('.afil-plan').forEach((sel) => sel.addEventListener('change', async () => {
    const aviso = $('#afilAviso');
    const id = sel.dataset.agenteId;
    const previo = AFILIACION.filas.find((f) => f.id === id);
    if (!window.sbClient) { aviso.innerHTML = '<p class="imp-error">Sin conexión.</p>'; return; }
    sel.disabled = true;
    try {
      const { error } = await sbClient.from('agentes').update({ plan: sel.value }).eq('id', id);
      if (error) throw error;
      if (previo) previo.plan = sel.value;
      aviso.innerHTML = `<p class="imp-ok"><i class="fas fa-circle-check"></i>
        Plan actualizado para ${esc(previo ? previo.nombre : 'el agente')}.</p>`;
    } catch (e) {
      if (previo) sel.value = previo.plan || 'beta';
      aviso.innerHTML = `<p class="imp-error">No se pudo guardar: ${esc(e.message || 'error')}</p>`;
    } finally {
      sel.disabled = false;
    }
  }));
}

/* ===========================================================================
   25. Alta de agente

   Crear la cuenta de acceso necesita una llave de servidor que jamás debe
   viajar al navegador, así que eso no se puede hacer desde aquí. Lo que sí se
   puede —y es casi todo— es dejar la ficha completa: la fila en `usuarios`, la
   de `agentes` y sus ramos. Después se crea el acceso y se vincula, igual que
   se hizo con la cuenta del propio Director.

   El paso que falta se explica en pantalla al terminar, con el correo ya
   escrito, en vez de dejar al Director adivinando por qué su agente no entra.
   =========================================================================== */

const slugify = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);

function abrirAltaAgente() {
  const viejo = $('#modalAlta');
  if (viejo) viejo.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="modalAlta">
      <div class="modal modal-ancho">
        <div class="modal-header">
          <h3 class="modal-title">Agregar agente</h3>
          <button class="modal-close" onclick="closeModal('modalAlta')"><i class="fas fa-times"></i></button>
        </div>
        <div class="form-group">
          <label class="form-label" for="altaNombre">Nombre completo *</label>
          <input class="form-input" id="altaNombre" autocomplete="off" />
        </div>
        <div class="imp-mapeo">
          <div class="form-group">
            <label class="form-label" for="altaCorreo">Correo *</label>
            <input class="form-input" id="altaCorreo" type="email" autocomplete="off" />
            <p class="modal-texto imp-nota">Será también su usuario para entrar.</p>
          </div>
          <div class="form-group">
            <label class="form-label" for="altaWa">WhatsApp</label>
            <input class="form-input" id="altaWa" placeholder="+52..." />
          </div>
          <div class="form-group">
            <label class="form-label" for="altaCedula">Cédula CNSF</label>
            <input class="form-input" id="altaCedula" placeholder="A1-000000" />
          </div>
          <div class="form-group">
            <label class="form-label" for="altaZona">Zona</label>
            <input class="form-input" id="altaZona" list="altaZonas" />
            <datalist id="altaZonas">
              ${(CONFIG.ZONAS || []).map((z) => `<option value="${esc(z)}"></option>`).join('')}
            </datalist>
          </div>
          <div class="form-group">
            <label class="form-label" for="altaExp">Años de experiencia</label>
            <input class="form-input" id="altaExp" type="number" min="0" max="60" value="0" />
          </div>
          <div class="form-group">
            <label class="form-label" for="altaPlan">Plan</label>
            <select class="form-input" id="altaPlan">
              ${PLANES.map((p) => `<option value="${p.clave}">${p.txt}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Ramos que maneja</label>
          <div class="act-chips" id="altaRamos">
            ${Object.entries(RAMOS).map(([k, v]) =>
              `<button type="button" class="chip-tipo" data-ramo="${k}">${esc(v.label)}</button>`).join('')}
          </div>
        </div>
        <div class="modal-acciones">
          <button class="btn btn-ghost btn-sm" onclick="closeModal('modalAlta')">Cancelar</button>
          <button class="btn btn-acento btn-sm" id="altaGuardar">
            <i class="fas fa-user-plus"></i> Crear agente
          </button>
        </div>
        <div id="altaAviso"></div>
      </div>
    </div>`);

  $$('#altaRamos .chip-tipo').forEach((c) => c.addEventListener('click', () => c.classList.toggle('activo')));
  $('#altaGuardar').addEventListener('click', guardarAltaAgente);
  openModal('modalAlta');
  $('#altaNombre').focus();
}

async function guardarAltaAgente() {
  const aviso = $('#altaAviso');
  const fallar = (m) => { aviso.innerHTML = `<p class="imp-error">${esc(m)}</p>`; };
  const nombre = $('#altaNombre').value.trim();
  const correo = $('#altaCorreo').value.trim();

  if (!nombre) return fallar('El nombre es obligatorio.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return fallar('Escribe un correo válido.');
  if (!window.sbClient || !MI_USUARIO_ID) return fallar('Sin sesión con la base.');

  const ramos = $$('#altaRamos .chip-tipo.activo').map((c) => c.dataset.ramo);
  const btn = $('#altaGuardar');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando…';
  aviso.innerHTML = '';

  let usuarioId = null;
  try {
    // 1 · la persona
    const { data: u, error: eU } = await sbClient.from('usuarios').insert({
      nombre, email: correo, telefono: $('#altaWa').value.trim() || null,
      rol: 'agente', director_id: MI_USUARIO_ID,
    }).select('id').single();
    if (eU) throw eU;
    usuarioId = u.id;

    // 2 · su ficha pública. El slug se hace único a mano porque la columna
    //     lleva `unique` y dos "Juan Pérez" tumbarían el alta.
    let slug = slugify(nombre);
    if (AGENTES.some((a) => a.slug === slug)) slug = `${slug}-${String(Date.now()).slice(-4)}`;

    const { data: ag, error: eA } = await sbClient.from('agentes').insert({
      slug, usuario_id: usuarioId, director_id: MI_USUARIO_ID,
      nombre, cedula: $('#altaCedula').value.trim() || null,
      zona: $('#altaZona').value.trim() || null,
      ciudad: CONFIG.CIUDAD,
      anios_experiencia: Number($('#altaExp').value) || 0,
      plan: $('#altaPlan').value,
      // Entra oculto: sin foto ni descripción, publicarlo de inmediato deja una
      // ficha vacía en el sitio. El Director lo muestra cuando esté completa.
      hidden: true, activo: true, disponible: false, verificado: false,
    }).select('id').single();
    if (eA) throw eA;

    if (ramos.length) {
      const { error: eR } = await sbClient.from('ramos_agente')
        .insert(ramos.map((r) => ({ agente_id: ag.id, ramo: r })));
      if (eR) throw eR;
    }

    await cargarAgentes();
    aviso.innerHTML = `
      <p class="imp-ok"><i class="fas fa-circle-check"></i>
        <b>${esc(nombre)}</b> quedó dado de alta y <b>oculto</b> del sitio
        público, para que no aparezca con la ficha vacía.</p>
      <div class="alta-pasos">
        <p class="modal-texto"><b>Falta un paso que no se puede hacer desde aquí:</b>
          crear su acceso. Requiere una llave de servidor que no debe viajar al
          navegador, así que se hace desde el panel de administración de la base:</p>
        <ol class="imp-lista">
          <li>Crea el usuario con el correo <b>${esc(correo)}</b> y una contraseña temporal.</li>
          <li>Marca la opción de confirmar el correo automáticamente.</li>
          <li>Corre esto para enlazarlo con su ficha:</li>
        </ol>
        <pre class="alta-sql">update public.usuarios
   set auth_user_id = (select id from auth.users where email = '${esc(correo)}')
 where id = '${esc(usuarioId)}';</pre>
        <button class="btn btn-ghost btn-sm" onclick="copiarSQLAlta(this)">
          <i class="fas fa-copy"></i> Copiar
        </button>
      </div>`;
    btn.remove();
    repintarAgentes();
  } catch (e) {
    // Si la ficha falló después de crear la persona, queda una fila suelta que
    // el Director no ve por ningún lado. Se limpia para no dejar basura.
    if (usuarioId) { try { await sbClient.from('usuarios').delete().eq('id', usuarioId); } catch (x) { /* queda huérfana */ } }
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-user-plus"></i> Crear agente';
    fallar(e.message && e.message.includes('duplicate')
      ? 'Ya hay alguien con ese correo o ese identificador.'
      : (e.message || 'No se pudo crear.'));
  }
}

function copiarSQLAlta(btn) {
  const sql = btn.parentElement.querySelector('.alta-sql').textContent;
  navigator.clipboard.writeText(sql)
    .then(() => { btn.innerHTML = '<i class="fas fa-check"></i> Copiado'; })
    .catch(() => showToast('No se pudo copiar. Selecciónalo a mano.'));
}

/* ===========================================================================
   26. Sesión visible desde el sitio público

   Desde el panel se puede volver al inicio con el logo, y la sesión sigue
   abierta — vive en localStorage, navegar no la toca. El problema era el
   regreso: el botón de cuenta abría el formulario de acceso aunque ya
   estuvieras dentro, y parecía que te habían sacado.

   Aquí se reapunta ese botón al panel que te toca por rol. Es solo comodidad:
   quien de verdad protege los paneles es `guardPanel()` y, detrás, el RLS.
   =========================================================================== */
async function reflejarSesionEnPublico() {
  // En los paneles no aplica: ahí el botón es "Salir".
  if (!window.sbClient || $('#pdMain') || $('#paMain')) return;

  // El botón de la barra y el de "Cuenta" del menú inferior llevan el onclick
  // en línea en las 9 páginas públicas. Se buscan por ese atributo en vez de
  // marcar cada archivo a mano; se descarta la X del propio modal, que también
  // lo menciona.
  const accesos = $$('.login-key, [onclick*="loginModal"]')
    .filter((el) => !/closeModal/.test(el.getAttribute('onclick') || ''));
  if (!accesos.length) return;

  try {
    const { data: s } = await sbClient.auth.getSession();
    if (!s || !s.session) return;

    const { data: usuario } = await sbClient
      .from('usuarios').select('rol, nombre, activo')
      .eq('auth_user_id', s.session.user.id).maybeSingle();
    if (!usuario || !usuario.activo) return;

    const destino = RUTA_INICIO[usuario.rol] || 'index.html';
    const etiqueta = `Volver a mi panel (${esc(usuario.nombre || '')})`.trim();

    accesos.forEach((el) => {
      // Sustituye el onclick en línea que abre el modal de acceso.
      el.onclick = (ev) => { ev.preventDefault(); location.href = destino; };
      el.setAttribute('title', etiqueta);
      el.setAttribute('aria-label', etiqueta);
      el.classList.add('con-sesion');
      const icono = el.querySelector('i');
      if (icono) icono.className = 'fas fa-gauge-high';
      const texto = el.querySelector('span');
      if (texto) texto.textContent = 'Mi panel';
    });
  } catch (e) {
    // Sin sesión legible se deja el botón como estaba: pedir acceso.
    console.warn('No se pudo leer la sesión:', e.message);
  }
}

/* ===========================================================================
   27. Panel del Agente — datos reales

   Mismo trabajo que se hizo del lado del Director: el panel leía `CITAS_DEMO`,
   un arreglo escrito a mano, y ningún formulario guardaba. El RLS ya filtra
   todo a lo propio, así que ninguna consulta necesita pasar el id del agente.
   =========================================================================== */

let MIS_CITAS = [];
let MI_AGENDA = [];
let MIS_RESENAS = [];
let DATOS_REALES_AGENTE = false;

async function cargarDatosAgente(sesion) {
  if (!window.sbClient || (sesion && sesion.demo) || !YO_AGENTE || !YO_AGENTE.id) return;
  const desde = hoyISO();
  try {
    const [citas, disp, resenas] = await Promise.all([
      sbClient.from('citas')
        .select('id, cliente_nombre, cliente_whatsapp, modalidad, lugar, ramo_interes, fecha, hora, estado, mensaje')
        .order('fecha', { ascending: false }),
      sbClient.from('disponibilidad')
        .select('id, fecha, hora_ini, disponible')
        .gte('fecha', desde),
      // El RLS deja al agente ver las de su equipo; se filtran a las suyas.
      sbClient.from('resenas')
        .select('id, agente_id, autor, calificacion, texto, aprobada, rechazada, created_at')
        .eq('agente_id', YO_AGENTE.id)
        .order('created_at', { ascending: false }),
    ]);
    if (citas.error)   throw citas.error;
    if (disp.error)    throw disp.error;
    if (resenas.error) throw resenas.error;

    MIS_CITAS = (citas.data || []).map((c) => ({
      id: c.id, cliente: c.cliente_nombre, wa: c.cliente_whatsapp,
      modalidad: c.modalidad, lugar: c.lugar, ramo: c.ramo_interes,
      fecha: String(c.fecha).slice(0, 10), hora: String(c.hora || '').slice(0, 5),
      estado: c.estado, mensaje: c.mensaje || '',
      agente: YO_AGENTE.slug,
    }));
    MI_AGENDA = disp.data || [];
    MIS_RESENAS = resenas.data || [];
    DATOS_REALES_AGENTE = true;
  } catch (e) {
    console.warn('No se pudo leer la agenda del agente:', e.message);
  }
}

/* Con base conectada, lo real; sin ella, el respaldo demo para poder navegar. */
const misCitasDeHoy = () => DATOS_REALES_AGENTE
  ? MIS_CITAS
  : CITAS_DEMO.filter((c) => c.agente === (YO_AGENTE || {}).slug);

/* ── Confirmar y cancelar ────────────────────────────────────────────────── */
async function cambiarEstadoCita(id, estado, boton) {
  if (!window.sbClient || !DATOS_REALES_AGENTE) { showToast('En modo demostración no se guarda.'); return; }
  const fila = boton.closest('.cita-item, li');
  boton.disabled = true;
  try {
    const { error } = await sbClient.from('citas').update({ estado }).eq('id', id);
    if (error) throw error;
    const c = MIS_CITAS.find((x) => x.id === id);
    if (c) c.estado = estado;
    const main = $('#paMain');
    if (main) { main.innerHTML = SECCIONES_AGENTE.citas(); activarPanelAgente('citas'); }
    showToast({
      confirmada: 'Cita confirmada. El cliente ya cuenta contigo.',
      cancelada:  'Cita cancelada.',
      completada: 'Marcada como atendida.',
      no_asistio: 'Marcada como que no llegó.',
    }[estado] || 'Actualizada.');
  } catch (e) {
    boton.disabled = false;
    if (fila) fila.style.opacity = '1';
    showToast('No se pudo guardar: ' + (e.message || 'error'));
  }
}

/* ── Toggle de disponibilidad ────────────────────────────────────────────── */
async function guardarDisponible(valor) {
  if (!window.sbClient || !YO_AGENTE || !YO_AGENTE.id || !DATOS_REALES_AGENTE) return true;
  try {
    // `disponible` no está en la lista de campos protegidos del trigger, así
    // que el agente sí puede moverlo — es justo lo que más toca en el día.
    const { error } = await sbClient.from('agentes')
      .update({ disponible: valor }).eq('id', YO_AGENTE.id);
    if (error) throw error;
    YO_AGENTE.disponible = valor;
    return true;
  } catch (e) {
    showToast('No se pudo cambiar tu disponibilidad: ' + (e.message || 'error'));
    return false;
  }
}

/* ── Agenda semanal ──────────────────────────────────────────────────────── */
const HORAS_AGENDA = ['09:00', '10:00', '11:00', '12:00', '13:00', '16:00', '17:00', '18:00'];
let SEMANA_OFFSET = 0;   // 0 = esta semana

/* Lunes a sábado de la semana pedida. El domingo se deja fuera a propósito:
   no aparecía en la rejilla original y nadie pidió abrirlo. */
function diasDeLaSemana(offset) {
  const hoy = new Date();
  const lunes = new Date(hoy);
  // getDay(): 0 es domingo. Se recula al lunes de esta semana.
  lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7) + offset * 7);
  const nombres = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  return nombres.map((dia, i) => {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + i);
    return { dia, num: d.getDate(), iso: fechaISO(d) };
  });
}

function rotuloSemana(dias) {
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const a = new Date(dias[0].iso + 'T00:00:00');
  const b = new Date(dias[dias.length - 1].iso + 'T00:00:00');
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} – ${b.getDate()} de ${MES[a.getMonth()]}`
    : `${a.getDate()} ${MES[a.getMonth()]} – ${b.getDate()} ${MES[b.getMonth()]}`;
}

function activarAgenda() {
  const repintar = () => {
    const main = $('#paMain');
    if (!main) return;
    main.innerHTML = SECCIONES_AGENTE.agenda();
    activarAgenda();
  };

  $$('[data-semana]').forEach((b) => b.addEventListener('click', () => {
    SEMANA_OFFSET = Math.max(0, SEMANA_OFFSET + Number(b.dataset.semana));
    repintar();
  }));

  $$('.semana-celda:not([disabled])').forEach((c) => c.addEventListener('click', async () => {
    const { fecha, hora } = c.dataset;
    const abrir = !c.classList.contains('abierto');
    // Las dos clases se manejan juntas: `abierto` pinta el relleno naranja y
    // `cerrado` dibuja la X. Alternando solo la primera, una casilla recién
    // cerrada se quedaba sin ninguna y no mostraba la X.
    const pintar = (estaAbierta) => {
      c.classList.toggle('abierto', estaAbierta);
      c.classList.toggle('cerrado', !estaAbierta);
      c.title = estaAbierta ? 'Abierto — toca para cerrar' : 'Cerrado — toca para abrir';
    };
    // Se pinta primero: la rejilla se toca muchas veces seguidas y esperar al
    // servidor en cada casilla la haría sentir trabada.
    pintar(abrir);
    if (!(await guardarFranja(fecha, hora, abrir))) pintar(!abrir);
  }));

  const btn = $('#paBloquear');
  if (btn) btn.addEventListener('click', async () => {
    const aviso = $('#paAgendaAviso');
    const fecha = $('#paBloqueo').value;
    if (!fecha) { showToast('Elige la fecha que quieres bloquear.'); return; }
    btn.disabled = true;
    const ok = await Promise.all(HORAS_AGENDA.map((h) => guardarFranja(fecha, h, false)));
    btn.disabled = false;
    if (ok.every(Boolean)) {
      showToast('Día bloqueado. No vas a recibir citas ese día.');
      repintar();
    } else if (aviso) {
      aviso.innerHTML = '<p class="imp-error">Algunos horarios no se pudieron cerrar.</p>';
    }
  });
}

/* Un upsert por franja. La tabla tiene unique(agente_id, fecha, hora_ini), que
   es justo la llave de conflicto: tocar dos veces la misma casilla actualiza
   la fila en vez de crear una segunda. */
async function guardarFranja(fecha, hora, disponible) {
  if (!window.sbClient || !DATOS_REALES_AGENTE || !YO_AGENTE || !YO_AGENTE.id) {
    showToast('En modo demostración no se guarda.');
    return false;
  }
  try {
    const { error } = await sbClient.from('disponibilidad').upsert({
      agente_id: YO_AGENTE.id, fecha, hora_ini: hora,
      hora_fin: sumarUnaHora(hora), disponible,
    }, { onConflict: 'agente_id,fecha,hora_ini' });
    if (error) throw error;
    const i = MI_AGENDA.findIndex((d) => d.fecha === fecha && String(d.hora_ini).slice(0, 5) === hora);
    if (i >= 0) MI_AGENDA[i].disponible = disponible;
    else MI_AGENDA.push({ fecha, hora_ini: hora, disponible });
    return true;
  } catch (e) {
    showToast('No se pudo guardar ese horario: ' + (e.message || 'error'));
    return false;
  }
}

/* `hora_fin > hora_ini` es un CHECK de la tabla, así que no puede quedar igual. */
const sumarUnaHora = (h) => String(Number(h.slice(0, 2)) + 1).padStart(2, '0') + ':' + h.slice(3);

/* ── Guardar el perfil ───────────────────────────────────────────────────────
   El trigger `trg_agente_campos_protegidos` revierte nombre, cédula, estado y
   plan aunque se manden. Eso está bien y no hay que rodearlo: por eso esos
   campos salen en pantalla como solo lectura y ni siquiera se envían.        */
function activarPerfilAgente() {
  const btn = $('#paGuardarPerfil');
  if (!btn) return;

  // El check pinta su etiqueta; sin esto el recuadro no cambia hasta repintar.
  $$('.check-ramo input').forEach((i) => i.addEventListener('change', () =>
    i.closest('.check-ramo').classList.toggle('activo', i.checked)));

  btn.addEventListener('click', async () => {
    const aviso = $('#paPerfilAviso');
    if (!window.sbClient || !DATOS_REALES_AGENTE || !YO_AGENTE || !YO_AGENTE.id) {
      aviso.innerHTML = '<p class="imp-error">En modo demostración no se guarda.</p>';
      return;
    }
    const ramos = $$('.check-ramo input[data-ramo]:checked').map((i) => i.dataset.ramo);
    const modalidades = $$('.check-ramo input[data-modalidad]:checked').map((i) => i.dataset.modalidad);
    if (!ramos.length) {
      aviso.innerHTML = '<p class="imp-error">Elige al menos un ramo, o no vas a aparecer en ninguna búsqueda.</p>';
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando…';
    aviso.innerHTML = '';
    try {
      const parche = {
        titulo: $('#pfTitulo').value.trim() || null,
        descripcion: $('#pfDesc').value.trim() || null,
        zona: $('#pfZona').value.trim() || null,
        whatsapp: $('#pfWa').value.replace(/[^\d+]/g, '') || null,
        modalidades,
      };
      const { error } = await sbClient.from('agentes').update(parche).eq('id', YO_AGENTE.id);
      if (error) throw error;

      // Los ramos viven en su propia tabla. Se reemplazan en bloque: calcular
      // altas y bajas por separado no aporta nada y deja más formas de fallar.
      const { error: eDel } = await sbClient.from('ramos_agente').delete().eq('agente_id', YO_AGENTE.id);
      if (eDel) throw eDel;
      if (ramos.length) {
        const { error: eIns } = await sbClient.from('ramos_agente')
          .insert(ramos.map((r) => ({ agente_id: YO_AGENTE.id, ramo: r })));
        if (eIns) throw eIns;
      }

      Object.assign(YO_AGENTE, parche, { ramos });
      await cargarAgentes();
      aviso.innerHTML = `<p class="imp-ok"><i class="fas fa-circle-check"></i>
        Guardado. Así te va a ver quien entre a
        <a href="perfil.html?a=${esc(YO_AGENTE.slug)}" target="_blank" rel="noopener">tu perfil</a>.</p>`;
    } catch (e) {
      aviso.innerHTML = `<p class="imp-error">No se pudo guardar: ${esc(e.message || 'error')}</p>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-floppy-disk"></i> Guardar cambios';
    }
  });
}

/* Un solo punto para enganchar lo que cada sección del agente necesita. */
function activarPanelAgente(sec) {
  if (sec === 'estadisticas') buildGraficasAgente();
  if (sec === 'agenda')    activarAgenda();
  if (sec === 'perfil')    activarPerfilAgente();
  if (sec === 'citas')     activarCitasAgente();
  if (sec === 'clientes')  activarClientes();
  if (sec === 'actividad') activarActividad();
  if (sec === 'cartera')   activarTabsCartera();
  if (sec === 'config')    activarConfig();
}

function activarCitasAgente() {
  $$('.tabs-bar .tab-btn').forEach((b) => b.addEventListener('click', () => {
    $$('.tabs-bar .tab-btn').forEach((x) => x.classList.toggle('activo', x === b));
    $$('.tab-panel').forEach((p) => p.classList.toggle('activo', p.id === 'tab-' + b.dataset.tab));
  }));
  $$('[data-cita-estado]').forEach((b) => b.addEventListener('click', () =>
    cambiarEstadoCita(b.dataset.citaId, b.dataset.citaEstado, b)));
}

/* ===========================================================================
   28. Mis resultados (panel del Agente)

   El equivalente del dashboard del Director, pero de lo propio. Todo sale de
   `MIS_CITAS`, `MIS_RESENAS` y `CARTERA`, o sea de la base.

   Lo que NO se grafica, a propósito: cuántas citas se volvieron cliente. El
   dato existiría en `clientes.cita_origen_id`, pero hoy nadie lo llena, así que
   cualquier número ahí sería inventado. Está anotado en docs/pendientes.md.
   =========================================================================== */

const GRAFICAS_AG = [];

SECCIONES_AGENTE.estadisticas = function () {
  // Hacen falta las dos: la cartera para prima y vencimientos, los clientes
  // para saber qué citas se convirtieron. Se piden juntas y se repinta al
  // llegar, en vez de mostrar la sección a medias.
  if (!CARTERA.cargado || !CLIENTES.cargado) {
    Promise.all([
      CARTERA.cargado ? null : cargarCartera(),
      CLIENTES.cargado ? null : cargarClientes(),
    ]).then(() => {
      const m = $('#paMain');
      if (m) { m.innerHTML = SECCIONES_AGENTE.estadisticas(); activarPanelAgente('estadisticas'); }
    });
    return '<p class="admin-vacio"><i class="fas fa-spinner fa-spin"></i> Cargando tus números…</p>';
  }

  const citas = misCitasDeHoy();
  const mes = hoyISO().slice(0, 7);
  const delMes = citas.filter((c) => c.fecha.slice(0, 7) === mes);

  // Tasa de cierre solo sobre las citas ya RESUELTAS. Meter las pendientes en
  // el denominador castiga al agente por citas que todavía no ha atendido.
  const resueltas = citas.filter((c) => ['completada', 'cancelada', 'no_asistio'].includes(c.estado));
  const cerradas = resueltas.filter((c) => c.estado === 'completada').length;
  const tasa = resueltas.length ? Math.round(cerradas / resueltas.length * 100) : null;

  const vivas = CARTERA.polizas.filter((p) => p.estatus === 'activa' || p.estatus === 'por_vencer');
  const prima = vivas.reduce((s, p) => s + Number(p.prima_anual || 0), 0);
  const comision = vivas.reduce((s, p) =>
    s + (p.comision_estimada !== undefined && p.comision_estimada !== null
      ? Number(p.comision_estimada)
      : Number(p.prima_anual || 0) * Number(p.comision_pct || 0) / 100), 0);

  const publicadas = DATOS_REALES_AGENTE ? MIS_RESENAS.filter((r) => r.aprobada) : [];

  // Conversión de cita a cliente. Sale de `clientes.cita_origen_id`, que se
  // llena al registrar un cliente desde una cita atendida. El denominador son
  // las citas COMPLETADAS: una que se canceló nunca tuvo oportunidad de
  // convertir, y meterla castigaría al agente por algo que no dependió de él.
  const atendidas = citas.filter((c) => c.estado === 'completada');
  const conCliente = CLIENTES.cargado
    ? new Set(CLIENTES.filas.map((c) => c.cita_origen_id).filter(Boolean))
    : null;
  const convertidas = conCliente
    ? atendidas.filter((c) => conCliente.has(c.id)).length : null;
  const conversion = (convertidas !== null && atendidas.length)
    ? Math.round(convertidas / atendidas.length * 100) : null;

  return `
    <h1 class="admin-page-title">Mis resultados</h1>
    <p class="admin-page-sub">Cómo vas, con tus números reales</p>

    <div class="kpi-grid">
      ${kpi('fa-calendar-check', 'Citas este mes', delMes.length,
            `${citas.filter((c) => c.estado === 'pendiente').length} por confirmar`)}
      ${kpi('fa-bullseye', 'Citas que cerraste',
            tasa === null ? '—' : tasa + '%',
            tasa === null ? 'aún sin citas resueltas' : `${cerradas} de ${resueltas.length} atendidas`)}
      ${kpi('fa-handshake', 'Citas que se volvieron cliente',
            conversion === null ? '—' : conversion + '%',
            conCliente === null ? 'abre Mis clientes para calcularlo'
              : atendidas.length ? `${convertidas} de ${atendidas.length} atendidas`
              : 'aún sin citas atendidas')}
      ${kpi('fa-file-contract', 'Pólizas vigentes', vivas.length, `${CARTERA.polizas.length} en total`)}
      ${kpi('fa-coins', 'Prima bajo gestión', money(prima), 'anual, de las vigentes')}
      ${kpi('fa-hand-holding-dollar', 'Tu comisión', money(comision), 'estimada sobre esa prima')}
      ${kpi('fa-star', 'Tu calificación',
            Number(YO_AGENTE.calificacion || 0).toFixed(1),
            `${publicadas.length} reseña${publicadas.length === 1 ? '' : 's'} publicada${publicadas.length === 1 ? '' : 's'}`)}
    </div>

    <div class="graficas-grid">
      <section class="admin-card grafica-card">
        <h2>Tus citas por mes</h2>
        <p class="grafica-sub">Últimos 6 meses</p>
        <div class="grafica-lienzo"><canvas id="agCitasMes"></canvas></div>
      </section>

      <section class="admin-card grafica-card">
        <h2>En qué acabaron</h2>
        <p class="grafica-sub">Todas tus citas</p>
        <div class="grafica-lienzo"><canvas id="agEstados"></canvas></div>
      </section>

      <section class="admin-card grafica-card">
        <h2>De dónde viene tu cartera</h2>
        <p class="grafica-sub">Prima anual por ramo</p>
        <div class="grafica-lienzo"><canvas id="agRamos"></canvas></div>
      </section>

      <section class="admin-card grafica-card">
        <h2>Lo que tienes por renovar</h2>
        <p class="grafica-sub">Prima que vence en los próximos 6 meses</p>
        <div class="grafica-lienzo"><canvas id="agVencen"></canvas></div>
      </section>
    </div>

    <p class="admin-nota"><i class="fas fa-circle-info"></i>
      «Citas que cerraste» cuenta solo las ya atendidas: las que están por
      confirmar no cuentan en contra. La comisión es una estimación sobre la
      prima anual con el porcentaje de cada póliza, no lo ya cobrado.
      «Lo que tienes por renovar» es el trabajo que ya tienes ganado si le das
      seguimiento a tiempo.</p>

    <p class="admin-nota"><i class="fas fa-handshake"></i>
      <b>«Citas que se volvieron cliente»</b> se llena cuando registras a alguien
      desde una cita atendida —el botón «Registrar como cliente»—. Es el número
      que dice si las citas que te llegan realmente se convierten en negocio, así
      que vale la pena registrarlos desde ahí y no como cliente suelto.</p>`;
};

function buildGraficasAgente() {
  while (GRAFICAS_AG.length) { try { GRAFICAS_AG.pop().destroy(); } catch (e) { /* ya no existía */ } }

  const lienzos = ['agCitasMes', 'agEstados', 'agRamos', 'agVencen'].map((id) => $('#' + id));
  if (!lienzos[0]) return;

  if (typeof Chart === 'undefined') {
    lienzos.forEach((c) => c && c.parentElement.replaceChildren(
      Object.assign(document.createElement('p'), {
        className: 'admin-vacio',
        textContent: 'No se pudo cargar Chart.js. Revisa la conexión.',
      })));
    return;
  }

  const azul    = tokenColor('--vaxti-azul', '#00224f');
  const naranja = tokenColor('--vaxti-naranja', '#fe6031');
  const tinta   = tokenColor('--t2', '#5a6478');
  const citas   = misCitasDeHoy();
  const vivas   = CARTERA.polizas.filter((p) => p.estatus === 'activa' || p.estatus === 'por_vencer');

  const vacio = (canvas, msg) => canvas.parentElement.replaceChildren(
    Object.assign(document.createElement('p'), { className: 'admin-vacio', textContent: msg }));

  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  /* 1 · citas por mes, con los meses en cero incluidos */
  const hoy = new Date();
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    meses.push({ clave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, txt: MES[d.getMonth()] });
  }
  GRAFICAS_AG.push(new Chart(lienzos[0], {
    type: 'line',
    data: {
      labels: meses.map((m) => m.txt),
      datasets: [{
        data: meses.map((m) => citas.filter((c) => c.fecha.slice(0, 7) === m.clave).length),
        borderColor: naranja, backgroundColor: 'rgba(254,96,49,.10)',
        fill: true, tension: .35, pointBackgroundColor: naranja, pointRadius: 4,
      }],
    },
    options: ejesSobrios(tinta),
  }));

  /* 2 · en qué acabaron */
  const porEstado = {};
  citas.forEach((c) => { porEstado[c.estado] = (porEstado[c.estado] || 0) + 1; });
  const estados = Object.keys(porEstado);
  if (!estados.length) vacio(lienzos[1], 'Todavía no tienes citas.');
  else GRAFICAS_AG.push(new Chart(lienzos[1], {
    type: 'doughnut',
    data: {
      labels: estados.map((e) => (ETIQUETA_ESTADO[e] || { txt: e }).txt),
      datasets: [{
        data: estados.map((e) => porEstado[e]),
        backgroundColor: [naranja, azul, '#4caf82', '#8892a4', '#e05252'],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '62%',
      plugins: { legend: { position: 'bottom', labels: { color: tinta, font: { size: 11 }, boxWidth: 12 } } },
    },
  }));

  /* 3 · prima por ramo. Se grafica dinero y no número de pólizas: tres pólizas
         de auto pueden valer menos que una empresarial. */
  const porRamo = {};
  vivas.forEach((p) => {
    porRamo[p.ramo] = (porRamo[p.ramo] || 0) + Number(p.prima_anual || 0);
  });
  const ramos = Object.keys(porRamo).sort((a, b) => porRamo[b] - porRamo[a]);
  if (!ramos.length) vacio(lienzos[2], 'Sin pólizas todavía. Cárgalas en Mi cartera.');
  else GRAFICAS_AG.push(new Chart(lienzos[2], {
    type: 'bar',
    data: {
      labels: ramos.map((r) => (RAMOS[r] || {}).label || r),
      datasets: [{ data: ramos.map((r) => porRamo[r]), backgroundColor: azul, borderRadius: 4, barThickness: 18 }],
    },
    options: { ...ejesSobrios(tinta), indexAxis: 'y' },
  }));

  /* 4 · vencimientos de los próximos 6 meses, en dinero */
  const proximos = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
    proximos.push({ clave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, txt: MES[d.getMonth()] });
  }
  const montos = proximos.map((m) => vivas
    .filter((p) => String(p.fecha_vencimiento || '').slice(0, 7) === m.clave)
    .reduce((s, p) => s + Number(p.prima_anual || 0), 0));
  if (!montos.some((x) => x > 0)) vacio(lienzos[3], 'Nada vence en los próximos 6 meses.');
  else GRAFICAS_AG.push(new Chart(lienzos[3], {
    type: 'bar',
    data: {
      labels: proximos.map((m) => m.txt),
      datasets: [{ data: montos, backgroundColor: naranja, borderRadius: 4 }],
    },
    options: ejesSobrios(tinta),
  }));
}

/* ===========================================================================
   29. Disponibilidad real en el sitio público

   El calendario del perfil generaba los próximos 10 días con una regla escrita
   a mano («sábado con agenda reducida») e ignoraba por completo la tabla
   `disponibilidad`. El agente podía cerrar toda su semana en el panel y el
   cliente le seguía agendando igual: las dos mitades funcionaban por separado.

   Contrato de la tabla: una fila = una hora, `hora_fin` = `hora_ini` + 1h.
   Ver db/99_seed_demo.sql, que siembra con esa misma forma.
   =========================================================================== */

/* Franjas abiertas del agente del perfil, por fecha: { '2026-08-03': ['09:00', …] } */
let AGENDA_PERFIL = null;   // null = no se pudo consultar todavía

async function cargarAgendaDelPerfil(agenteId) {
  AGENDA_PERFIL = null;
  if (!window.sbClient || !agenteId) return;
  try {
    const { data, error } = await sbClient
      .from('disponibilidad')
      .select('fecha, hora_ini, disponible')
      .eq('agente_id', agenteId)
      .eq('disponible', true)
      .gte('fecha', hoyISO())
      .order('fecha');
    if (error) throw error;
    const porFecha = {};
    (data || []).forEach((d) => {
      const f = String(d.fecha).slice(0, 10);
      (porFecha[f] = porFecha[f] || []).push(String(d.hora_ini).slice(0, 5));
    });
    Object.values(porFecha).forEach((hs) => hs.sort());
    AGENDA_PERFIL = porFecha;
  } catch (e) {
    // Con null, el calendario cae al comportamiento de antes en vez de dejar al
    // agente sin poder recibir citas por un error de red.
    console.warn('No se pudo leer la disponibilidad del agente:', e.message);
  }
}

const HORAS_LIBRES = (fecha) => (AGENDA_PERFIL && AGENDA_PERFIL[fecha]) || [];

/* ¿Este agente configuró su agenda? Si nunca la tocó, no se le puede castigar
   dejándolo sin citas: se muestran los días hábiles como antes. Pero si SÍ la
   configuró, se respeta al pie de la letra, incluidos los días que cerró. */
const AGENDA_CONFIGURADA = () => AGENDA_PERFIL !== null && Object.keys(AGENDA_PERFIL).length > 0;
