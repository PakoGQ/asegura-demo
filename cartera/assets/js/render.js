/* ==========================================================================
   render.js — Partials de dominio compartidos entre pantallas.

   Una póliza se ve igual en el panel del Director, en su cartera consolidada
   y en la cartera del Agente. Vive aquí para no repetirla en cinco archivos.
   ========================================================================== */

window.Render = (function () {

  function lista(items, fn, mensajeVacio) {
    if (!items || !items.length) return UI.vacio(mensajeVacio);
    return `<ul class="lista">${items.map(fn).join('')}</ul>`;
  }

  /**
   * Fila de póliza.
   * @param opts.mostrarAgente  columna de agente (vistas del Director)
   * @param opts.acciones       función (p) → HTML de botones bajo la fila
   */
  function poliza(p, opts) {
    opts = opts || {};
    const r = UI.ramo(p.ramo);
    const e = UI.estatus(p.estatus);
    return `
      <li>
        <div class="principal">
          <div class="titulo">${UI.esc(p.cliente_nombre)}</div>
          <div class="sub">
            ${r.icono} ${UI.esc(r.label)} · ${UI.esc(p.numero_poliza)}
            ${opts.mostrarAgente && p.agente_nombre ? ' · ' + UI.esc(p.agente_nombre) : ''}
          </div>
          <div style="margin-top:.3rem">
            ${UI.badge(e.label, e.clase)}
            ${['activa', 'por_vencer'].includes(p.estatus) ? UI.badgeVencimiento(p.fecha_vencimiento) : ''}
          </div>
          ${opts.acciones ? opts.acciones(p) : ''}
        </div>
        <div class="lateral">
          <div class="monto num">${UI.mxn(p.prima_anual)}</div>
          <div class="sub">${UI.fecha(p.fecha_vencimiento)}</div>
          ${p.comision_estimada ? `<div class="sub num">Com. ${UI.mxn(p.comision_estimada)}</div>` : ''}
        </div>
      </li>`;
  }

  /* Fila de oportunidad. opts.acciones → botones de estatus (vista Agente). */
  function oportunidad(o, opts) {
    opts = opts || {};
    const t = CAT.TIPOS_OPORTUNIDAD[o.tipo] || { label: o.tipo, clase: '' };
    const e = CAT.ESTATUS_OPORTUNIDAD[o.estatus] || { label: o.estatus, clase: '' };
    const wa = UI.linkWhatsApp(o.cliente_telefono, `Hola ${o.cliente_nombre || ''}, te escribo de parte de tu agente de seguros.`);

    const acciones = opts.acciones ? `
      <div class="acciones" style="margin-top:.5rem">
        ${o.estatus === 'nueva'
          ? `<button class="btn chico" data-op="${UI.esc(o.id)}" data-estatus="en_proceso">En proceso</button>` : ''}
        ${o.estatus !== 'ganada'
          ? `<button class="btn chico primario" data-op="${UI.esc(o.id)}" data-estatus="ganada">Ganada</button>` : ''}
        ${o.estatus !== 'descartada'
          ? `<button class="btn chico" data-op="${UI.esc(o.id)}" data-estatus="descartada">Descartar</button>` : ''}
        ${wa ? `<a class="btn chico" href="${UI.esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
      </div>` : '';

    return `
      <li>
        <div class="principal">
          <div class="titulo">${UI.esc(o.cliente_nombre)}</div>
          <div class="sub">${UI.esc(o.motivo)}</div>
          <div style="margin-top:.3rem">
            ${UI.badge(t.label, t.clase)}
            ${UI.badge(e.label, e.clase)}
            ${o.ramo_sugerido ? UI.badge(UI.ramo(o.ramo_sugerido).label, '') : ''}
            ${opts.mostrarAgente && o.agente_nombre ? UI.badge(o.agente_nombre, '') : ''}
          </div>
          ${acciones}
        </div>
        <div class="lateral">
          <div class="monto num">${o.valor_estimado ? UI.mxn(o.valor_estimado) : ''}</div>
        </div>
      </li>`;
  }

  function actividad(a) {
    const t = CAT.TIPOS_ACTIVIDAD[a.tipo] || { label: a.tipo, icono: '•' };
    return `
      <li>
        <div class="principal">
          <div class="titulo">${t.icono} ${UI.esc(t.label)}${
            a.clientes && a.clientes.nombre ? ' · ' + UI.esc(a.clientes.nombre) : ''}</div>
          <div class="sub">${UI.esc(a.descripcion)}</div>
        </div>
        <div class="lateral">
          <div class="sub">${UI.fechaHora(a.fecha)}</div>
          ${a.resultado ? UI.badge(CAT.RESULTADOS_ACTIVIDAD[a.resultado] || a.resultado, '') : ''}
        </div>
      </li>`;
  }

  function cliente(c) {
    const wa = UI.linkWhatsApp(c.telefono);
    return `
      <li>
        <div class="principal">
          <div class="titulo">${UI.esc(c.nombre)}</div>
          <div class="sub">${UI.esc(c.telefono || 'Sin teléfono')}${c.email ? ' · ' + UI.esc(c.email) : ''}</div>
        </div>
        <div class="lateral">
          ${wa ? `<a class="btn chico" href="${UI.esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        </div>
      </li>`;
  }

  /* Totales que encabezan las vistas de cartera. */
  function totalesCartera(polizas) {
    const vivas = polizas.filter((p) => ['activa', 'por_vencer'].includes(p.estatus));
    const prima = vivas.reduce((s, p) => s + Number(p.prima_anual || 0), 0);
    const com   = vivas.reduce((s, p) => s + Number(p.comision_estimada || 0), 0);
    const v30   = vivas.filter((p) => p.dias_para_vencer <= 30 && p.dias_para_vencer >= 0).length;
    return [
      UI.metrica('Pólizas', polizas.length, `${vivas.length} vigentes`),
      UI.metrica('Prima', UI.mxnCorto(prima), 'anualizada'),
      UI.metrica('Comisión est.', UI.mxnCorto(com), 'sobre vigentes'),
      UI.metrica('Vencen 30 d', v30, '', v30 ? 'riesgo' : ''),
    ].join('');
  }

  return { lista, poliza, oportunidad, actividad, cliente, totalesCartera };
})();
