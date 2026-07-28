/* ==========================================================================
   api.js — Toda consulta a Supabase pasa por aquí.

   Ninguna función filtra por agente_id "a mano": el RLS ya recorta lo que
   cada quien puede ver. Los filtros que sí aparecen son de UI (el Director
   eligiendo un agente concreto), no de seguridad.
   ========================================================================== */

window.API = (function () {

  function ok(res) {
    if (res.error) throw res.error;
    return res.data;
  }

  /* ---------------- Usuarios / equipo ---------------- */

  async function miUsuario() {
    const { data: sesion } = await db.auth.getUser();
    if (!sesion || !sesion.user) return null;
    return ok(await db.from('usuarios')
      .select('*')
      .eq('auth_user_id', sesion.user.id)
      .maybeSingle());
  }

  const miEquipo = async () => ok(await db.from('usuarios')
    .select('*')
    .eq('rol', 'agente')
    .order('nombre'));

  const resumenEquipo = async () => ok(await db.from('v_resumen_agente')
    .select('*')
    .order('prima_bajo_gestion', { ascending: false }));

  const altaAgente = async (datos) => ok(await db.from('usuarios')
    .insert(datos)
    .select()
    .single());

  const cambiarActivo = async (id, activo) => ok(await db.from('usuarios')
    .update({ activo })
    .eq('id', id)
    .select()
    .single());

  /* ---------------- Clientes ---------------- */

  async function clientes({ busqueda, agenteId } = {}) {
    let q = db.from('clientes').select('*').order('nombre');
    if (agenteId) q = q.eq('agente_id', agenteId);
    if (busqueda) q = q.ilike('nombre', `%${busqueda}%`);
    return ok(await q);
  }

  const cliente = async (id) => ok(await db.from('clientes')
    .select('*')
    .eq('id', id)
    .single());

  const guardarCliente = async (datos) => (datos.id
    ? ok(await db.from('clientes').update(datos).eq('id', datos.id).select().single())
    : ok(await db.from('clientes').insert(datos).select().single()));

  /* ---------------- Pólizas ---------------- */

  /* Se lee de la vista v_polizas_detalle: ya trae cliente, agente y días
     para vencer resueltos, así el front no arma joins. */
  async function polizas({ agenteId, clienteId, ramo, estatus, diasMax, orden } = {}) {
    let q = db.from('v_polizas_detalle').select('*');
    if (agenteId)  q = q.eq('agente_id', agenteId);
    if (clienteId) q = q.eq('cliente_id', clienteId);
    if (ramo)      q = q.eq('ramo', ramo);
    if (estatus)   q = q.eq('estatus', estatus);
    if (diasMax !== undefined && diasMax !== null && diasMax !== '') {
      q = q.lte('dias_para_vencer', Number(diasMax)).gte('dias_para_vencer', 0);
    }
    return ok(await q.order(orden || 'fecha_vencimiento', { ascending: true }));
  }

  /* Vencimientos: solo pólizas vivas dentro de la ventana de días. */
  const vencimientos = async ({ dias = 90, agenteId } = {}) => {
    let q = db.from('v_polizas_detalle')
      .select('*')
      .in('estatus', ['activa', 'por_vencer'])
      .lte('dias_para_vencer', dias)
      .order('fecha_vencimiento', { ascending: true });
    if (agenteId) q = q.eq('agente_id', agenteId);
    return ok(await q);
  };

  const guardarPoliza = async (datos) => (datos.id
    ? ok(await db.from('polizas').update(datos).eq('id', datos.id).select().single())
    : ok(await db.from('polizas').insert(datos).select().single()));

  /* ---------------- Actividad ---------------- */

  async function actividad({ clienteId, agenteId, limite = 50 } = {}) {
    let q = db.from('actividad')
      .select('*, clientes(nombre)')
      .order('fecha', { ascending: false })
      .limit(limite);
    if (clienteId) q = q.eq('cliente_id', clienteId);
    if (agenteId)  q = q.eq('agente_id', agenteId);
    return ok(await q);
  }

  const registrarActividad = async (datos) => ok(await db.from('actividad')
    .insert(datos)
    .select()
    .single());

  /* ---------------- Oportunidades ---------------- */

  async function oportunidades({ agenteId, estatus, tipo } = {}) {
    let q = db.from('v_oportunidades_detalle').select('*');
    if (agenteId) q = q.eq('agente_id', agenteId);
    if (estatus)  q = q.eq('estatus', estatus);
    if (tipo)     q = q.eq('tipo', tipo);
    return ok(await q.order('valor_estimado', { ascending: false, nullsFirst: false })
                     .order('created_at', { ascending: false }));
  }

  const cambiarEstatusOportunidad = async (id, estatus) =>
    ok(await db.from('oportunidades').update({ estatus }).eq('id', id).select().single());

  /* Motor de reglas SQL (03_oportunidades.sql). Cada agente genera lo suyo. */
  const generarOportunidades = async () => ok(await db.rpc('generar_mis_oportunidades'));

  /* ---------------- Referidos ---------------- */

  const codigosReferido = async () => ok(await db.from('codigos_referido')
    .select('*, clientes(nombre)')
    .order('created_at', { ascending: false }));

  const crearCodigoReferido = async (clienteId, agenteId) =>
    ok(await db.from('codigos_referido')
      .insert({ cliente_id: clienteId, agente_id: agenteId })
      .select()
      .single());

  return {
    miUsuario, miEquipo, resumenEquipo, altaAgente, cambiarActivo,
    clientes, cliente, guardarCliente,
    polizas, vencimientos, guardarPoliza,
    actividad, registrarActividad,
    oportunidades, cambiarEstatusOportunidad, generarOportunidades,
    codigosReferido, crearCodigoReferido,
  };
})();
