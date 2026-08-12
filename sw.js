/* ============================================================================
   sw.js — Service worker de Vaxti.

   Patrón tomado del proyecto de referencia, con tres cambios obligados aquí:

   1. RUTAS RELATIVAS. El sitio vive en https://pakogq.github.io/asegura-demo/,
      no en la raíz de un dominio. Un '/styles.css' apuntaría a la raíz de
      github.io y el install fallaría entero — `cache.addAll` es atómico: si un
      solo recurso da 404, no se cachea NINGUNO y el service worker no llega a
      instalarse. Todo va sin barra inicial y se resuelve contra el scope.

   2. SUPABASE NUNCA SE CACHEA. La referencia solo filtra por origen, y aquí
      eso no basta: si una respuesta de PostgREST quedara en caché, el
      directorio seguiría enseñando agentes viejos después de un cambio, y peor,
      una respuesta con sesión podría servirse a otra. Se descarta por origen
      distinto (que ya lo cubre) y además de forma explícita más abajo.

   3. El HTML va NETWORK-FIRST. Es lo que evita el problema clásico de la PWA:
      cachear agresivamente y quedarse mostrando una versión vieja aunque el
      usuario recargue. La caché solo entra cuando la red falla.

   Al cambiar la lista de abajo, subir CACHE_NAME. El `activate` borra las
   cachés viejas y avisa a las pestañas abiertas (banner de actualización).
   ========================================================================== */

const CACHE_NAME = 'vaxti-v1';
const OFFLINE_URL = 'offline.html';

/* Estáticos: cache-first. Cambian poco y así la app abre al instante. */
const ESTATICOS = [
  'styles.css',
  'app.js',
  'supabase-config.js',
  'manifest.json',
  'offline.html',
  'logo.png',
  'logo-icono.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
];

/* Las 12 pantallas. Se precachean para que la app abra sin red. */
const PAGINAS = [
  './',
  'index.html',
  'agentes.html',
  'ramos.html',
  'perfil.html',
  'unete.html',
  'legal.html',
  'terminos.html',
  'privacidad.html',
  'cookies.html',
  'panel-director.html',
  'panel-agente.html',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    /* Uno por uno en vez de `addAll`: así un recurso que falle no tumba la
       instalación completa. Con addAll, renombrar un archivo y olvidarse de
       esta lista deja la PWA sin instalar y sin decir por qué. */
    await Promise.all([...ESTATICOS, ...PAGINAS].map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (err) {
        console.warn('[sw] no se pudo precachear:', url, err.message);
      }
    }));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const claves = await caches.keys();
    await Promise.all(claves.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
    // Avisa a las pestañas abiertas de que hay versión nueva.
    const clientes = await self.clients.matchAll({ type: 'window' });
    clientes.forEach((c) => c.postMessage({ type: 'SW_UPDATED' }));
  })());
});

self.addEventListener('message', (e) => {
  // El banner de actualización pide activar sin esperar.
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;

  // Solo GET. Un POST a `citas` jamás debe tocar la caché.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Otro origen: Supabase, el CDN de supabase-js, Font Awesome, Unsplash.
  // Se dejan pasar a la red sin intervenir.
  if (url.origin !== self.location.origin) return;

  // Cinturón y tirantes: aunque el filtro de origen ya lo cubre, ninguna
  // llamada a la API se cachea nunca.
  if (url.pathname.includes('/rest/v1/') || url.pathname.includes('/auth/v1/')) return;

  const esHTML = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').includes('text/html');
  // El código también va network-first: así un cambio en app.js o styles.css
  // llega en la siguiente carga sin tener que subir CACHE_NAME.
  const redPrimero = esHTML ||
                     url.pathname.endsWith('.js') ||
                     url.pathname.endsWith('.css');

  if (redPrimero) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const copia = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copia));
        }
        return res;
      } catch (err) {
        const cacheada = await caches.match(req);
        if (cacheada) return cacheada;
        // Sin red y sin copia: para una navegación, la página de offline.
        if (esHTML) {
          const off = await caches.match(OFFLINE_URL);
          if (off) return off;
        }
        throw err;
      }
    })());
    return;
  }

  // Imágenes y demás estáticos: caché primero, y si no está, red.
  e.respondWith((async () => {
    const cacheada = await caches.match(req);
    if (cacheada) return cacheada;
    const res = await fetch(req);
    if (res && res.ok && url.origin === self.location.origin) {
      const copia = res.clone();
      caches.open(CACHE_NAME).then((c) => c.put(req, copia));
    }
    return res;
  })());
});
