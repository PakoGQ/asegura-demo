-- ============================================================================
-- 07_vistas.sql — Vistas de lectura
--
-- Todas con security_invoker = on: la vista respeta el RLS de quien consulta,
-- no el de quien la creó. Sin eso, `v_agentes_publico` mostraría también a los
-- agentes ocultos y suspendidos, y `v_polizas_detalle` le daría a cada agente
-- la cartera del equipo completo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- v_agentes_publico — la fila que pinta el directorio y la portada.
-- Trae los ramos y la foto ya resueltos para no hacer tres queries por tarjeta.
-- ---------------------------------------------------------------------------
create or replace view public.v_agentes_publico
with (security_invoker = on) as
select a.id,
       a.slug,
       a.nombre,
       coalesce(a.foto_url, (
         select f.url from public.fotos f
          where f.agente_id = a.id and f.destino = 'perfil' and f.tipo = 'foto'
          order by f.orden limit 1
       ))                                        as foto,
       a.titulo,
       a.descripcion,
       a.cedula,
       a.aseguradoras,
       a.anios_experiencia,
       a.ciudad,
       a.zona,
       a.lat,
       a.lng,
       a.cobertura_km,
       a.modalidades,
       a.idiomas,
       a.whatsapp,
       a.disponible,
       a.verificado,
       a.calificacion,
       a.num_resenas,
       a.num_citas,
       a.es_nuevo,
       a.es_destacado,
       a.top10,
       a.tags,
       array(select r.ramo from public.ramos_agente r
              where r.agente_id = a.id order by r.es_especialidad desc, r.ramo)
                                                 as ramos,
       array(select r.ramo from public.ramos_agente r
              where r.agente_id = a.id and r.es_especialidad)
                                                 as especialidades,
       (select count(*) from public.fotos f
         where f.agente_id = a.id and f.destino = 'perfil') as num_fotos,
       a.created_at
  from public.agentes a;

-- ---------------------------------------------------------------------------
-- v_resumen_agente — una fila por agente para el panel del Director.
-- Mezcla lo del directorio (citas, reseñas) con lo de cartera (prima, pólizas).
-- ---------------------------------------------------------------------------
create or replace view public.v_resumen_agente
with (security_invoker = on) as
select u.id                                       as usuario_id,
       a.id                                       as agente_id,
       u.nombre                                   as agente_nombre,
       u.email,
       u.director_id,
       u.activo,
       a.zona,
       a.cedula,
       a.disponible,
       a.verificado,
       a.hidden,
       a.suspended,
       a.calificacion,
       a.num_resenas,

       (select count(*) from public.citas c
         where c.agente_id = a.id
           and c.fecha >= date_trunc('month', current_date))      as citas_mes,
       (select count(*) from public.citas c
         where c.agente_id = a.id and c.estado = 'pendiente')     as citas_pendientes,
       (select count(*) from public.resenas r
         where r.agente_id = a.id and not r.aprobada)             as resenas_por_aprobar,

       count(p.id) filter (
         where p.estatus in ('activa', 'por_vencer'))             as polizas_vigentes,
       coalesce(sum(p.prima_anual) filter (
         where p.estatus in ('activa', 'por_vencer')), 0)         as prima_bajo_gestion,
       count(p.id) filter (
         where p.estatus in ('activa', 'por_vencer')
           and p.fecha_vencimiento <= current_date + 30)          as vencen_30d,

       (select count(*) from public.actividad ac
         where ac.agente_id = u.id
           and ac.fecha >= now() - interval '30 days')            as actividad_30d,
       (select count(*) from public.oportunidades o
         where o.agente_id = u.id and o.estatus = 'nueva')        as oportunidades_nuevas,
       (select count(*) from public.oportunidades o
         where o.agente_id = u.id and o.estatus = 'en_proceso')   as oportunidades_en_proceso,
       (select count(*) from public.oportunidades o
         where o.agente_id = u.id and o.estatus = 'ganada')       as oportunidades_ganadas
  from public.usuarios u
  join public.agentes a on a.usuario_id = u.id
  left join public.polizas p on p.agente_id = u.id
 where u.rol = 'agente'
 group by u.id, a.id, u.nombre, u.email, u.director_id, u.activo,
          a.zona, a.cedula, a.disponible, a.verificado, a.hidden,
          a.suspended, a.calificacion, a.num_resenas;

-- ---------------------------------------------------------------------------
-- v_citas_detalle — cita + agente, para el panel. Nunca la ve el público:
-- hereda el RLS de `citas`, que no tiene policy de lectura anónima.
-- ---------------------------------------------------------------------------
create or replace view public.v_citas_detalle
with (security_invoker = on) as
select c.*,
       a.nombre  as agente_nombre,
       a.slug    as agente_slug,
       a.zona    as agente_zona,
       (c.fecha - current_date) as dias_para_cita
  from public.citas c
  join public.agentes a on a.id = c.agente_id;

-- ---------------------------------------------------------------------------
-- Cartera (CLAUDE.md §14)
-- ---------------------------------------------------------------------------
create or replace view public.v_polizas_detalle
with (security_invoker = on) as
select p.id,
       p.cliente_id,
       c.nombre                                   as cliente_nombre,
       c.telefono                                 as cliente_telefono,
       p.agente_id,
       u.nombre                                   as agente_nombre,
       p.aseguradora,
       p.ramo,
       p.numero_poliza,
       p.prima_anual,
       p.comision_pct,
       round(p.prima_anual * coalesce(p.comision_pct, 0) / 100, 2) as comision_estimada,
       p.fecha_inicio,
       p.fecha_vencimiento,
       (p.fecha_vencimiento - current_date)       as dias_para_vencer,
       p.estatus,
       p.forma_pago,
       (select max(ac.fecha) from public.actividad ac
         where ac.cliente_id = p.cliente_id)      as ultimo_contacto,
       p.created_at
  from public.polizas p
  join public.clientes c on c.id = p.cliente_id
  join public.usuarios u on u.id = p.agente_id;

create or replace view public.v_oportunidades_detalle
with (security_invoker = on) as
select o.id,
       o.cliente_id,
       c.nombre    as cliente_nombre,
       c.telefono  as cliente_telefono,
       o.agente_id,
       u.nombre    as agente_nombre,
       o.tipo,
       o.ramo_sugerido,
       o.motivo,
       o.valor_estimado,
       o.estatus,
       o.created_at
  from public.oportunidades o
  join public.clientes c on c.id = o.cliente_id
  join public.usuarios u on u.id = o.agente_id;

grant select on public.v_agentes_publico       to anon, authenticated;
grant select on public.v_resumen_agente        to authenticated;
grant select on public.v_citas_detalle         to authenticated;
grant select on public.v_polizas_detalle       to authenticated;
grant select on public.v_oportunidades_detalle to authenticated;
