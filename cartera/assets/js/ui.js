/* ==========================================================================
   ui.js — Helpers de formato y render. Sin framework, sin dependencias.
   ========================================================================== */

window.UI = (function () {

  const $  = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  /* Escapa SIEMPRE lo que venga de la base antes de meterlo en innerHTML.
     Nombres, notas y descripciones son texto libre capturado por el agente. */
  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const fmtMXN = new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', maximumFractionDigits: 0,
  });

  function mxn(n) {
    if (n === null || n === undefined || n === '') return '—';
    return fmtMXN.format(Number(n));
  }

  /* Compacto para tarjetas de métrica: $1.2M / $340k */
  function mxnCorto(n) {
    const v = Number(n || 0);
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (v >= 1e3) return '$' + Math.round(v / 1e3) + 'k';
    return mxn(v);
  }

  /* Las fechas `date` de Postgres llegan como 'YYYY-MM-DD'. Se parsean a mano
     para evitar el corrimiento de un día por zona horaria. */
  function fecha(d) {
    if (!d) return '—';
    const s = String(d).slice(0, 10).split('-');
    if (s.length !== 3) return '—';
    return `${s[2]}/${s[1]}/${s[0]}`;
  }

  function fechaHora(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('es-MX', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function diasPara(fechaISO) {
    if (!fechaISO) return null;
    const [a, m, d] = String(fechaISO).slice(0, 10).split('-').map(Number);
    const objetivo = new Date(a, m - 1, d);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return Math.round((objetivo - hoy) / 86400000);
  }

  /* Semáforo de vencimiento: es la señal visual más importante del sistema. */
  function badgeVencimiento(fechaISO) {
    const d = diasPara(fechaISO);
    if (d === null) return '';
    if (d < 0)   return `<span class="badge riesgo">Vencida hace ${Math.abs(d)} d</span>`;
    if (d <= 30) return `<span class="badge riesgo">Vence en ${d} d</span>`;
    if (d <= 60) return `<span class="badge alerta">Vence en ${d} d</span>`;
    if (d <= 90) return `<span class="badge info">Vence en ${d} d</span>`;
    return `<span class="badge">Vence en ${d} d</span>`;
  }

  function badge(texto, clase) {
    return `<span class="badge ${clase || ''}">${esc(texto)}</span>`;
  }

  const ramo    = (k) => (CAT.RAMOS[k] || { label: k, icono: '📄' });
  const estatus = (k) => (CAT.ESTATUS_POLIZA[k] || { label: k, clase: '' });

  /* Link de WhatsApp — el canal real de trabajo del agente en campo. */
  function linkWhatsApp(telefono, texto) {
    if (!telefono) return null;
    const num = String(telefono).replace(/[^\d]/g, '');
    if (!num) return null;
    return `https://wa.me/${num}` + (texto ? `?text=${encodeURIComponent(texto)}` : '');
  }

  function pinta(sel, html) {
    const el = typeof sel === 'string' ? $(sel) : sel;
    if (el) el.innerHTML = html;
    return el;
  }

  const cargando = (msg) => `<div class="cargando">${esc(msg || 'Cargando…')}</div>`;
  const vacio    = (msg) => `<div class="vacio">${esc(msg || 'Nada por aquí todavía.')}</div>`;

  /* Esqueleto en vez de spinner: la pantalla no salta cuando llegan los datos
     porque el hueco ya tenía la forma y la altura de lo que va a entrar. */
  function esqueleto(filas) {
    let html = '';
    for (let i = 0; i < (filas || 3); i++) {
      html += `<div class="esqueleto">
        <div class="linea media"></div>
        <div class="linea corta"></div>
      </div>`;
    }
    return html;
  }

  function aviso(sel, texto, tipo) {
    const el = typeof sel === 'string' ? $(sel) : sel;
    if (!el) return;
    if (!texto) { el.className = 'oculto'; el.textContent = ''; return; }
    el.className = 'aviso ' + (tipo || 'info');
    el.textContent = texto;
  }

  /* Los errores de Supabase se muestran sin volcar datos de pólizas al log. */
  function error(sel, e) {
    console.error(e);
    aviso(sel, (e && e.message) ? e.message : 'Ocurrió un error. Intenta de nuevo.', 'error');
  }

  /* `i` es el índice de la tarjeta: alimenta el retardo de entrada escalonada. */
  function metrica(etiqueta, valor, pie, clase, i) {
    return `<div class="metrica ${clase || ''}" style="--i:${i || 0}">
      <div class="etiqueta">${esc(etiqueta)}</div>
      <div class="valor">${esc(valor)}</div>
      ${pie ? `<div class="pie">${esc(pie)}</div>` : ''}
    </div>`;
  }

  function opciones(catalogo, incluirTodas, textoTodas) {
    const items = Object.entries(catalogo).map(([k, v]) => {
      const label = typeof v === 'string' ? v : v.label;
      return `<option value="${esc(k)}">${esc(label)}</option>`;
    });
    if (incluirTodas) items.unshift(`<option value="">${esc(textoTodas || 'Todos')}</option>`);
    return items.join('');
  }

  return {
    $, $$, esc, mxn, mxnCorto, fecha, fechaHora, diasPara,
    badge, badgeVencimiento, ramo, estatus, linkWhatsApp,
    pinta, cargando, vacio, esqueleto, aviso, error, metrica, opciones,
  };
})();
