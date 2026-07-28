/* ==========================================================================
   graficos.js — Gráficas en SVG, sin librerías.

   Todas las funciones devuelven HTML como string, igual que render.js. Tras
   insertarlo en el DOM hay que llamar a Graficos.activar(raiz): ese segundo
   paso es el que dispara las animaciones, porque una transición CSS necesita
   que el elemento ya esté pintado para tener un estado del cual salir.
   ========================================================================== */

window.Graficos = (function () {

  const menosMovimiento = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const colorRamo = (ramo) => `var(--ramo-${ramo}, var(--acento))`;

  /* ---------------------------------------------------------------------
     Dona — distribución de la cartera por ramo.
     --------------------------------------------------------------------- */
  function dona(segmentos, opciones) {
    const o = Object.assign({ tamano: 132, grosor: 16, formato: (v) => v }, opciones);
    const total = segmentos.reduce((s, x) => s + Number(x.valor || 0), 0);

    if (!total) {
      return `<div class="vacio">Sin datos para graficar.</div>`;
    }

    const r = (o.tamano - o.grosor) / 2;
    const C = 2 * Math.PI * r;
    const centro = o.tamano / 2;
    let acumulado = 0;

    const arcos = segmentos.map((s, i) => {
      const frac = Number(s.valor || 0) / total;
      const largo = frac * C;
      // -90° para que el primer segmento arranque arriba, no a la derecha.
      const giro = -90 + acumulado * 360;
      acumulado += frac;
      return `<circle
        cx="${centro}" cy="${centro}" r="${r}"
        fill="none"
        stroke="${s.color}"
        stroke-width="${o.grosor}"
        stroke-linecap="butt"
        stroke-dasharray="0 ${C.toFixed(2)}"
        data-arco="${largo.toFixed(2)} ${(C - largo).toFixed(2)}"
        style="transform: rotate(${giro.toFixed(2)}deg); transform-origin: center;
               transition: stroke-dasharray 900ms var(--curva) ${i * 90}ms;"
      ></circle>`;
    }).join('');

    const leyenda = segmentos.map((s, i) => `
      <li style="--i:${i}">
        <span class="muestra" style="background:${s.color}"></span>
        <span class="nombre">${s.etiqueta}</span>
        <span class="dato">${o.formato(s.valor)}</span>
      </li>`).join('');

    return `
      <div class="grafica-caja">
        <svg width="${o.tamano}" height="${o.tamano}" viewBox="0 0 ${o.tamano} ${o.tamano}"
             role="img" aria-label="Distribución por ramo">
          <circle cx="${centro}" cy="${centro}" r="${r}" fill="none"
                  stroke="var(--fondo)" stroke-width="${o.grosor}"></circle>
          ${arcos}
        </svg>
        <ul class="leyenda">${leyenda}</ul>
      </div>`;
  }

  /* ---------------------------------------------------------------------
     Barras horizontales — ranking de agentes, vencimientos por mes.
     --------------------------------------------------------------------- */
  function barras(filas, opciones) {
    const o = Object.assign({ formato: (v) => v, color: null }, opciones);
    const max = Math.max(...filas.map((f) => Number(f.valor || 0)), 1);

    return '<div class="barras">' + filas.map((f, i) => {
      const pct = (Number(f.valor || 0) / max) * 100;
      const fondo = f.color || o.color;
      return `
        <div class="barra-fila">
          <div class="cabeza">
            <span class="nombre">${f.etiqueta}</span>
            <span class="dato">${o.formato(f.valor)}</span>
          </div>
          <div class="barra-pista">
            <div class="barra-relleno" style="width:${pct.toFixed(1)}%; --i:${i}
                 ${fondo ? `; background:${fondo}` : ''}"></div>
          </div>
        </div>`;
    }).join('') + '</div>';
  }

  /* ---------------------------------------------------------------------
     Anillo de progreso — un porcentaje que importa (cartera contactada).
     --------------------------------------------------------------------- */
  function anillo(pct, opciones) {
    const o = Object.assign({ tamano: 92, grosor: 10, etiqueta: '', pie: '' }, opciones);
    const p = Math.max(0, Math.min(100, Number(pct) || 0));
    const r = (o.tamano - o.grosor) / 2;
    const C = 2 * Math.PI * r;
    const centro = o.tamano / 2;
    // Bajo 40% el dato ya no es informativo, es un problema: cambia de color.
    const color = p >= 70 ? 'var(--ok)' : p >= 40 ? 'var(--alerta)' : 'var(--riesgo)';

    return `
      <div class="anillo-caja">
        <svg width="${o.tamano}" height="${o.tamano}" viewBox="0 0 ${o.tamano} ${o.tamano}"
             role="img" aria-label="${o.etiqueta}: ${Math.round(p)}%">
          <circle cx="${centro}" cy="${centro}" r="${r}" fill="none"
                  stroke="var(--fondo)" stroke-width="${o.grosor}"></circle>
          <circle cx="${centro}" cy="${centro}" r="${r}" fill="none"
                  stroke="${color}" stroke-width="${o.grosor}" stroke-linecap="round"
                  stroke-dasharray="0 ${C.toFixed(2)}"
                  data-arco="${(C * p / 100).toFixed(2)} ${(C * (1 - p / 100)).toFixed(2)}"
                  style="transform: rotate(-90deg); transform-origin: center;
                         transition: stroke-dasharray 1000ms var(--curva) 120ms;"></circle>
        </svg>
        <div class="anillo-texto">
          <div class="valor" data-contador="${p}" data-sufijo="%">0%</div>
          ${o.etiqueta ? `<div class="pie">${o.etiqueta}</div>` : ''}
          ${o.pie ? `<div class="pie">${o.pie}</div>` : ''}
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------------------
     Contador — el número sube hasta su valor en vez de aparecer de golpe.
     Se usa en las cifras grandes del hero y en los anillos.
     --------------------------------------------------------------------- */
  function contador(el) {
    const destino = Number(el.dataset.contador || 0);
    const sufijo = el.dataset.sufijo || '';
    const prefijo = el.dataset.prefijo || '';
    const decimales = Number(el.dataset.decimales || 0);
    const pinta = (v) => {
      el.textContent = prefijo +
        v.toLocaleString('es-MX', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }) +
        sufijo;
    };

    if (menosMovimiento()) { pinta(destino); return; }

    const duracion = 900;
    const inicio = performance.now();
    function paso(ahora) {
      const t = Math.min(1, (ahora - inicio) / duracion);
      const suave = 1 - Math.pow(1 - t, 3);        // easeOutCubic
      pinta(Math.round(destino * suave * Math.pow(10, decimales)) / Math.pow(10, decimales));
      if (t < 1) requestAnimationFrame(paso);
    }
    requestAnimationFrame(paso);
  }

  /* ---------------------------------------------------------------------
     activar — segundo paso obligatorio tras insertar el HTML.
     --------------------------------------------------------------------- */
  function activar(raiz) {
    const r = raiz || document;

    // Los arcos salen de 0 y crecen hasta su valor real.
    requestAnimationFrame(() => {
      r.querySelectorAll('[data-arco]').forEach((c) => {
        c.setAttribute('stroke-dasharray', c.dataset.arco);
      });
    });

    r.querySelectorAll('[data-contador]').forEach(contador);
    // El escalonado de listas lo resuelve componentes.css con :nth-child.
  }

  return { dona, barras, anillo, contador, activar, colorRamo };
})();
