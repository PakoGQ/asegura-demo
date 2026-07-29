-- ============================================================================
-- 06_funciones.sql — Triggers y motor de reglas
--
-- Tres bloques:
--   1. Lo que el agente no puede cambiar de su propia ficha
--   2. Contadores que se mantienen solos (calificación, citas)
--   3. Códigos de referido y motor de oportunidades (cartera)
-- ============================================================================

-- ============================================================================
-- 1. Campos protegidos de `agentes`
--
-- El RLS filtra filas, no columnas: la policy `agentes_update_propio` deja al
-- agente editar su fila entera. Este trigger es lo que impide que se
-- autoverifique la cédula o se quite una suspensión.
--
-- Misma regla que Doncellas: la escort edita su contenido, no su identidad.
-- ============================================================================
create or replace function public.trg_agente_campos_protegidos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Los triggers de contadores de más abajo actualizan `agentes` para escribir
  -- calificación, num_resenas y num_citas. Sin esta salida, este trigger les
  -- revertiría justo esos campos y el recálculo se anularía solo.
  if coalesce(current_setting('app.trigger_interno', true), 'off') = 'on' then
    return new;
  end if;

  -- El Director de este agente puede cambiar lo que sea.
  if public.mi_rol() = 'director'
     and old.director_id = public.mi_usuario_id() then
    return new;
  end if;

  -- Para todos los demás, estos campos se quedan como estaban.
  new.slug           := old.slug;
  new.usuario_id     := old.usuario_id;
  new.director_id    := old.director_id;
  new.nombre         := old.nombre;
  new.cedula         := old.cedula;
  new.verificado     := old.verificado;
  new.activo         := old.activo;
  new.hidden         := old.hidden;
  new.suspended      := old.suspended;
  new.suspended_from := old.suspended_from;
  new.susp_history   := old.susp_history;
  new.plan           := old.plan;
  new.calificacion   := old.calificacion;
  new.num_resenas    := old.num_resenas;
  new.num_citas      := old.num_citas;
  new.es_destacado   := old.es_destacado;
  new.top10          := old.top10;

  return new;
end;
$$;

drop trigger if exists agentes_campos_protegidos on public.agentes;
create trigger agentes_campos_protegidos
  before update on public.agentes
  for each row execute function public.trg_agente_campos_protegidos();

-- ============================================================================
-- 2. Contadores
-- ============================================================================

-- La calificación del agente sale solo de reseñas aprobadas. Se recalcula
-- cuando el Director aprueba una, o cuando la retira.
create or replace function public.trg_recalcular_calificacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agente uuid := coalesce(new.agente_id, old.agente_id);
begin
  -- Marca la escritura como interna para que el trigger de campos protegidos
  -- la deje pasar. `true` = solo dura esta transacción.
  perform set_config('app.trigger_interno', 'on', true);

  update public.agentes a
     set calificacion = coalesce((
           select round(avg(r.calificacion)::numeric, 2)
             from public.resenas r
            where r.agente_id = v_agente and r.aprobada), 5.00),
         num_resenas = (
           select count(*) from public.resenas r
            where r.agente_id = v_agente and r.aprobada)
   where a.id = v_agente;

  perform set_config('app.trigger_interno', 'off', true);
  return null;
end;
$$;

drop trigger if exists resenas_recalcular on public.resenas;
create trigger resenas_recalcular
  after insert or update or delete on public.resenas
  for each row execute function public.trg_recalcular_calificacion();

-- Citas completadas del agente.
create or replace function public.trg_contar_citas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.trigger_interno', 'on', true);

  update public.agentes a
     set num_citas = (select count(*) from public.citas c
                       where c.agente_id = a.id and c.estado = 'completada')
   where a.id = coalesce(new.agente_id, old.agente_id);

  perform set_config('app.trigger_interno', 'off', true);
  return null;
end;
$$;

drop trigger if exists citas_contar on public.citas;
create trigger citas_contar
  after insert or update of estado or delete on public.citas
  for each row execute function public.trg_contar_citas();

-- ============================================================================
-- 3. Referidos (cartera)
--
-- Alfabeto sin caracteres ambiguos (0/O, 1/I): el código se dicta por teléfono.
-- ============================================================================
create or replace function public.generar_codigo_referido()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_codigo   text;
  v_intentos int := 0;
begin
  loop
    v_codigo := 'REF-';
    for _ in 1..6 loop
      v_codigo := v_codigo ||
        substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
    end loop;

    exit when not exists (select 1 from public.codigos_referido where codigo = v_codigo);

    v_intentos := v_intentos + 1;
    if v_intentos > 20 then
      raise exception 'No se pudo generar un código de referido único';
    end if;
  end loop;

  return v_codigo;
end;
$$;

create or replace function public.trg_codigo_referido()
returns trigger
language plpgsql
as $$
begin
  if new.codigo is null or new.codigo = '' then
    new.codigo := public.generar_codigo_referido();
  end if;
  return new;
end;
$$;

drop trigger if exists codigos_referido_set_codigo on public.codigos_referido;
create trigger codigos_referido_set_codigo
  before insert on public.codigos_referido
  for each row execute function public.trg_codigo_referido();

create or replace function public.trg_incrementar_usos_referido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.codigos_referido set usos = usos + 1 where id = new.codigo_id;
  return new;
end;
$$;

drop trigger if exists referidos_incrementar_usos on public.referidos;
create trigger referidos_incrementar_usos
  after insert on public.referidos
  for each row execute function public.trg_incrementar_usos_referido();

-- ============================================================================
-- 4. Motor de oportunidades (cartera — CLAUDE.md §14)
--
-- Cuatro reglas SQL. Nada de machine learning. El índice único
-- `oportunidades_abiertas_uq` evita duplicados, así que se puede correr las
-- veces que haga falta.
-- ============================================================================
create or replace function public.actualizar_estatus_polizas()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_filas int;
begin
  update public.polizas
     set estatus = 'por_vencer'
   where estatus = 'activa'
     and fecha_vencimiento between current_date and current_date + interval '30 days';
  get diagnostics v_filas = row_count;

  update public.polizas
     set estatus = 'no_renovada'
   where estatus in ('activa', 'por_vencer')
     and fecha_vencimiento < current_date;

  return v_filas;
end;
$$;

create or replace function public.generar_oportunidades(p_agente_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int := 0;
  v_n     int;
begin
  perform public.actualizar_estatus_polizas();

  -- Regla 1 — Cross-sell VIDA: auto vigente de más de 6 meses, sin vida.
  insert into public.oportunidades (cliente_id, agente_id, tipo, ramo_sugerido, motivo)
  select p.cliente_id, p.agente_id, 'cross_sell', 'vida',
         'Cliente con póliza de auto activa desde ' ||
           to_char(min(p.fecha_inicio), 'YYYY') || ', sin póliza de vida.'
    from public.polizas p
   where p.ramo = 'auto'
     and p.estatus in ('activa', 'por_vencer')
     and p.fecha_inicio <= current_date - interval '6 months'
     and (p_agente_id is null or p.agente_id = p_agente_id)
     and not exists (select 1 from public.polizas v
                      where v.cliente_id = p.cliente_id and v.ramo = 'vida'
                        and v.estatus in ('activa', 'por_vencer', 'renovada'))
   group by p.cliente_id, p.agente_id
  on conflict do nothing;
  get diagnostics v_n = row_count;  v_total := v_total + v_n;

  -- Regla 2 — Cross-sell GASTOS MÉDICOS: vida vigente, sin GMM.
  insert into public.oportunidades (cliente_id, agente_id, tipo, ramo_sugerido, motivo)
  select distinct p.cliente_id, p.agente_id, 'cross_sell', 'gastos_medicos',
         'Cliente con póliza de vida vigente, sin gastos médicos mayores.'
    from public.polizas p
   where p.ramo = 'vida'
     and p.estatus in ('activa', 'por_vencer')
     and (p_agente_id is null or p.agente_id = p_agente_id)
     and not exists (select 1 from public.polizas g
                      where g.cliente_id = p.cliente_id and g.ramo = 'gastos_medicos'
                        and g.estatus in ('activa', 'por_vencer', 'renovada'))
  on conflict do nothing;
  get diagnostics v_n = row_count;  v_total := v_total + v_n;

  -- Regla 3 — RIESGO DE NO RENOVACIÓN: vence en 60 días y lleva 60 sin contacto.
  insert into public.oportunidades
         (cliente_id, agente_id, tipo, ramo_sugerido, motivo, valor_estimado)
  select p.cliente_id, p.agente_id, 'riesgo_no_renovacion', p.ramo,
         'Póliza ' || p.numero_poliza || ' (' || p.ramo || ') vence el ' ||
           to_char(p.fecha_vencimiento, 'DD/MM/YYYY') ||
           ' y no hay contacto registrado en los últimos 60 días.',
         p.prima_anual
    from public.polizas p
   where p.estatus in ('activa', 'por_vencer')
     and p.fecha_vencimiento between current_date and current_date + interval '60 days'
     and (p_agente_id is null or p.agente_id = p_agente_id)
     and not exists (select 1 from public.actividad a
                      where a.cliente_id = p.cliente_id
                        and a.fecha >= now() - interval '60 days')
  on conflict do nothing;
  get diagnostics v_n = row_count;  v_total := v_total + v_n;

  -- Regla 4 — REVISIÓN DE COBERTURA: monoproducto con más de 12 meses.
  insert into public.oportunidades (cliente_id, agente_id, tipo, motivo)
  select p.cliente_id, p.agente_id, 'revision_cobertura',
         'Cliente con una sola póliza (' || min(p.ramo) || ') desde ' ||
           to_char(min(p.fecha_inicio), 'MM/YYYY') || '. Toca revisión de cobertura.'
    from public.polizas p
   where p.estatus in ('activa', 'por_vencer')
     and (p_agente_id is null or p.agente_id = p_agente_id)
   group by p.cliente_id, p.agente_id
  having count(*) = 1
     and min(p.fecha_inicio) <= current_date - interval '12 months'
  on conflict do nothing;
  get diagnostics v_n = row_count;  v_total := v_total + v_n;

  return v_total;
end;
$$;

-- Lo único que se expone al cliente web: cada quien genera solo lo suyo.
create or replace function public.generar_mis_oportunidades()
returns int
language sql
volatile
security definer
set search_path = public
as $$
  select public.generar_oportunidades(public.mi_usuario_id());
$$;

-- Variante para el equipo. `generar_mis_oportunidades()` genera para QUIEN
-- LLAMA, así que no sirve cuando el Director importa la cartera de uno de sus
-- agentes: las oportunidades se generarían a nombre del Director, que no tiene
-- pólizas, y el agente nunca las vería.
--
-- Aquí el permiso lo decide `es_de_mi_equipo()`, el mismo helper que usa el
-- RLS: pasa si el objetivo soy yo, o si soy director y es de mi equipo. Lo
-- comprueba la base y no el cliente, porque un `select` desde el navegador se
-- puede modificar y esta función es `security definer`.
create or replace function public.generar_oportunidades_de(p_agente uuid)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.es_de_mi_equipo(p_agente) then
    raise exception 'No puedes generar oportunidades de un agente que no es de tu equipo.';
  end if;
  return public.generar_oportunidades(p_agente);
end;
$$;

grant execute on function public.generar_oportunidades_de(uuid) to authenticated;

revoke execute on function public.generar_oportunidades(uuid) from anon, authenticated;
grant  execute on function public.generar_mis_oportunidades()  to authenticated;
grant  execute on function public.actualizar_estatus_polizas() to authenticated;
