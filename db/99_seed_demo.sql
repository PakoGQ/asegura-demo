-- ============================================================================
-- 99_seed_demo.sql — Datos de prueba (SOLO desarrollo / demo al Director)
--
-- NO correr en producción. Borra y recrea el equipo demo completo.
--
-- Se puede correr TAL CUAL, sin haber creado nada en Authentication: los UUID
-- que no existan entran como NULL. Con eso el sitio público ya muestra los
-- cuatro agentes.
--
-- Para que además funcione el LOGIN de esas cuentas: crea los usuarios en
-- Supabase → Authentication → Users, pega sus UUID abajo y vuelve a correr
-- este archivo.
-- ============================================================================

do $$
declare
  -- ⬇️ REEMPLAZAR por los UUID reales de auth.users (o dejar así para ver
  --    únicamente el sitio público, que no necesita sesión).
  uid_director uuid := '00000000-0000-0000-0000-000000000001';
  uid_ag1      uuid := '00000000-0000-0000-0000-000000000002';
  uid_ag2      uuid := '00000000-0000-0000-0000-000000000003';
  uid_ag3      uuid := '00000000-0000-0000-0000-000000000004';
  uid_ag4      uuid := '00000000-0000-0000-0000-000000000005';

  id_dir  uuid;
  u1 uuid; u2 uuid; u3 uuid; u4 uuid;
  a1 uuid; a2 uuid; a3 uuid; a4 uuid;
  id_cli  uuid;
begin
  delete from public.usuarios where email like '%@demo.mx';

  -- ── Equipo ───────────────────────────────────────────────────────────────
  -- (select id from auth.users where id = X) devuelve NULL si ese usuario no
  -- existe, en vez de violar la foreign key. Así el seed corre aunque todavía
  -- no hayas creado las cuentas en Authentication: el sitio público solo lee
  -- `agentes`, y el login empieza a funcionar en cuanto pegues los UUID reales.
  insert into public.usuarios (auth_user_id, nombre, email, telefono, rol)
  values ((select id from auth.users where id = uid_director),
          'Roberto Sandoval', 'director@demo.mx', '+523310000001', 'director')
  returning id into id_dir;

  insert into public.usuarios (auth_user_id, nombre, email, telefono, rol, director_id) values
    ((select id from auth.users where id = uid_ag1), 'Ana Ramírez',    'ana@demo.mx',    '+523310000002', 'agente', id_dir),
    ((select id from auth.users where id = uid_ag2), 'Luis Torres',    'luis@demo.mx',   '+523310000003', 'agente', id_dir),
    ((select id from auth.users where id = uid_ag3), 'Sofía Beltrán',  'sofia@demo.mx',  '+523310000004', 'agente', id_dir),
    ((select id from auth.users where id = uid_ag4), 'Miguel Aguirre', 'miguel@demo.mx', '+523310000005', 'agente', id_dir);

  select id into u1 from public.usuarios where email = 'ana@demo.mx';
  select id into u2 from public.usuarios where email = 'luis@demo.mx';
  select id into u3 from public.usuarios where email = 'sofia@demo.mx';
  select id into u4 from public.usuarios where email = 'miguel@demo.mx';

  -- ── Fichas públicas ──────────────────────────────────────────────────────
  insert into public.agentes
    (slug, usuario_id, director_id, nombre, cedula, anios_experiencia, titulo,
     descripcion, ciudad, zona, direccion_oficina, lat, lng, cobertura_km,
     whatsapp, email, idiomas, modalidades, disponible, verificado,
     es_destacado, top10, es_nuevo, tags, foto_url)
  values
    ('ana-ramirez', u1, id_dir, 'Ana Ramírez', 'A1-448210', 12,
     'Especialista en Gastos Médicos Mayores',
     'Doce años ayudando a familias a entender qué cubre realmente su póliza. Me especializo en gastos médicos y vida; explico sin tecnicismos y acompaño el trámite completo cuando hay siniestro.',
     'Guadalajara', 'Providencia', 'Av. Pablo Neruda 2720, Providencia',
     20.710000, -103.390000, 20, '523310000002', 'ana@demo.mx',
     array['Español','Inglés'], array['oficina','domicilio','videollamada'],
     true, true, true, true, false,
     array['Gastos médicos','Vida','Familias'],
     'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('luis-torres', u2, id_dir, 'Luis Torres', 'A2-119874', 7,
     'Autos y flotillas empresariales',
     'Atiendo principalmente autos y flotillas. Si tienes más de tres unidades, casi siempre hay una mejor forma de asegurarlas de la que ya tienes contratada.',
     'Guadalajara', 'Chapultepec', 'Av. Chapultepec Sur 480',
     20.680000, -103.370000, 25, '523310000003', 'luis@demo.mx',
     array['Español'], array['oficina','domicilio'],
     true, true, false, false, false,
     array['Auto','Flotillas','Empresarial'],
     'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('sofia-beltran', u3, id_dir, 'Sofía Beltrán', 'A1-772305', 15,
     'Seguros empresariales y fianzas',
     'Quince años en el ramo empresarial. Trabajo con constructoras y transportistas: responsabilidad civil, fianzas de cumplimiento y coberturas de flotilla.',
     'Zapopan', 'Andares', 'Blvd. Puerta de Hierro 5153',
     20.710000, -103.416000, 30, '523310000004', 'sofia@demo.mx',
     array['Español','Inglés'], array['oficina','videollamada'],
     false, true, true, false, false,
     array['Empresarial','Fianzas','Transporte'],
     'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('miguel-aguirre', u4, id_dir, 'Miguel Aguirre', 'A1-905611', 3,
     'Vida y ahorro educativo',
     'Me enfoco en planes de vida y ahorro para la universidad de los hijos. Explico los números completos, incluyendo lo que no conviene.',
     'Guadalajara', 'Tlaquepaque', 'Av. Niños Héroes 2984',
     20.640000, -103.312000, 15, '523310000005', 'miguel@demo.mx',
     array['Español'], array['oficina','domicilio','videollamada','cafe'],
     true, false, false, false, true,
     array['Vida','Educativo','Ahorro'],
     'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=700&fit=crop&crop=faces&auto=format&q=75');

  select id into a1 from public.agentes where slug = 'ana-ramirez';
  select id into a2 from public.agentes where slug = 'luis-torres';
  select id into a3 from public.agentes where slug = 'sofia-beltran';
  select id into a4 from public.agentes where slug = 'miguel-aguirre';

  -- ── Ramos que maneja cada uno ────────────────────────────────────────────
  insert into public.ramos_agente (agente_id, ramo, es_especialidad, certificado) values
    (a1, 'gastos_medicos', true,  true), (a1, 'vida', true, true),
    (a1, 'auto', false, false),          (a1, 'hogar', false, false),
    (a2, 'auto', true, true),            (a2, 'empresarial', true, false),
    (a2, 'hogar', false, false),
    (a3, 'empresarial', true, true),     (a3, 'fianzas', true, true),
    (a3, 'auto', false, false),          (a3, 'gastos_medicos', false, false),
    (a4, 'vida', true, true),            (a4, 'educativo', true, true),
    (a4, 'gastos_medicos', false, false);

  -- ── Disponibilidad: próximos 30 días para quien está disponible ──────────
  insert into public.disponibilidad (agente_id, fecha, hora_ini, hora_fin, disponible)
  select ag.id, d.fecha, '09:00'::time, '18:00'::time, true
    from public.agentes ag
    cross join (select generate_series(current_date, current_date + 30, '1 day')::date as fecha) d
   where ag.slug in ('ana-ramirez', 'luis-torres', 'miguel-aguirre')
     and extract(dow from d.fecha) between 1 and 5   -- solo días hábiles
  on conflict do nothing;

  -- ── Citas ────────────────────────────────────────────────────────────────
  insert into public.citas
    (agente_id, cliente_nombre, cliente_whatsapp, modalidad, lugar, fecha, hora,
     ramo_interes, mensaje, estado)
  values
    (a1, 'Carlos Méndez',   '+523311110001', 'oficina',      'Oficina Providencia',
     current_date + 2, '11:00', 'gastos_medicos',
     'Quiero cotizar gastos médicos para mi familia (4 personas).', 'confirmada'),
    (a1, 'Renata Ochoa',    '+523311110002', 'videollamada', null,
     current_date + 4, '16:30', 'vida',
     'Me interesa un seguro de vida, no sé por dónde empezar.', 'pendiente'),
    (a2, 'Grupo Ferretero', '+523311110003', 'domicilio',    'Zona Industrial',
     current_date + 1, '10:00', 'empresarial',
     'Tenemos 8 camionetas de reparto, queremos revisar la flotilla.', 'confirmada'),
    (a4, 'Lucía Guerrero',  '+523311110004', 'cafe',         'Café Centro',
     current_date + 6, '18:00', 'educativo',
     'Plan de ahorro para la universidad de mi hija.', 'pendiente'),
    (a1, 'Jorge Salinas',   '+523311110005', 'oficina',      'Oficina Providencia',
     current_date - 12, '12:00', 'auto', 'Renovación de auto.', 'completada');

  -- ── Reseñas (las aprobadas ya recalculan la calificación por trigger) ────
  insert into public.resenas (agente_id, autor, calificacion, texto, aprobada) values
    (a1, 'Carlos M.',  5, 'Ana me explicó punto por punto qué cubría y qué no. Es la primera vez que entiendo mi póliza.', true),
    (a1, 'Patricia N.',5, 'Me acompañó todo el trámite del siniestro. Contestaba el teléfono a las 10 de la noche.', true),
    (a1, 'Eduardo L.', 4, 'Muy clara y honesta. Me dijo que no me convenía el plan que yo quería y me explicó por qué.', true),
    (a2, 'Héctor V.',  5, 'Nos reestructuró la flotilla y bajamos 18% la prima con la misma cobertura.', true),
    (a2, 'Adriana C.', 4, 'Buen servicio, respondió rápido cada duda.', true),
    (a3, 'Transportes del Bajío', 5, 'Manejó nuestras fianzas de cumplimiento sin un solo retraso en tres años.', true),
    (a4, 'Rodrigo P.', 5, 'Joven pero muy preparado. Me hizo números que nadie me había hecho.', true),
    (a1, 'Anónimo',    5, 'Excelente atención, la recomiendo mucho.', false),
    (a4, 'Anónimo',    4, 'Buena asesoría sobre el plan educativo.', false);

  -- ── Cartera (sección interna del Director) ───────────────────────────────
  insert into public.clientes (agente_id, nombre, telefono, email, fecha_nacimiento)
  values (u1, 'Carlos Méndez', '+523311110001', 'carlos@ejemplo.mx', '1985-03-12')
  returning id into id_cli;

  insert into public.polizas (cliente_id, agente_id, ramo, numero_poliza, prima_anual,
                              comision_pct, fecha_inicio, fecha_vencimiento, forma_pago)
  values (id_cli, u1, 'auto', 'GNP-AU-1001', 18500.00, 12.5,
          current_date - interval '14 months', current_date + interval '45 days', 'anual');

  insert into public.clientes (agente_id, nombre, telefono, email, fecha_nacimiento)
  values (u1, 'María Fernández', '+523311110006', 'maria@ejemplo.mx', '1978-11-02')
  returning id into id_cli;

  insert into public.polizas (cliente_id, agente_id, ramo, numero_poliza, prima_anual,
                              comision_pct, fecha_inicio, fecha_vencimiento, forma_pago)
  values (id_cli, u1, 'vida', 'GNP-VI-2001', 42000.00, 20.0,
          current_date - interval '20 months', current_date + interval '25 days', 'anual');

  insert into public.clientes (agente_id, nombre, telefono, email, fecha_nacimiento)
  values (u2, 'Patricia Núñez', '+523311110007', 'paty@ejemplo.mx', '1982-01-30')
  returning id into id_cli;

  insert into public.polizas (cliente_id, agente_id, ramo, numero_poliza, prima_anual,
                              comision_pct, fecha_inicio, fecha_vencimiento, forma_pago)
  values
    (id_cli, u2, 'auto',  'GNP-AU-4001', 22400.00, 12.5,
     current_date - interval '8 months', current_date + interval '120 days', 'mensual'),
    (id_cli, u2, 'hogar', 'GNP-HO-4002',  9800.00, 10.0,
     current_date - interval '8 months', current_date + interval '120 days', 'anual');

  insert into public.actividad (agente_id, cliente_id, tipo, descripcion, fecha, resultado)
  values (u2, id_cli, 'whatsapp', 'Envío de comprobante de pago', now() - interval '3 days', 'cerrado');

  -- ── Postulaciones pendientes para el panel del Director ──────────────────
  insert into public.postulaciones (nombre, whatsapp, ciudad, cedula, experiencia, ramos, mensaje)
  values
    ('Daniela Ortiz', '+523311112001', 'Guadalajara', 'A1-330012', '4 años',
     array['vida','gastos_medicos'], 'Trabajo por mi cuenta y quiero integrarme a un equipo.'),
    ('Fernando Ruiz', '+523311112002', 'Zapopan', null, 'Sin experiencia',
     array['auto'], 'Voy a presentar el examen de cédula el mes que entra.');
end $$;

-- Genera las oportunidades de cartera sobre los datos recién sembrados.
select public.generar_oportunidades();

-- Verificación rápida:
--   select slug, nombre, zona, calificacion, num_resenas from public.agentes;
--   select tipo, motivo from public.oportunidades;
