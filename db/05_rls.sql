-- ============================================================================
-- 05_rls.sql — Row Level Security
--
-- Aquí conviven dos mundos:
--
--   PÚBLICO (rol `anon`, sin sesión) — el visitante del sitio.
--     Lee agentes visibles, sus fotos, ramos, disponibilidad y reseñas
--     aprobadas. Puede INSERTAR citas, reseñas y postulaciones.
--     NO lee `citas` jamás. Ver el bloque de citas más abajo.
--
--   CON SESIÓN (rol `authenticated`) — Director y Agente.
--     Agente: lee y escribe solo lo suyo.
--     Director: lee todo su equipo, administra agentes y modera reseñas.
--
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: ¿este agente es visible para el público?
-- Se usa en las policies anónimas de fotos, ramos, disponibilidad y reseñas.
-- ---------------------------------------------------------------------------
create or replace function public.agente_publico(p_agente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.agentes a
     where a.id = p_agente_id
       and a.activo and not a.hidden and not a.suspended
  );
$$;

grant execute on function public.agente_publico(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Permisos de tabla. El RLS filtra filas, pero primero hay que poder tocarlas.
-- ---------------------------------------------------------------------------
grant select on public.agentes, public.fotos, public.ramos_agente,
                public.disponibilidad, public.resenas to anon, authenticated;
grant insert on public.citas, public.resenas, public.postulaciones to anon, authenticated;
grant select, insert, update, delete on
  public.usuarios, public.citas, public.postulaciones, public.resenas_clientes,
  public.clientes, public.polizas, public.actividad, public.oportunidades,
  public.codigos_referido, public.referidos to authenticated;
grant insert, update, delete on
  public.agentes, public.fotos, public.ramos_agente, public.disponibilidad to authenticated;
grant update on public.resenas to authenticated;

alter table public.usuarios         enable row level security;
alter table public.agentes          enable row level security;
alter table public.fotos            enable row level security;
alter table public.ramos_agente     enable row level security;
alter table public.disponibilidad   enable row level security;
alter table public.citas            enable row level security;
alter table public.resenas          enable row level security;
alter table public.resenas_clientes enable row level security;
alter table public.postulaciones    enable row level security;
alter table public.clientes         enable row level security;
alter table public.polizas          enable row level security;
alter table public.actividad        enable row level security;
alter table public.oportunidades    enable row level security;
alter table public.codigos_referido enable row level security;
alter table public.referidos        enable row level security;

-- ============================================================================
-- PÚBLICO
-- ============================================================================

-- El directorio: solo agentes activos, no ocultos y no suspendidos.
drop policy if exists agentes_publico on public.agentes;
create policy agentes_publico on public.agentes
  for select to anon, authenticated
  using (activo and not hidden and not suspended);

-- Galería: solo el contenido marcado como `perfil`. Lo de `redes` es material
-- de trabajo del agente, no va al sitio.
drop policy if exists fotos_publico on public.fotos;
create policy fotos_publico on public.fotos
  for select to anon, authenticated
  using (destino = 'perfil' and public.agente_publico(agente_id));

drop policy if exists ramos_publico on public.ramos_agente;
create policy ramos_publico on public.ramos_agente
  for select to anon, authenticated
  using (public.agente_publico(agente_id));

drop policy if exists disponibilidad_publico on public.disponibilidad;
create policy disponibilidad_publico on public.disponibilidad
  for select to anon, authenticated
  using (public.agente_publico(agente_id));

-- Solo reseñas ya aprobadas por el Director.
drop policy if exists resenas_publico on public.resenas;
create policy resenas_publico on public.resenas
  for select to anon, authenticated
  using (aprobada);

-- ---------------------------------------------------------------------------
-- Agendar. Cualquiera puede pedir una cita con un agente visible.
--
-- ⚠️ NO existe ninguna policy de SELECT sobre `citas` para `anon`, y no debe
-- crearse. La tabla guarda nombre, WhatsApp y correo de personas sin cuenta:
-- una policy de lectura anónima aquí publica el directorio de clientes.
-- ---------------------------------------------------------------------------
drop policy if exists citas_insert_publico on public.citas;
create policy citas_insert_publico on public.citas
  for insert to anon, authenticated
  with check (
    public.agente_publico(agente_id)
    and estado = 'pendiente'          -- nadie se autoconfirma la cita
    and fecha >= current_date
  );

-- Reseñas: entran siempre sin aprobar. El `not aprobada` del check impide que
-- alguien se publique solo mandando `aprobada: true` en el POST.
drop policy if exists resenas_insert_publico on public.resenas;
create policy resenas_insert_publico on public.resenas
  for insert to anon, authenticated
  with check (not aprobada and public.agente_publico(agente_id));

drop policy if exists postulaciones_insert_publico on public.postulaciones;
create policy postulaciones_insert_publico on public.postulaciones
  for insert to anon, authenticated
  with check (estado = 'nueva');

-- ============================================================================
-- CON SESIÓN
-- ============================================================================

-- ---------------------------------------------------------------------------
-- usuarios
-- ---------------------------------------------------------------------------
drop policy if exists usuarios_select on public.usuarios;
create policy usuarios_select on public.usuarios
  for select to authenticated
  using (id = public.mi_usuario_id() or director_id = public.mi_usuario_id());

drop policy if exists usuarios_insert_director on public.usuarios;
create policy usuarios_insert_director on public.usuarios
  for insert to authenticated
  with check (
    public.mi_rol() = 'director'
    and rol = 'agente'
    and director_id = public.mi_usuario_id()
  );

drop policy if exists usuarios_update on public.usuarios;
create policy usuarios_update on public.usuarios
  for update to authenticated
  using (id = public.mi_usuario_id()
         or (public.mi_rol() = 'director' and director_id = public.mi_usuario_id()))
  with check (id = public.mi_usuario_id()
         or (public.mi_rol() = 'director' and director_id = public.mi_usuario_id()));

-- Sin DELETE: las bajas se hacen con activo = false.

-- ---------------------------------------------------------------------------
-- agentes
--
-- El agente edita su propia ficha; el Director administra las de su equipo.
-- Los campos que el agente NO puede tocar (slug, cédula, verificado, plan,
-- hidden, suspended) los protege un trigger en 06_funciones.sql: el RLS filtra
-- filas, no columnas.
-- ---------------------------------------------------------------------------
drop policy if exists agentes_select_sesion on public.agentes;
create policy agentes_select_sesion on public.agentes
  for select to authenticated
  using (public.es_de_mi_equipo(usuario_id));

drop policy if exists agentes_update_propio on public.agentes;
create policy agentes_update_propio on public.agentes
  for update to authenticated
  using (usuario_id = public.mi_usuario_id())
  with check (usuario_id = public.mi_usuario_id());

drop policy if exists agentes_director_all on public.agentes;
create policy agentes_director_all on public.agentes
  for all to authenticated
  using (public.mi_rol() = 'director' and director_id = public.mi_usuario_id())
  with check (public.mi_rol() = 'director' and director_id = public.mi_usuario_id());

-- ---------------------------------------------------------------------------
-- fotos · ramos_agente · disponibilidad
-- El dueño manda sobre lo suyo; el Director mira.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['fotos', 'ramos_agente', 'disponibilidad']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_dueno', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (exists (select 1 from public.agentes a
                        where a.id = agente_id and a.usuario_id = public.mi_usuario_id()))
        with check (exists (select 1 from public.agentes a
                        where a.id = agente_id and a.usuario_id = public.mi_usuario_id()))
    $f$, t || '_dueno', t);

    execute format('drop policy if exists %I on public.%I', t || '_director', t);
    execute format($f$
      create policy %I on public.%I
        for select to authenticated
        using (exists (select 1 from public.agentes a
                        where a.id = agente_id and public.es_de_mi_equipo(a.usuario_id)))
    $f$, t || '_director', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- citas — el agente administra las suyas, el Director ve las del equipo.
-- ---------------------------------------------------------------------------
drop policy if exists citas_agente on public.citas;
create policy citas_agente on public.citas
  for all to authenticated
  using (exists (select 1 from public.agentes a
                  where a.id = agente_id and a.usuario_id = public.mi_usuario_id()))
  with check (exists (select 1 from public.agentes a
                  where a.id = agente_id and a.usuario_id = public.mi_usuario_id()));

drop policy if exists citas_director_select on public.citas;
create policy citas_director_select on public.citas
  for select to authenticated
  using (exists (select 1 from public.agentes a
                  where a.id = agente_id and public.es_de_mi_equipo(a.usuario_id)));

-- ---------------------------------------------------------------------------
-- resenas — el Director modera. El agente lee las suyas y no las toca.
-- ---------------------------------------------------------------------------
drop policy if exists resenas_select_sesion on public.resenas;
create policy resenas_select_sesion on public.resenas
  for select to authenticated
  using (exists (select 1 from public.agentes a
                  where a.id = agente_id and public.es_de_mi_equipo(a.usuario_id)));

drop policy if exists resenas_moderar_director on public.resenas;
create policy resenas_moderar_director on public.resenas
  for update to authenticated
  using (public.mi_rol() = 'director'
         and exists (select 1 from public.agentes a
                      where a.id = agente_id and public.es_de_mi_equipo(a.usuario_id)));

-- ---------------------------------------------------------------------------
-- resenas_clientes — privadas del equipo. Sin acceso anónimo, nunca.
-- ---------------------------------------------------------------------------
drop policy if exists resenas_clientes_dueno on public.resenas_clientes;
create policy resenas_clientes_dueno on public.resenas_clientes
  for all to authenticated
  using (exists (select 1 from public.agentes a
                  where a.id = agente_id and a.usuario_id = public.mi_usuario_id()))
  with check (exists (select 1 from public.agentes a
                  where a.id = agente_id and a.usuario_id = public.mi_usuario_id()));

-- El equipo completo las lee: de eso se trata, de avisarse entre todos.
drop policy if exists resenas_clientes_equipo on public.resenas_clientes;
create policy resenas_clientes_equipo on public.resenas_clientes
  for select to authenticated
  using (exists (select 1 from public.agentes a
                  where a.id = agente_id and public.es_de_mi_equipo(a.usuario_id)));

-- ---------------------------------------------------------------------------
-- postulaciones — las recibe y trabaja el Director.
-- ---------------------------------------------------------------------------
drop policy if exists postulaciones_director on public.postulaciones;
create policy postulaciones_director on public.postulaciones
  for all to authenticated
  using (public.mi_rol() = 'director')
  with check (public.mi_rol() = 'director');

-- ---------------------------------------------------------------------------
-- Cartera: clientes · polizas · actividad · codigos_referido
-- El agente manda sobre lo suyo, el Director solo mira. No puede modificar
-- pólizas de sus agentes: mantiene clara la responsabilidad sobre la cartera.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['clientes', 'polizas', 'actividad', 'codigos_referido']
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_agente_all', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (agente_id = public.mi_usuario_id())
        with check (agente_id = public.mi_usuario_id())
    $f$, t || '_agente_all', t);

    execute format('drop policy if exists %I on public.%I', t || '_director_select', t);
    execute format($f$
      create policy %I on public.%I
        for select to authenticated
        using (public.es_de_mi_equipo(agente_id))
    $f$, t || '_director_select', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Excepción para la importación de cartera (28-jul-2026)
--
-- La regla de arriba deja al Director en solo lectura, a propósito. Pero el
-- equipo llega con su cartera en Excel y quien la carga al arrancar es él: si
-- depende de que cuatro agentes lo hagan cada uno por su lado, no se hace, y
-- sin cartera cargada el CRM no sirve de nada.
--
-- Se abre lo mínimo: puede INSERTAR y ACTUALIZAR clientes y pólizas de su
-- equipo —insertar para la carga inicial, actualizar para reimportar y
-- corregir—, pero NO borrar. Y no se toca `actividad`: el registro de contacto
-- es del agente que lo hizo y nadie más debe escribir ahí en su nombre.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['clientes', 'polizas']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_director_insert', t);
    execute format($f$
      create policy %I on public.%I
        for insert to authenticated
        with check (public.es_de_mi_equipo(agente_id))
    $f$, t || '_director_insert', t);

    execute format('drop policy if exists %I on public.%I', t || '_director_update', t);
    execute format($f$
      create policy %I on public.%I
        for update to authenticated
        using (public.es_de_mi_equipo(agente_id))
        with check (public.es_de_mi_equipo(agente_id))
    $f$, t || '_director_update', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- oportunidades — el agente cambia el estatus, nadie las inserta a mano.
-- Las crea el motor de reglas (06_funciones.sql), que corre como definer.
-- ---------------------------------------------------------------------------
drop policy if exists oportunidades_select on public.oportunidades;
create policy oportunidades_select on public.oportunidades
  for select to authenticated
  using (public.es_de_mi_equipo(agente_id));

drop policy if exists oportunidades_update_agente on public.oportunidades;
create policy oportunidades_update_agente on public.oportunidades
  for update to authenticated
  using (agente_id = public.mi_usuario_id())
  with check (agente_id = public.mi_usuario_id());

-- ---------------------------------------------------------------------------
-- referidos — se resuelven a través del código que los originó.
-- ---------------------------------------------------------------------------
drop policy if exists referidos_agente_all on public.referidos;
create policy referidos_agente_all on public.referidos
  for all to authenticated
  using (exists (select 1 from public.codigos_referido c
                  where c.id = codigo_id and c.agente_id = public.mi_usuario_id()))
  with check (exists (select 1 from public.codigos_referido c
                  where c.id = codigo_id and c.agente_id = public.mi_usuario_id()));

drop policy if exists referidos_director_select on public.referidos;
create policy referidos_director_select on public.referidos
  for select to authenticated
  using (exists (select 1 from public.codigos_referido c
                  where c.id = codigo_id and public.es_de_mi_equipo(c.agente_id)));
