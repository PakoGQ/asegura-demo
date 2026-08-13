-- ============================================================================
-- 99_seed_demo.sql — Datos de prueba (SOLO desarrollo / demo al Director)
--
-- ⚠️  ARCHIVO GENERADO. No editar a mano.
--     Fuente:  tools/agentes_demo.py   (el catálogo de los 30 agentes)
--     Regenerar:  python3 tools/generar_seed.py
--
-- NO correr en producción. Borra y recrea el equipo demo completo.
--
-- Se puede correr TAL CUAL, sin haber creado nada en Authentication: los UUID
-- que no existan entran como NULL. Con eso el sitio público ya muestra los
-- 30 agentes.
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
  u1 uuid; u2 uuid;
  a1 uuid; a2 uuid; a3 uuid; a4 uuid;
  id_cli  uuid;
  vinculos jsonb;
begin
  -- ── Se guardan los accesos ya vinculados ─────────────────────────────────
  -- Este archivo borra y recrea el equipo demo. Sin esto, cada corrida dejaba
  -- a todo el mundo fuera de su panel: la fila se recreaba con el
  -- `auth_user_id` del UUID de ejemplo de arriba, que no existe en auth.users,
  -- así que entraba NULL. El síntoma es desconcertante porque el login sí
  -- funciona —Auth valida la contraseña— pero el panel responde «tu cuenta no
  -- está dada de alta en ningún equipo».
  --
  -- Pasó de verdad el 12-ago-2026, al sembrar los 30 agentes.
  --
  -- Se guarda correo → auth_user_id y se restaura al final. Quien ya tenía
  -- acceso lo conserva; quien no, sigue dependiendo de vincular_director.sql
  -- o vincular_agente.sql, como antes.
  select coalesce(jsonb_object_agg(email, auth_user_id), '{}'::jsonb)
    into vinculos
    from public.usuarios
   where email like '%@demo.mx' and auth_user_id is not null;

  -- ── Limpieza ─────────────────────────────────────────────────────────────
  -- Las tablas de cartera cuelgan de `usuarios` con `on delete restrict`, no
  -- con cascade: borrar un agente que ya tiene pólizas es un accidente, no una
  -- operación normal. Bien puesto para producción, pero obliga a este seed a
  -- barrer en orden inverso de dependencia antes de tocar `usuarios`.
  --
  -- Sin esto, la SEGUNDA corrida falla con
  --   violates foreign key constraint "clientes_agente_id_fkey"
  -- porque la cartera que sembró la primera corrida bloquea el borrado.
  --
  -- Lo de `agentes` hacia abajo (fotos, ramos, disponibilidad, citas, reseñas)
  -- sí va en cascade, así que se va solo al borrar el usuario.
  delete from public.referidos
   where codigo_id in (select cr.id from public.codigos_referido cr
                        join public.usuarios u on u.id = cr.agente_id
                       where u.email like '%@demo.mx');
  delete from public.codigos_referido
   where agente_id in (select id from public.usuarios where email like '%@demo.mx');
  delete from public.oportunidades
   where agente_id in (select id from public.usuarios where email like '%@demo.mx');
  delete from public.actividad
   where agente_id in (select id from public.usuarios where email like '%@demo.mx');
  delete from public.polizas
   where agente_id in (select id from public.usuarios where email like '%@demo.mx');
  delete from public.clientes
   where agente_id in (select id from public.usuarios where email like '%@demo.mx');

  delete from public.usuarios where email like '%@demo.mx';

  -- ── Equipo ───────────────────────────────────────────────────────────────
  -- (select id from auth.users where id = X) devuelve NULL si ese usuario no
  -- existe, en vez de violar la foreign key. Así el seed corre aunque todavía
  -- no hayas creado las cuentas en Authentication: el sitio público solo lee
  -- `agentes`, y el login empieza a funcionar en cuanto pegues los UUID reales.
  insert into public.usuarios (auth_user_id, nombre, email, telefono, rol)
  values ((select id from auth.users where id = uid_director),
          'Luis Lujano', 'director@demo.mx', '+523310000001', 'director')
  returning id into id_dir;

  -- Los 30 agentes del equipo. Solo los cuatro primeros tienen hueco de UUID:
  -- son los únicos pensados para iniciar sesión en el demo.
  insert into public.usuarios (auth_user_id, nombre, email, telefono, rol, director_id) values
    ((select id from auth.users where id = uid_ag1), 'Ana Ramírez', 'ana@demo.mx', '+523310000002', 'agente', id_dir),
    ((select id from auth.users where id = uid_ag2), 'Luis Torres', 'luis@demo.mx', '+523310000003', 'agente', id_dir),
    ((select id from auth.users where id = uid_ag3), 'Sofía Beltrán', 'sofia@demo.mx', '+523310000004', 'agente', id_dir),
    ((select id from auth.users where id = uid_ag4), 'Miguel Aguirre', 'miguel@demo.mx', '+523310000005', 'agente', id_dir),
    (null, 'Carolina Vega', 'carolina.vega@demo.mx', '+523310000006', 'agente', id_dir),
    (null, 'Ricardo Ibarra', 'ricardo.ibarra@demo.mx', '+523310000007', 'agente', id_dir),
    (null, 'Mariana Cordero', 'mariana.cordero@demo.mx', '+523310000008', 'agente', id_dir),
    (null, 'Diego Salcedo', 'diego.salcedo@demo.mx', '+523310000009', 'agente', id_dir),
    (null, 'Valeria Ocampo', 'valeria.ocampo@demo.mx', '+523310000010', 'agente', id_dir),
    (null, 'Emilio Cárdenas', 'emilio.cardenas@demo.mx', '+523310000011', 'agente', id_dir),
    (null, 'Paulina Rentería', 'paulina.renteria@demo.mx', '+523310000012', 'agente', id_dir),
    (null, 'Arturo Lozano', 'arturo.lozano@demo.mx', '+523310000013', 'agente', id_dir),
    (null, 'Sebastián Muñoz', 'sebastian.munoz@demo.mx', '+523310000014', 'agente', id_dir),
    (null, 'Regina Fuentes', 'regina.fuentes@demo.mx', '+523310000015', 'agente', id_dir),
    (null, 'Óscar Villalobos', 'oscar.villalobos@demo.mx', '+523310000016', 'agente', id_dir),
    (null, 'Adriana Solís', 'adriana.solis@demo.mx', '+523310000017', 'agente', id_dir),
    (null, 'Fernanda Cázares', 'fernanda.cazares@demo.mx', '+523310000018', 'agente', id_dir),
    (null, 'Ximena Robles', 'ximena.robles@demo.mx', '+523310000019', 'agente', id_dir),
    (null, 'Alonso Guerra', 'alonso.guerra@demo.mx', '+523310000020', 'agente', id_dir),
    (null, 'Rodrigo Palomar', 'rodrigo.palomar@demo.mx', '+523310000021', 'agente', id_dir),
    (null, 'Daniela Ceballos', 'daniela.ceballos@demo.mx', '+523310000022', 'agente', id_dir),
    (null, 'Claudia Mercado', 'claudia.mercado@demo.mx', '+523310000023', 'agente', id_dir),
    (null, 'Natalia Esquivel', 'natalia.esquivel@demo.mx', '+523310000024', 'agente', id_dir),
    (null, 'Renata Aguilar', 'renata.aguilar@demo.mx', '+523310000025', 'agente', id_dir),
    (null, 'Isabel Navarro', 'isabel.navarro@demo.mx', '+523310000026', 'agente', id_dir),
    (null, 'Gabriela Ponce', 'gabriela.ponce@demo.mx', '+523310000027', 'agente', id_dir),
    (null, 'Andrés Mora', 'andres.mora@demo.mx', '+523310000028', 'agente', id_dir),
    (null, 'Tomás Bribiesca', 'tomas.bribiesca@demo.mx', '+523310000029', 'agente', id_dir),
    (null, 'Lucía Arriaga', 'lucia.arriaga@demo.mx', '+523310000030', 'agente', id_dir),
    (null, 'Javier Zepeda', 'javier.zepeda@demo.mx', '+523310000031', 'agente', id_dir);

  -- ── Se devuelven los accesos que ya existían ─────────────────────────────
  -- Va aquí, antes de las fichas, porque `agentes.usuario_id` ya apunta a
  -- estas filas y así el vínculo está puesto antes de que nadie lo consulte.
  update public.usuarios u
     set auth_user_id = (vinculos ->> u.email)::uuid
   where u.email like '%@demo.mx'
     and u.auth_user_id is null
     and vinculos ? u.email;

  -- ── Fichas públicas ──────────────────────────────────────────────────────
  insert into public.agentes
    (slug, usuario_id, director_id, nombre, cedula, anios_experiencia, titulo,
     descripcion, ciudad, zona, direccion_oficina, lat, lng, cobertura_km,
     whatsapp, email, idiomas, modalidades, disponible, verificado,
     es_destacado, top10, es_nuevo, tags, foto_url)
  values
    ('ana-ramirez',
     (select id from public.usuarios where email = 'ana@demo.mx'),
     id_dir, 'Ana Ramírez', 'A1-448210', 12,
     'Especialista en Gastos Médicos Mayores',
     'Doce años ayudando a familias a entender qué cubre realmente su póliza. Me especializo en gastos médicos y vida; explico sin tecnicismos y acompaño el trámite completo cuando hay siniestro.',
     'Guadalajara', 'Providencia', 'Av. Pablo Neruda 2720',
     20.71, -103.39, 20, '523310000002', 'ana@demo.mx',
     array['Español','Inglés'], array['oficina','domicilio','videollamada'],
     true, true, true, true, false,
     array['Gastos médicos','Vida','Familias'],
     'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('luis-torres',
     (select id from public.usuarios where email = 'luis@demo.mx'),
     id_dir, 'Luis Torres', 'A2-119874', 7,
     'Autos y flotillas empresariales',
     'Atiendo principalmente autos y flotillas. Si tienes más de tres unidades, casi siempre hay una mejor forma de asegurarlas de la que ya tienes contratada.',
     'Guadalajara', 'Chapultepec', 'Av. Chapultepec Sur 480',
     20.68, -103.37, 25, '523310000003', 'luis@demo.mx',
     array['Español'], array['oficina','domicilio'],
     true, true, false, false, false,
     array['Auto','Flotillas','Empresarial'],
     'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('sofia-beltran',
     (select id from public.usuarios where email = 'sofia@demo.mx'),
     id_dir, 'Sofía Beltrán', 'A1-772305', 15,
     'Seguros empresariales y fianzas',
     'Quince años en el ramo empresarial. Trabajo con constructoras y transportistas: responsabilidad civil, fianzas de cumplimiento y coberturas de flotilla.',
     'Zapopan', 'Andares', 'Blvd. Puerta de Hierro 5153',
     20.71, -103.416, 30, '523310000004', 'sofia@demo.mx',
     array['Español','Inglés'], array['oficina','videollamada'],
     false, true, true, false, false,
     array['Empresarial','Fianzas','Transporte'],
     'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('miguel-aguirre',
     (select id from public.usuarios where email = 'miguel@demo.mx'),
     id_dir, 'Miguel Aguirre', 'A1-905611', 3,
     'Vida y ahorro educativo',
     'Me enfoco en planes de vida y ahorro para la universidad de los hijos. Explico los números completos, incluyendo lo que no conviene.',
     'Tlaquepaque', 'Tlaquepaque', 'Av. Niños Héroes 2984',
     20.64, -103.312, 15, '523310000005', 'miguel@demo.mx',
     array['Español'], array['oficina','domicilio','videollamada','cafe'],
     true, false, false, false, true,
     array['Vida','Educativo','Ahorro'],
     'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('carolina-vega',
     (select id from public.usuarios where email = 'carolina.vega@demo.mx'),
     id_dir, 'Carolina Vega', 'A1-512044', 9,
     'Vida, ahorro y retiro',
     'Trabajo planes de vida con componente de ahorro. Me tomo dos sesiones antes de proponer nada: primero entender en qué gastas, luego cuánto puedes apartar sin que te duela.',
     'Guadalajara', 'Providencia', 'Av. Rubén Darío 1189',
     20.706, -103.384, 18, '523310000006', 'carolina.vega@demo.mx',
     array['Español','Inglés'], array['oficina','videollamada'],
     true, true, true, true, false,
     array['Vida','Retiro','Ahorro'],
     'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('ricardo-ibarra',
     (select id from public.usuarios where email = 'ricardo.ibarra@demo.mx'),
     id_dir, 'Ricardo Ibarra', 'A2-238190', 6,
     'Auto y hogar para familias',
     'Autos y casa, que es lo que casi todos necesitan primero. Contesto WhatsApp el mismo día y te acompaño si chocas, aunque sea domingo.',
     'Zapopan', 'Zapopan', 'Av. Patria 1950',
     20.7284, -103.3968, 22, '523310000007', 'ricardo.ibarra@demo.mx',
     array['Español'], array['oficina','domicilio','videollamada'],
     true, true, false, false, false,
     array['Auto','Hogar','Respuesta rápida'],
     'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('mariana-cordero',
     (select id from public.usuarios where email = 'mariana.cordero@demo.mx'),
     id_dir, 'Mariana Cordero', 'A1-667320', 11,
     'Gastos médicos y seguros de vida',
     'Me especializo en gastos médicos mayores para personas con preexistencias, que es donde más gente se queda fuera. Reviso caso por caso qué aseguradora acepta qué.',
     'Guadalajara', 'Centro', 'Av. Juárez 340',
     20.6817, -103.3435, 16, '523310000008', 'mariana.cordero@demo.mx',
     array['Español','Inglés'], array['oficina','domicilio','videollamada'],
     true, true, true, false, false,
     array['Gastos médicos','Preexistencias','Vida'],
     'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('diego-salcedo',
     (select id from public.usuarios where email = 'diego.salcedo@demo.mx'),
     id_dir, 'Diego Salcedo', 'A2-401558', 5,
     'Autos, motos y seguro de vida',
     'Autos y motos, incluyendo lo que casi nadie quiere asegurar: repartidores y motociclistas. También armo coberturas de vida para quien trabaja por su cuenta.',
     'Guadalajara', 'Chapultepec', 'Av. México 2790',
     20.674, -103.373, 20, '523310000009', 'diego.salcedo@demo.mx',
     array['Español'], array['oficina','domicilio','cafe'],
     true, true, false, false, false,
     array['Auto','Motos','Trabajo independiente'],
     'https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('valeria-ocampo',
     (select id from public.usuarios where email = 'valeria.ocampo@demo.mx'),
     id_dir, 'Valeria Ocampo', 'A1-780412', 8,
     'Gastos médicos y plan educativo',
     'Atiendo sobre todo a familias jóvenes: el primer seguro de gastos médicos y el plan de la universidad de los niños. Trabajo mucho por videollamada porque sé lo que es tener bebés en casa.',
     'Zapopan', 'Andares', 'Av. Acueducto 6050',
     20.713, -103.411, 24, '523310000010', 'valeria.ocampo@demo.mx',
     array['Español','Inglés'], array['oficina','videollamada','domicilio'],
     true, true, false, true, false,
     array['Gastos médicos','Educativo','Familias jóvenes'],
     'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('emilio-cardenas',
     (select id from public.usuarios where email = 'emilio.cardenas@demo.mx'),
     id_dir, 'Emilio Cárdenas', 'A1-334907', 13,
     'Responsabilidad civil y fianzas',
     'Empresarial y fianzas. Trabajo con despachos, constructoras y proveedores de gobierno que necesitan fianza de cumplimiento y no saben por dónde empezar.',
     'Guadalajara', 'Providencia', 'Av. Américas 1545',
     20.716, -103.394, 28, '523310000011', 'emilio.cardenas@demo.mx',
     array['Español','Inglés'], array['oficina','videollamada'],
     true, true, true, false, false,
     array['Empresarial','Fianzas','Licitaciones'],
     'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('paulina-renteria',
     (select id from public.usuarios where email = 'paulina.renteria@demo.mx'),
     id_dir, 'Paulina Rentería', 'A2-556183', 4,
     'Vida y protección del hogar',
     'Seguros de vida y de casa habitación. Me gusta el trabajo de revisar pólizas viejas: casi siempre están mal aseguradas, por arriba o por abajo.',
     'Zapopan', 'Zapopan', 'Av. Vallarta 6503',
     20.7164, -103.3848, 18, '523310000012', 'paulina.renteria@demo.mx',
     array['Español'], array['oficina','domicilio','videollamada'],
     true, true, false, false, false,
     array['Vida','Hogar','Revisión de póliza'],
     'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('arturo-lozano',
     (select id from public.usuarios where email = 'arturo.lozano@demo.mx'),
     id_dir, 'Arturo Lozano', 'A1-102776', 28,
     'Empresarial, flotillas y patrimonio',
     'Veintiocho años en el ramo. He visto tres crisis y sé qué pólizas aguantan y cuáles no. Atiendo empresas medianas y patrimonios familiares.',
     'Guadalajara', 'Centro', 'Av. 16 de Septiembre 730',
     20.6807, -103.3535, 35, '523310000013', 'arturo.lozano@demo.mx',
     array['Español','Inglés'], array['oficina','domicilio','videollamada'],
     true, true, true, true, false,
     array['Empresarial','Patrimonio','Experiencia'],
     'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('sebastian-munoz',
     (select id from public.usuarios where email = 'sebastian.munoz@demo.mx'),
     id_dir, 'Sebastián Muñoz', 'A2-889021', 2,
     'Auto y hogar',
     'Llevo dos años en esto y me tomo el tiempo que otros ya no tienen. Si es tu primer seguro, te explico desde qué significa deducible.',
     'Tlaquepaque', 'Tlaquepaque', 'Av. Río Nilo 8020',
     20.646, -103.308, 15, '523310000014', 'sebastian.munoz@demo.mx',
     array['Español'], array['oficina','domicilio','cafe','videollamada'],
     true, false, false, false, true,
     array['Auto','Hogar','Primer seguro'],
     'https://images.unsplash.com/photo-1552374196-c4e7ffc6e126?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('regina-fuentes',
     (select id from public.usuarios where email = 'regina.fuentes@demo.mx'),
     id_dir, 'Regina Fuentes', 'A1-445902', 6,
     'Plan educativo y seguro de vida',
     'Planes educativos, sobre todo. Me buscan papás que quieren asegurar la universidad de sus hijos y no saben si les conviene un seguro o una inversión. Les enseño las dos cuentas.',
     'Tlajomulco', 'Tlajomulco', 'Av. Adolf Horn 6800',
     20.4786, -103.4413, 25, '523310000015', 'regina.fuentes@demo.mx',
     array['Español'], array['oficina','domicilio','videollamada'],
     true, true, false, false, false,
     array['Educativo','Vida','Ahorro'],
     'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('oscar-villalobos',
     (select id from public.usuarios where email = 'oscar.villalobos@demo.mx'),
     id_dir, 'Óscar Villalobos', 'A2-673140', 10,
     'Flotillas y transporte de carga',
     'Flotillas y transporte de carga. Si mueves mercancía, el seguro de la unidad es la mitad del problema: falta la carga, la responsabilidad civil y el conductor.',
     'Zapopan', 'Zapopan', 'Periférico Norte 1550',
     20.7184, -103.3988, 40, '523310000016', 'oscar.villalobos@demo.mx',
     array['Español'], array['oficina','domicilio'],
     false, true, false, false, false,
     array['Flotillas','Transporte','Carga'],
     'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('adriana-solis',
     (select id from public.usuarios where email = 'adriana.solis@demo.mx'),
     id_dir, 'Adriana Solís', 'A1-208855', 22,
     'Gastos médicos mayores y vida',
     'Veintidós años en gastos médicos. Conozco los hospitales, a los médicos y los procesos de cada aseguradora. Cuando hay un siniestro grave, eso es lo que hace la diferencia.',
     'Guadalajara', 'Providencia', 'Av. Providencia 2801',
     20.717, -103.387, 22, '523310000017', 'adriana.solis@demo.mx',
     array['Español','Inglés'], array['oficina','domicilio','videollamada'],
     true, true, true, true, false,
     array['Gastos médicos','Vida','Experiencia'],
     'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('fernanda-cazares',
     (select id from public.usuarios where email = 'fernanda.cazares@demo.mx'),
     id_dir, 'Fernanda Cázares', 'A1-591274', 9,
     'Seguros para PyME',
     'Empresarial para negocios chicos: la papelería, el restaurante, el consultorio. Coberturas que sí caben en el presupuesto de una empresa de diez personas.',
     'Zapopan', 'Andares', 'Av. Real Acueducto 360',
     20.706, -103.421, 26, '523310000018', 'fernanda.cazares@demo.mx',
     array['Español','Inglés'], array['oficina','videollamada','domicilio'],
     true, true, false, false, false,
     array['PyME','Empresarial','Gastos médicos'],
     'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('ximena-robles',
     (select id from public.usuarios where email = 'ximena.robles@demo.mx'),
     id_dir, 'Ximena Robles', 'A2-712638', 5,
     'Hogar y automóvil',
     'Casa habitación y auto. Me tocó vivir una inundación en 2019 y desde entonces reviso con lupa las coberturas de fenómenos hidrometeorológicos, que casi nadie lee.',
     'Guadalajara', 'Centro', 'Calle Pedro Moreno 1250',
     20.6717, -103.3415, 17, '523310000019', 'ximena.robles@demo.mx',
     array['Español'], array['oficina','domicilio','cafe'],
     true, true, false, false, false,
     array['Hogar','Auto','Fenómenos naturales'],
     'https://images.unsplash.com/photo-1580894732444-8ecded7900cd?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('alonso-guerra',
     (select id from public.usuarios where email = 'alonso.guerra@demo.mx'),
     id_dir, 'Alonso Guerra', 'A2-940517', 3,
     'Vida y ahorro para jóvenes profesionistas',
     'Trabajo con gente de mi generación: primer trabajo formal, primer seguro, primeras ganas de ahorrar. Sin discursos de miedo.',
     'Guadalajara', 'Chapultepec', 'Av. La Paz 1740',
     20.684, -103.365, 16, '523310000020', 'alonso.guerra@demo.mx',
     array['Español','Inglés'], array['cafe','videollamada','oficina'],
     true, true, false, false, true,
     array['Vida','Ahorro','Jóvenes'],
     'https://images.unsplash.com/photo-1584999734482-0361aecad844?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('rodrigo-palomar',
     (select id from public.usuarios where email = 'rodrigo.palomar@demo.mx'),
     id_dir, 'Rodrigo Palomar', 'A1-160349', 17,
     'Fianzas y riesgos empresariales',
     'Diecisiete años en fianzas: cumplimiento, anticipo, vicios ocultos y judiciales. Trabajo con constructoras y con proveedores del sector público.',
     'Zapopan', 'Andares', 'Blvd. Puerta de Hierro 5210',
     20.704, -103.413, 32, '523310000021', 'rodrigo.palomar@demo.mx',
     array['Español','Inglés'], array['oficina','videollamada'],
     true, true, true, false, false,
     array['Fianzas','Construcción','Sector público'],
     'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('daniela-ceballos',
     (select id from public.usuarios where email = 'daniela.ceballos@demo.mx'),
     id_dir, 'Daniela Ceballos', 'A2-627450', 4,
     'Auto y casa habitación',
     'Autos y casa. Trabajo mucho con mujeres que compran su primer coche o su primer departamento y no quieren que las traten como si no entendieran.',
     'Tlaquepaque', 'Tlaquepaque', 'Calz. Revolución 1450',
     20.645, -103.316, 18, '523310000022', 'daniela.ceballos@demo.mx',
     array['Español'], array['oficina','domicilio','videollamada','cafe'],
     true, true, false, false, false,
     array['Auto','Hogar','Primer patrimonio'],
     'https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('claudia-mercado',
     (select id from public.usuarios where email = 'claudia.mercado@demo.mx'),
     id_dir, 'Claudia Mercado', 'A1-483726', 7,
     'Gastos médicos y hogar',
     'Gastos médicos para familias y adultos mayores, que es donde las pólizas se ponen caras y hay que saber comparar. También aseguro casas.',
     'Zapopan', 'Zapopan', 'Av. Aviación 4050',
     20.7244, -103.3858, 20, '523310000023', 'claudia.mercado@demo.mx',
     array['Español'], array['oficina','domicilio','videollamada'],
     true, true, false, false, false,
     array['Gastos médicos','Adultos mayores','Hogar'],
     'https://images.unsplash.com/photo-1546961329-78bef0414d7c?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('natalia-esquivel',
     (select id from public.usuarios where email = 'natalia.esquivel@demo.mx'),
     id_dir, 'Natalia Esquivel', 'A1-357291', 10,
     'Vida y gastos médicos',
     'Vida y gastos médicos. Me interesa mucho la parte de sucesión: que el dinero llegue a quien tiene que llegar, sin pleitos ni trámites eternos.',
     'Guadalajara', 'Providencia', 'Av. Terranova 1088',
     20.705, -103.396, 21, '523310000024', 'natalia.esquivel@demo.mx',
     array['Español','Inglés'], array['oficina','videollamada','domicilio'],
     true, true, false, true, false,
     array['Vida','Sucesión','Gastos médicos'],
     'https://images.unsplash.com/photo-1607746882042-944635dfe10e?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('renata-aguilar',
     (select id from public.usuarios where email = 'renata.aguilar@demo.mx'),
     id_dir, 'Renata Aguilar', 'A2-802914', 5,
     'Plan educativo y protección familiar',
     'Planes educativos y seguros de vida para papás jóvenes. Hago la cuenta de cuánto cuesta realmente una carrera dentro de quince años, que es el número que a nadie le gusta ver.',
     'Guadalajara', 'Centro', 'Av. Alcalde 890',
     20.6827, -103.3525, 19, '523310000025', 'renata.aguilar@demo.mx',
     array['Español'], array['oficina','videollamada','domicilio','cafe'],
     true, true, false, false, false,
     array['Educativo','Vida','Familias'],
     'https://images.unsplash.com/photo-1554151228-14d9def656e4?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('isabel-navarro',
     (select id from public.usuarios where email = 'isabel.navarro@demo.mx'),
     id_dir, 'Isabel Navarro', 'A2-119503', 6,
     'Auto y seguro de vida',
     'Autos y vida en la zona sur. Vivo en Tlajomulco, así que si hay un siniestro por acá llego en veinte minutos.',
     'Tlajomulco', 'Tlajomulco', 'Av. López Mateos Sur 6900',
     20.4676, -103.4503, 22, '523310000026', 'isabel.navarro@demo.mx',
     array['Español'], array['oficina','domicilio','videollamada'],
     true, true, false, false, false,
     array['Auto','Vida','Zona sur'],
     'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('gabriela-ponce',
     (select id from public.usuarios where email = 'gabriela.ponce@demo.mx'),
     id_dir, 'Gabriela Ponce', 'A1-742086', 8,
     'Hogar, vida y responsabilidad civil',
     'Casa habitación y responsabilidad civil familiar, que es la cobertura más barata y la que menos gente contrata. También seguros de vida.',
     'Tlaquepaque', 'Tlaquepaque', 'Av. Niños Héroes 3120',
     20.636, -103.305, 17, '523310000027', 'gabriela.ponce@demo.mx',
     array['Español'], array['oficina','domicilio','videollamada'],
     true, true, false, false, false,
     array['Hogar','Responsabilidad civil','Vida'],
     'https://images.unsplash.com/photo-1611432579699-484f7990b127?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('andres-mora',
     (select id from public.usuarios where email = 'andres.mora@demo.mx'),
     id_dir, 'Andrés Mora', 'A2-295640', 11,
     'Auto, flotillas y negocio',
     'Autos particulares y flotillas medianas. Llevo once años y sigo haciendo lo mismo: cotizo con varias aseguradoras y te enseño las tres opciones, no solo la que más me conviene.',
     'Zapopan', 'Zapopan', 'Av. Guadalupe 5250',
     20.7274, -103.3948, 27, '523310000028', 'andres.mora@demo.mx',
     array['Español'], array['oficina','domicilio','videollamada'],
     true, true, false, false, false,
     array['Auto','Flotillas','Comparativo'],
     'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('tomas-bribiesca',
     (select id from public.usuarios where email = 'tomas.bribiesca@demo.mx'),
     id_dir, 'Tomás Bribiesca', 'A2-508371', 3,
     'Auto y hogar en el Centro',
     'Atiendo el Centro y la zona Olímpica. Autos, casa y lo básico de vida. Voy a donde estés: local, casa o café.',
     'Guadalajara', 'Centro', 'Calle Colón 415',
     20.6697, -103.3445, 14, '523310000029', 'tomas.bribiesca@demo.mx',
     array['Español'], array['domicilio','cafe','oficina'],
     false, false, false, false, true,
     array['Auto','Hogar','Centro'],
     'https://images.unsplash.com/photo-1595152772835-219674b2a8a6?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('lucia-arriaga',
     (select id from public.usuarios where email = 'lucia.arriaga@demo.mx'),
     id_dir, 'Lucía Arriaga', 'A1-863052', 14,
     'Gastos médicos internacionales',
     'Gastos médicos con cobertura internacional, para quien viaja o tiene familia fuera. También planes educativos con estudios en el extranjero.',
     'Zapopan', 'Andares', 'Av. Patria 2085',
     20.714, -103.422, 30, '523310000030', 'lucia.arriaga@demo.mx',
     array['Español','Inglés','Francés'], array['oficina','videollamada'],
     true, true, true, true, false,
     array['Internacional','Gastos médicos','Educativo'],
     'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=600&h=700&fit=crop&crop=faces&auto=format&q=75'),

    ('javier-zepeda',
     (select id from public.usuarios where email = 'javier.zepeda@demo.mx'),
     id_dir, 'Javier Zepeda', 'A1-674128', 9,
     'Empresarial y flotillas corporativas',
     'Riesgos empresariales para empresas medianas: planta, inventario, flotilla y responsabilidad civil, todo en un mismo programa para que no queden huecos entre pólizas.',
     'Guadalajara', 'Providencia', 'Av. Américas 1600',
     20.707, -103.386, 28, '523310000031', 'javier.zepeda@demo.mx',
     array['Español','Inglés'], array['oficina','videollamada','domicilio'],
     true, true, false, false, false,
     array['Empresarial','Flotillas','Programa integral'],
     'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=600&h=700&fit=crop&crop=faces&auto=format&q=75');

  -- ── Ramos que maneja cada uno ────────────────────────────────────────────
  -- Los dos primeros de cada agente son su especialidad; se marcan como
  -- certificados solo si además tiene la cédula verificada.
  insert into public.ramos_agente (agente_id, ramo, es_especialidad, certificado) values
    ((select id from public.agentes where slug = 'ana-ramirez'), 'gastos_medicos', true, true),
    ((select id from public.agentes where slug = 'ana-ramirez'), 'vida', true, true),
    ((select id from public.agentes where slug = 'ana-ramirez'), 'auto', false, false),
    ((select id from public.agentes where slug = 'ana-ramirez'), 'hogar', false, false),
    ((select id from public.agentes where slug = 'luis-torres'), 'auto', true, true),
    ((select id from public.agentes where slug = 'luis-torres'), 'empresarial', true, true),
    ((select id from public.agentes where slug = 'luis-torres'), 'hogar', false, false),
    ((select id from public.agentes where slug = 'sofia-beltran'), 'empresarial', true, true),
    ((select id from public.agentes where slug = 'sofia-beltran'), 'fianzas', true, true),
    ((select id from public.agentes where slug = 'sofia-beltran'), 'auto', false, false),
    ((select id from public.agentes where slug = 'sofia-beltran'), 'gastos_medicos', false, false),
    ((select id from public.agentes where slug = 'miguel-aguirre'), 'vida', true, false),
    ((select id from public.agentes where slug = 'miguel-aguirre'), 'educativo', true, false),
    ((select id from public.agentes where slug = 'miguel-aguirre'), 'gastos_medicos', false, false),
    ((select id from public.agentes where slug = 'carolina-vega'), 'vida', true, true),
    ((select id from public.agentes where slug = 'carolina-vega'), 'educativo', true, true),
    ((select id from public.agentes where slug = 'carolina-vega'), 'gastos_medicos', false, false),
    ((select id from public.agentes where slug = 'ricardo-ibarra'), 'auto', true, true),
    ((select id from public.agentes where slug = 'ricardo-ibarra'), 'hogar', true, true),
    ((select id from public.agentes where slug = 'ricardo-ibarra'), 'vida', false, false),
    ((select id from public.agentes where slug = 'mariana-cordero'), 'gastos_medicos', true, true),
    ((select id from public.agentes where slug = 'mariana-cordero'), 'vida', true, true),
    ((select id from public.agentes where slug = 'mariana-cordero'), 'hogar', false, false),
    ((select id from public.agentes where slug = 'diego-salcedo'), 'auto', true, true),
    ((select id from public.agentes where slug = 'diego-salcedo'), 'vida', true, true),
    ((select id from public.agentes where slug = 'diego-salcedo'), 'gastos_medicos', false, false),
    ((select id from public.agentes where slug = 'valeria-ocampo'), 'gastos_medicos', true, true),
    ((select id from public.agentes where slug = 'valeria-ocampo'), 'educativo', true, true),
    ((select id from public.agentes where slug = 'valeria-ocampo'), 'vida', false, false),
    ((select id from public.agentes where slug = 'emilio-cardenas'), 'empresarial', true, true),
    ((select id from public.agentes where slug = 'emilio-cardenas'), 'fianzas', true, true),
    ((select id from public.agentes where slug = 'emilio-cardenas'), 'auto', false, false),
    ((select id from public.agentes where slug = 'paulina-renteria'), 'vida', true, true),
    ((select id from public.agentes where slug = 'paulina-renteria'), 'hogar', true, true),
    ((select id from public.agentes where slug = 'paulina-renteria'), 'auto', false, false),
    ((select id from public.agentes where slug = 'arturo-lozano'), 'empresarial', true, true),
    ((select id from public.agentes where slug = 'arturo-lozano'), 'auto', true, true),
    ((select id from public.agentes where slug = 'arturo-lozano'), 'hogar', false, false),
    ((select id from public.agentes where slug = 'arturo-lozano'), 'fianzas', false, false),
    ((select id from public.agentes where slug = 'sebastian-munoz'), 'auto', true, false),
    ((select id from public.agentes where slug = 'sebastian-munoz'), 'hogar', true, false),
    ((select id from public.agentes where slug = 'regina-fuentes'), 'educativo', true, true),
    ((select id from public.agentes where slug = 'regina-fuentes'), 'vida', true, true),
    ((select id from public.agentes where slug = 'regina-fuentes'), 'gastos_medicos', false, false),
    ((select id from public.agentes where slug = 'oscar-villalobos'), 'auto', true, true),
    ((select id from public.agentes where slug = 'oscar-villalobos'), 'empresarial', true, true),
    ((select id from public.agentes where slug = 'oscar-villalobos'), 'fianzas', false, false),
    ((select id from public.agentes where slug = 'adriana-solis'), 'gastos_medicos', true, true),
    ((select id from public.agentes where slug = 'adriana-solis'), 'vida', true, true),
    ((select id from public.agentes where slug = 'adriana-solis'), 'educativo', false, false),
    ((select id from public.agentes where slug = 'fernanda-cazares'), 'empresarial', true, true),
    ((select id from public.agentes where slug = 'fernanda-cazares'), 'gastos_medicos', true, true),
    ((select id from public.agentes where slug = 'fernanda-cazares'), 'hogar', false, false),
    ((select id from public.agentes where slug = 'fernanda-cazares'), 'fianzas', false, false),
    ((select id from public.agentes where slug = 'ximena-robles'), 'hogar', true, true),
    ((select id from public.agentes where slug = 'ximena-robles'), 'auto', true, true),
    ((select id from public.agentes where slug = 'ximena-robles'), 'vida', false, false),
    ((select id from public.agentes where slug = 'alonso-guerra'), 'vida', true, true),
    ((select id from public.agentes where slug = 'alonso-guerra'), 'educativo', true, true),
    ((select id from public.agentes where slug = 'alonso-guerra'), 'auto', false, false),
    ((select id from public.agentes where slug = 'rodrigo-palomar'), 'fianzas', true, true),
    ((select id from public.agentes where slug = 'rodrigo-palomar'), 'empresarial', true, true),
    ((select id from public.agentes where slug = 'rodrigo-palomar'), 'auto', false, false),
    ((select id from public.agentes where slug = 'daniela-ceballos'), 'auto', true, true),
    ((select id from public.agentes where slug = 'daniela-ceballos'), 'hogar', true, true),
    ((select id from public.agentes where slug = 'daniela-ceballos'), 'vida', false, false),
    ((select id from public.agentes where slug = 'claudia-mercado'), 'gastos_medicos', true, true),
    ((select id from public.agentes where slug = 'claudia-mercado'), 'hogar', true, true),
    ((select id from public.agentes where slug = 'claudia-mercado'), 'vida', false, false),
    ((select id from public.agentes where slug = 'natalia-esquivel'), 'vida', true, true),
    ((select id from public.agentes where slug = 'natalia-esquivel'), 'gastos_medicos', true, true),
    ((select id from public.agentes where slug = 'natalia-esquivel'), 'educativo', false, false),
    ((select id from public.agentes where slug = 'renata-aguilar'), 'educativo', true, true),
    ((select id from public.agentes where slug = 'renata-aguilar'), 'vida', true, true),
    ((select id from public.agentes where slug = 'renata-aguilar'), 'gastos_medicos', false, false),
    ((select id from public.agentes where slug = 'isabel-navarro'), 'auto', true, true),
    ((select id from public.agentes where slug = 'isabel-navarro'), 'vida', true, true),
    ((select id from public.agentes where slug = 'isabel-navarro'), 'hogar', false, false),
    ((select id from public.agentes where slug = 'gabriela-ponce'), 'hogar', true, true),
    ((select id from public.agentes where slug = 'gabriela-ponce'), 'vida', true, true),
    ((select id from public.agentes where slug = 'gabriela-ponce'), 'auto', false, false),
    ((select id from public.agentes where slug = 'andres-mora'), 'auto', true, true),
    ((select id from public.agentes where slug = 'andres-mora'), 'empresarial', true, true),
    ((select id from public.agentes where slug = 'andres-mora'), 'hogar', false, false),
    ((select id from public.agentes where slug = 'tomas-bribiesca'), 'auto', true, false),
    ((select id from public.agentes where slug = 'tomas-bribiesca'), 'hogar', true, false),
    ((select id from public.agentes where slug = 'tomas-bribiesca'), 'vida', false, false),
    ((select id from public.agentes where slug = 'lucia-arriaga'), 'gastos_medicos', true, true),
    ((select id from public.agentes where slug = 'lucia-arriaga'), 'educativo', true, true),
    ((select id from public.agentes where slug = 'lucia-arriaga'), 'vida', false, false),
    ((select id from public.agentes where slug = 'javier-zepeda'), 'empresarial', true, true),
    ((select id from public.agentes where slug = 'javier-zepeda'), 'auto', true, true),
    ((select id from public.agentes where slug = 'javier-zepeda'), 'fianzas', false, false),
    ((select id from public.agentes where slug = 'javier-zepeda'), 'hogar', false, false);

  -- ── Disponibilidad: próximos 30 días para quien está disponible ──────────
  -- UNA FILA POR HORA, no un rango ancho por día.
  --
  -- Antes esto insertaba una sola fila de 09:00 a 18:00 por día. La rejilla del
  -- panel guarda franjas de una hora y las lee comparando `hora_ini` exacto, así
  -- que de ese rango ancho solo reconocía la casilla de las 9 y mostraba el
  -- resto del día cerrado. Dos granularidades en la misma tabla no se pueden
  -- leer con la misma consulta.
  --
  -- El contrato queda: una fila = una hora, `hora_fin` = `hora_ini` + 1 hora.
  -- Las horas son las mismas que ofrece la rejilla (HORAS_AGENDA en app.js);
  -- si se cambian allá, hay que cambiarlas aquí.
  insert into public.disponibilidad (agente_id, fecha, hora_ini, hora_fin, disponible)
  select ag.id, d.fecha, h.hora, h.hora + interval '1 hour', true
    from public.agentes ag
    cross join (select generate_series(current_date, current_date + 30, '1 day')::date as fecha) d
    cross join (select unnest(array['09:00','10:00','11:00','12:00','13:00',
                                    '16:00','17:00','18:00']::time[]) as hora) h
   where ag.slug in ('ana-ramirez', 'luis-torres', 'miguel-aguirre', 'carolina-vega', 'ricardo-ibarra', 'mariana-cordero', 'diego-salcedo', 'valeria-ocampo', 'emilio-cardenas', 'paulina-renteria', 'arturo-lozano', 'sebastian-munoz', 'regina-fuentes', 'adriana-solis', 'fernanda-cazares', 'ximena-robles', 'alonso-guerra', 'rodrigo-palomar', 'daniela-ceballos', 'claudia-mercado', 'natalia-esquivel', 'renata-aguilar', 'isabel-navarro', 'gabriela-ponce', 'andres-mora', 'lucia-arriaga', 'javier-zepeda')
     and extract(dow from d.fecha) between 1 and 5   -- solo días hábiles
  on conflict do nothing;

  select id into a1 from public.agentes where slug = 'ana-ramirez';
  select id into a2 from public.agentes where slug = 'luis-torres';
  select id into a3 from public.agentes where slug = 'sofia-beltran';
  select id into a4 from public.agentes where slug = 'miguel-aguirre';

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
    ((select id from public.agentes where slug = 'ana-ramirez'), 'Carlos M.', 5,
     'Ana me explicó punto por punto qué cubría y qué no. Es la primera vez que entiendo mi póliza.', true),
    ((select id from public.agentes where slug = 'ana-ramirez'), 'Patricia N.', 5,
     'Me acompañó todo el trámite del siniestro. Contestaba el teléfono a las 10 de la noche.', true),
    ((select id from public.agentes where slug = 'ana-ramirez'), 'Eduardo L.', 4,
     'Muy clara y honesta. Me dijo que no me convenía el plan que yo quería y me explicó por qué.', true),
    ((select id from public.agentes where slug = 'ana-ramirez'), 'Anónimo', 5,
     'Excelente atención, la recomiendo mucho.', false),
    ((select id from public.agentes where slug = 'luis-torres'), 'Héctor V.', 5,
     'Nos reestructuró la flotilla y bajamos 18% la prima con la misma cobertura.', true),
    ((select id from public.agentes where slug = 'luis-torres'), 'Adriana C.', 4,
     'Buen servicio, respondió rápido cada duda.', true),
    ((select id from public.agentes where slug = 'sofia-beltran'), 'Transportes del Bajío', 5,
     'Manejó nuestras fianzas de cumplimiento sin un solo retraso en tres años.', true),
    ((select id from public.agentes where slug = 'miguel-aguirre'), 'Rodrigo P.', 5,
     'Joven pero muy preparado. Me hizo números que nadie me había hecho.', true),
    ((select id from public.agentes where slug = 'miguel-aguirre'), 'Anónimo', 4,
     'Buena asesoría sobre el plan educativo.', false),
    ((select id from public.agentes where slug = 'carolina-vega'), 'Mónica T.', 5,
     'Me hizo ver que estaba pagando de más por una cobertura que no usaba. Ajustamos y ahorro 400 pesos al mes.', true),
    ((select id from public.agentes where slug = 'carolina-vega'), 'Jorge A.', 5,
     'Paciente y clarísima. Me explicó tres veces lo del fondo de ahorro hasta que lo entendí.', true),
    ((select id from public.agentes where slug = 'carolina-vega'), 'Silvia R.', 4,
     'Buen trato. Tardó un poco en mandarme la propuesta pero valió la pena.', true),
    ((select id from public.agentes where slug = 'carolina-vega'), 'Néstor B.', 5,
     'La recomendé con mi hermano y también quedó contento.', true),
    ((select id from public.agentes where slug = 'ricardo-ibarra'), 'Fabiola M.', 5,
     'Choqué un sábado en la noche y me contestó al segundo timbrazo. Eso vale más que cualquier descuento.', true),
    ((select id from public.agentes where slug = 'ricardo-ibarra'), 'Ignacio P.', 4,
     'Cumplido y derecho. Sin letras chiquitas.', true),
    ((select id from public.agentes where slug = 'ricardo-ibarra'), 'Lorena S.', 5,
     'Nos aseguró la casa y el coche en el mismo trámite. Muy práctico.', true),
    ((select id from public.agentes where slug = 'mariana-cordero'), 'Verónica H.', 5,
     'Tengo diabetes y tres agentes me habían dicho que no era asegurable. Ella encontró la forma.', true),
    ((select id from public.agentes where slug = 'mariana-cordero'), 'Raúl E.', 5,
     'Sabe muchísimo. Le pregunté por deducibles y coaseguros y me explicó con ejemplos de mi propio caso.', true),
    ((select id from public.agentes where slug = 'mariana-cordero'), 'Ana Lucía G.', 5,
     'Excelente. Me acompañó a la cita del hospital para revisar la cobertura.', true),
    ((select id from public.agentes where slug = 'mariana-cordero'), 'Marco A.', 4,
     'Muy buena asesora, aunque cuesta agendar con ella porque siempre está llena.', true),
    ((select id from public.agentes where slug = 'diego-salcedo'), 'Kevin R.', 5,
     'Soy repartidor y nadie me quería asegurar la moto. Diego sí.', true),
    ((select id from public.agentes where slug = 'diego-salcedo'), 'Tania V.', 4,
     'Buena atención y precio justo.', true),
    ((select id from public.agentes where slug = 'valeria-ocampo'), 'Diana C.', 5,
     'Nos atendió por videollamada a las 9 de la noche con el bebé dormido. Muy humana.', true),
    ((select id from public.agentes where slug = 'valeria-ocampo'), 'Alejandro M.', 5,
     'Comparó cuatro planes educativos en una tabla y nos dejó decidir. Cero presión.', true),
    ((select id from public.agentes where slug = 'valeria-ocampo'), 'Brenda L.', 5,
     'Clarísima con los números. Sabe explicar sin marear.', true),
    ((select id from public.agentes where slug = 'emilio-cardenas'), 'Constructora Arjona', 5,
     'Nos sacó la fianza de cumplimiento en cuatro días cuando la licitación cerraba en cinco.', true),
    ((select id from public.agentes where slug = 'emilio-cardenas'), 'Despacho Vera y Asoc.', 5,
     'Serio y bien preparado. Entiende de contratos, no solo de pólizas.', true),
    ((select id from public.agentes where slug = 'emilio-cardenas'), 'Ismael T.', 4,
     'Muy profesional. El trámite tardó pero él estuvo encima todo el tiempo.', true),
    ((select id from public.agentes where slug = 'paulina-renteria'), 'Rosario D.', 5,
     'Revisó la póliza que tenía desde hace ocho años y estaba asegurada por la mitad del valor de mi casa.', true),
    ((select id from public.agentes where slug = 'paulina-renteria'), 'Gerardo N.', 4,
     'Atenta y puntual.', true),
    ((select id from public.agentes where slug = 'arturo-lozano'), 'Grupo Industrial Poniente', 5,
     'Lleva nuestra cuenta desde 2011. Nunca hemos tenido un siniestro mal atendido.', true),
    ((select id from public.agentes where slug = 'arturo-lozano'), 'Rebeca F.', 5,
     'Es de la vieja escuela: te visita, te explica en papel y te llama para recordarte la renovación.', true),
    ((select id from public.agentes where slug = 'arturo-lozano'), 'Martín O.', 5,
     'El mejor asesor con el que he trabajado. Sabe de seguros y sabe de negocios.', true),
    ((select id from public.agentes where slug = 'arturo-lozano'), 'Elena Q.', 4,
     'Muy bueno, aunque no es el más rápido con el WhatsApp. Prefiere el teléfono.', true),
    ((select id from public.agentes where slug = 'arturo-lozano'), 'Hugo S.', 5,
     'Me salvó de una cláusula que me dejaba sin cobertura en el almacén.', true),
    ((select id from public.agentes where slug = 'sebastian-munoz'), 'Cristina B.', 5,
     'Era mi primer seguro de coche y no entendía nada. Me explicó con muchísima paciencia.', true),
    ((select id from public.agentes where slug = 'regina-fuentes'), 'Karla J.', 5,
     'Nos hizo la comparación contra un fondo de inversión sin adornar nada a su favor. Eso me dio confianza.', true),
    ((select id from public.agentes where slug = 'regina-fuentes'), 'Omar P.', 4,
     'Buena asesoría, muy honesta.', true),
    ((select id from public.agentes where slug = 'regina-fuentes'), 'Susana M.', 5,
     'Le agendé por el sitio y me confirmó en menos de una hora.', true),
    ((select id from public.agentes where slug = 'oscar-villalobos'), 'Fletes del Occidente', 5,
     'Aseguró 22 unidades y la carga. Nos ahorró un dineral contra lo que traíamos.', true),
    ((select id from public.agentes where slug = 'oscar-villalobos'), 'Benjamín A.', 4,
     'Sabe mucho de transporte. A veces tarda en contestar pero resuelve.', true),
    ((select id from public.agentes where slug = 'adriana-solis'), 'Guillermo R.', 5,
     'Mi esposa estuvo internada tres semanas. Adriana estuvo en el hospital más veces que algunos familiares.', true),
    ((select id from public.agentes where slug = 'adriana-solis'), 'Norma I.', 5,
     'Sabe exactamente a quién llamar en la aseguradora. Nos autorizaron en horas lo que llevaba días atorado.', true),
    ((select id from public.agentes where slug = 'adriana-solis'), 'Pablo C.', 5,
     'Impecable. Es la asesora que le recomiendo a mi familia.', true),
    ((select id from public.agentes where slug = 'adriana-solis'), 'Lourdes V.', 5,
     'Muchos años de experiencia y se nota en cada respuesta.', true),
    ((select id from public.agentes where slug = 'adriana-solis'), 'Andrés G.', 4,
     'Excelente en lo suyo. Su agenda está muy saturada, hay que planear.', true),
    ((select id from public.agentes where slug = 'fernanda-cazares'), 'Panadería La Espiga', 5,
     'Nos armó una cobertura del local y del equipo por menos de lo que pensábamos.', true),
    ((select id from public.agentes where slug = 'fernanda-cazares'), 'Dr. Everardo N.', 5,
     'Aseguró el consultorio y me incluyó responsabilidad civil profesional. No sabía que existía.', true),
    ((select id from public.agentes where slug = 'fernanda-cazares'), 'Miriam Z.', 4,
     'Muy atenta con las PyMEs, que normalmente no le interesan a nadie.', true),
    ((select id from public.agentes where slug = 'ximena-robles'), 'Teresa L.', 5,
     'Se inundó la planta baja y estábamos cubiertos gracias a que ella insistió en ese endoso.', true),
    ((select id from public.agentes where slug = 'ximena-robles'), 'Roberto M.', 4,
     'Atenta y muy clara.', true),
    ((select id from public.agentes where slug = 'alonso-guerra'), 'Daniel F.', 5,
     'Me explicó el seguro de vida sin el discurso catastrofista de siempre. Muy fresco.', true),
    ((select id from public.agentes where slug = 'alonso-guerra'), 'Ale N.', 5,
     'Nos vimos en un café, súper relajado, y salí con las cosas claras.', true),
    ((select id from public.agentes where slug = 'rodrigo-palomar'), 'Edificaciones del Valle', 5,
     'Tres obras públicas seguidas, tres fianzas sin un solo contratiempo.', true),
    ((select id from public.agentes where slug = 'rodrigo-palomar'), 'Ing. Salvador U.', 5,
     'Domina el tema de fianzas como pocos en Guadalajara.', true),
    ((select id from public.agentes where slug = 'rodrigo-palomar'), 'Grupo Constructor Mendive', 4,
     'Muy competente. El precio no es el más bajo pero el servicio lo justifica.', true),
    ((select id from public.agentes where slug = 'daniela-ceballos'), 'Paola R.', 5,
     'Por fin alguien que me habla a mí y no a mi esposo cuando pregunto por el seguro del coche.', true),
    ((select id from public.agentes where slug = 'daniela-ceballos'), 'Erika T.', 5,
     'Aseguró mi departamento y me explicó cada cobertura. Excelente.', true),
    ((select id from public.agentes where slug = 'daniela-ceballos'), 'Julio C.', 4,
     'Buen servicio y buena disposición.', true),
    ((select id from public.agentes where slug = 'claudia-mercado'), 'Josefina A.', 5,
     'Encontró un plan para mi mamá de 71 años cuando ya nos habíamos resignado.', true),
    ((select id from public.agentes where slug = 'claudia-mercado'), 'Salvador E.', 4,
     'Buena asesora, muy dedicada.', true),
    ((select id from public.agentes where slug = 'claudia-mercado'), 'Cecilia P.', 5,
     'Comparó cinco opciones en una hoja y me dejó escoger con calma.', true),
    ((select id from public.agentes where slug = 'natalia-esquivel'), 'Familia Cuéllar', 5,
     'Cuando falleció mi papá, el pago salió en dos semanas. Ella se encargó de todo el papeleo.', true),
    ((select id from public.agentes where slug = 'natalia-esquivel'), 'Ernesto M.', 5,
     'Me explicó lo de los beneficiarios preferentes, que yo tenía mal puesto desde hacía años.', true),
    ((select id from public.agentes where slug = 'natalia-esquivel'), 'Alicia B.', 5,
     'Muy profesional y muy humana en un tema que no es fácil de hablar.', true),
    ((select id from public.agentes where slug = 'natalia-esquivel'), 'Sergio D.', 4,
     'Buena asesoría. Recomendada.', true),
    ((select id from public.agentes where slug = 'renata-aguilar'), 'Mauricio H.', 5,
     'La proyección que nos hizo nos abrió los ojos. Empezamos a ahorrar ese mismo mes.', true),
    ((select id from public.agentes where slug = 'renata-aguilar'), 'Liliana G.', 4,
     'Muy clara y sin presionar.', true),
    ((select id from public.agentes where slug = 'isabel-navarro'), 'Néstor A.', 5,
     'Vive cerca y de verdad llega. Me acompañó con el ajustador.', true),
    ((select id from public.agentes where slug = 'isabel-navarro'), 'Perla M.', 4,
     'Buena atención, muy accesible.', true),
    ((select id from public.agentes where slug = 'gabriela-ponce'), 'Ramiro V.', 5,
     'Mi perro mordió a un vecino y la responsabilidad civil cubrió todo. Ni sabía que la tenía.', true),
    ((select id from public.agentes where slug = 'gabriela-ponce'), 'Dulce C.', 5,
     'Aseguró la casa completa y me explicó qué pasa en un temblor.', true),
    ((select id from public.agentes where slug = 'gabriela-ponce'), 'Arnulfo P.', 4,
     'Cumplida y clara.', true),
    ((select id from public.agentes where slug = 'andres-mora'), 'Refaccionaria El Tapatío', 5,
     'Nos maneja seis camionetas desde hace años. Cero problemas.', true),
    ((select id from public.agentes where slug = 'andres-mora'), 'Leticia R.', 5,
     'Me enseñó tres cotizaciones distintas sin que se lo pidiera. Muy transparente.', true),
    ((select id from public.agentes where slug = 'andres-mora'), 'Joaquín S.', 4,
     'Buen asesor, siempre disponible.', true),
    ((select id from public.agentes where slug = 'tomas-bribiesca'), 'Marisol E.', 4,
     'Apenas va empezando pero se nota que le echa ganas. Muy atento.', true),
    ((select id from public.agentes where slug = 'lucia-arriaga'), 'Familia Zambrano', 5,
     'Mi hijo estudia en Canadá y su cobertura funcionó sin un solo problema cuando se enfermó.', true),
    ((select id from public.agentes where slug = 'lucia-arriaga'), 'Hilda N.', 5,
     'Domina las pólizas internacionales, que son un mundo aparte.', true),
    ((select id from public.agentes where slug = 'lucia-arriaga'), 'Gonzalo M.', 5,
     'Habla inglés perfecto y eso ayudó muchísimo con la aseguradora extranjera.', true),
    ((select id from public.agentes where slug = 'lucia-arriaga'), 'Verónica S.', 4,
     'Excelente, aunque es de las más solicitadas y hay que esperar.', true),
    ((select id from public.agentes where slug = 'javier-zepeda'), 'Plásticos de Occidente', 5,
     'Unificó siete pólizas dispersas en un solo programa. Encontramos dos huecos de cobertura.', true),
    ((select id from public.agentes where slug = 'javier-zepeda'), 'Lic. Fabián R.', 4,
     'Ordenado y muy metódico. Sabe lo que hace.', true),
    ((select id from public.agentes where slug = 'javier-zepeda'), 'Alma D.', 5,
     'Nos hizo un mapa de riesgos de la planta antes de cotizar. Nadie había hecho eso.', true);

  -- ── Citas históricas de vitrina ──────────────────────────────────────────
  -- `num_citas` es el contador que se enseña en la tarjeta del directorio. No
  -- hay 148 filas en `citas` para Ana: son las citas que ha atendido en su
  -- carrera, no las que viven en esta base. Se fija a mano.
  update public.agentes as ag
     set num_citas = v.n
    from (values ('ana-ramirez', 148), ('luis-torres', 96), ('sofia-beltran', 203), ('miguel-aguirre', 21), ('carolina-vega', 127), ('ricardo-ibarra', 84), ('mariana-cordero', 156), ('diego-salcedo', 67), ('valeria-ocampo', 112), ('emilio-cardenas', 98), ('paulina-renteria', 52), ('arturo-lozano', 312), ('sebastian-munoz', 14), ('regina-fuentes', 61), ('oscar-villalobos', 143), ('adriana-solis', 268), ('fernanda-cazares', 104), ('ximena-robles', 48), ('alonso-guerra', 29), ('rodrigo-palomar', 176), ('daniela-ceballos', 57), ('claudia-mercado', 89), ('natalia-esquivel', 131), ('renata-aguilar', 63), ('isabel-navarro', 44), ('gabriela-ponce', 71), ('andres-mora', 118), ('tomas-bribiesca', 11), ('lucia-arriaga', 187), ('javier-zepeda', 95)) as v(slug, n)
   where ag.slug = v.slug;

  -- ── Cartera (sección interna del Director) ───────────────────────────────
  select id into u1 from public.usuarios where email = 'ana@demo.mx';
  select id into u2 from public.usuarios where email = 'luis@demo.mx';

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
--   select count(*) from public.agentes;                  -- 30
--   select zona, count(*) from public.agentes group by zona order by 2 desc;
--   select slug, calificacion, num_resenas, num_citas from public.agentes
--    order by calificacion desc limit 10;
