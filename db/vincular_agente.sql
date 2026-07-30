-- ============================================================================
-- vincular_agente.sql — Le da acceso a un agente que ya existe como ficha.
--
-- Los 4 agentes del seed tienen su ficha completa pero `auth_user_id` en NULL:
-- existen en el directorio público y nadie puede entrar con ellos. Esto tiende
-- el puente, igual que `vincular_director.sql` hizo con el Director.
--
-- ANTES de correr esto: Authentication → Users → Add user, con el correo y la
-- contraseña que va a usar el agente, y marca "Auto Confirm User".
--
-- Se editan DOS líneas, y son de cosas distintas a propósito:
--   · el correo de Authentication → la credencial
--   · el slug del agente          → a quién se le asigna
-- Ninguna se compara contra un texto centinela: se valida la forma del dato y
-- que exista en la base, porque un buscar-y-reemplazar puede tocar las dos.
-- ============================================================================

do $$
declare
  correo_acceso text := 'TU-CORREO-AQUI';   -- ⬅️ el de Authentication → Users
  slug_agente   text := 'ana-ramirez';      -- ⬅️ a quién se le asigna

  uid_auth  uuid;
  id_us     uuid;
  nombre_ag text;
  ya_tiene  uuid;
begin
  -- 1 · el correo tiene que parecer un correo. Se valida la forma y no un
  --     literal, para que reemplazar de más no rompa la validación.
  if position('@' in correo_acceso) = 0 then
    raise exception
      'Falta editar el correo, o el que pusiste no es válido: "%". Va el que registraste en Authentication → Users.',
      correo_acceso;
  end if;

  -- 2 · la cuenta tiene que existir ya en Authentication
  select id into uid_auth from auth.users where email = correo_acceso;
  if uid_auth is null then
    raise exception
      'No hay ninguna cuenta en Authentication con el correo "%". Créala en Authentication → Users → Add user, marcando "Auto Confirm User", y vuelve a correr esto.',
      correo_acceso;
  end if;

  -- 3 · el agente tiene que existir y tener ficha de usuario
  select a.usuario_id, a.nombre into id_us, nombre_ag
    from public.agentes a where a.slug = slug_agente;
  if nombre_ag is null then
    raise exception
      'No existe ningún agente con el slug "%". Los del seed son: ana-ramirez, luis-torres, sofia-beltran, miguel-aguirre.',
      slug_agente;
  end if;
  if id_us is null then
    raise exception
      'El agente "%" no tiene fila en `usuarios`, así que no hay dónde colgar el acceso. Eso pasa si se creó la ficha a mano sin la persona.',
      nombre_ag;
  end if;

  -- 4 · esa cuenta de Authentication no puede estar ya usada por alguien más.
  --     Sin esta comprobación el update fallaría con un error de índice único
  --     que no dice nada útil: `auth_user_id` es unique en `usuarios`.
  select u.id into ya_tiene from public.usuarios u
   where u.auth_user_id = uid_auth and u.id <> id_us;
  if ya_tiene is not null then
    raise exception
      'La cuenta "%" ya está vinculada a otra persona del equipo. Usa un correo distinto para %.',
      correo_acceso, nombre_ag;
  end if;

  update public.usuarios set auth_user_id = uid_auth where id = id_us;

  raise notice 'Listo: % puede entrar con %.', nombre_ag, correo_acceso;
end $$;


-- Cómo quedó todo el equipo. `puede_entrar` tiene que decir true en el que
-- acabas de vincular. `confirmado` sale de auth.users.email_confirmed_at, que
-- la lista de Authentication no enseña: si es false, se marca en Authentication
-- → Users → los tres puntos de la fila → "Confirm email".
select a.slug,
       a.nombre,
       u.email                          as correo_ficha,
       au.email                         as correo_acceso,
       u.auth_user_id is not null       as puede_entrar,
       au.email_confirmed_at is not null as confirmado
  from public.agentes a
  join public.usuarios u  on u.id = a.usuario_id
  left join auth.users au on au.id = u.auth_user_id
 order by a.nombre;
