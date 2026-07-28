-- ============================================================================
-- vincular_director.sql — Conecta una cuenta de Supabase Auth con la fila del
-- Director en `usuarios`, para poder entrar al panel.
--
-- No es una migración; es un ayudante que se corre a mano cuando hace falta.
-- No lo incluye TODO_EN_UNO.sql.
--
-- Por qué existe: crear el usuario en Authentication y crear su ficha en
-- `usuarios` son dos cosas distintas. Auth guarda el correo y la contraseña;
-- `usuarios` guarda el rol y de quién es el equipo. El puente entre las dos es
-- la columna `auth_user_id`. Sin ese puente el login funciona pero el panel no
-- sabe quién eres y te regresa al inicio.
--
-- Hay DOS correos en juego y no tienen por qué ser el mismo:
--   · el de Authentication  → tu credencial para entrar
--   · director@demo.mx      → el dato de contacto en la fila de `usuarios`
-- Este archivo solo te pide el primero. El segundo no se toca aquí.
-- ============================================================================


-- ── CASO 1 · Director provisional ───────────────────────────────────────────
-- El seed ya dejó la fila de Luis Lujano (director@demo.mx) con `auth_user_id`
-- en NULL: existe, pero nadie puede entrar con ella. Esto le pone dueño.
--
-- Antes de correrlo: Authentication → Users → Add user, con el correo y la
-- contraseña que vayas a usar, y marca "Auto Confirm User".
--
-- El correo va UNA sola vez, en la línea marcada. Antes iba dos veces y las dos
-- líneas se parecían tanto que era natural cambiar ambas; el update entonces no
-- encontraba fila, no fallaba, y dejaba `vinculado` en false sin explicar nada.
-- De ahí que esto sea un bloque con validaciones: si algo no cuadra, truena y
-- te dice exactamente qué falta.

do $$
declare
  mi_correo text := 'TU-CORREO-AQUI';   -- ⬅️⬅️⬅️ LA ÚNICA LÍNEA QUE EDITAS
  uid uuid;
begin
  -- Se valida la FORMA, no un texto centinela. Con un centinela había que
  -- escribirlo dos veces (en el declare y en la comparación) y un
  -- buscar-y-reemplazar cambiaba los dos: la validación pasaba a compararse
  -- contra el correo real y siempre disparaba. Un marcador sin arroba no
  -- necesita repetirse en ningún lado.
  if position('@' in mi_correo) = 0 then
    raise exception
      'Falta editar el correo, o el que pusiste no es válido: "%". Va el que registraste en Authentication → Users, entre comillas simples.',
      mi_correo;
  end if;

  select id into uid from auth.users where email = mi_correo;

  if uid is null then
    raise exception
      'No hay ninguna cuenta en Authentication con el correo "%". Créala en Authentication → Users → Add user (marcando "Auto Confirm User") y vuelve a correr esto.',
      mi_correo;
  end if;

  update public.usuarios
     set auth_user_id = uid
   where email = 'director@demo.mx';

  if not found then
    raise exception
      'No existe la fila director@demo.mx en public.usuarios. ¿Corriste db/99_seed_demo.sql?';
  end if;

  raise notice 'Listo: % quedó vinculado al Director.', mi_correo;
end $$;

-- Comprobación. Las dos últimas columnas tienen que decir true.
--
-- `confirmado` sale de auth.users.email_confirmed_at, que la lista de
-- Authentication → Users no enseña. Si quedó en false es que no se marcó
-- "Auto Confirm User": la cuenta existe y se vincula bien, pero al entrar
-- rebota con "Email not confirmed" y el error no se parece en nada a la causa.
-- Se arregla en Authentication → Users → los tres puntos de la fila →
-- "Confirm email", sin borrar ni recrear nada.
select u.nombre,
       u.email                          as correo_ficha,
       a.email                          as correo_login,
       u.rol,
       u.auth_user_id is not null       as vinculado,
       a.email_confirmed_at is not null as confirmado
  from public.usuarios u
  left join auth.users a on a.id = u.auth_user_id
 where u.rol = 'director';


-- ── CASO 2 · Cuando lleguen los datos reales del Director ────────────────────
-- Se actualiza la MISMA fila, no se crea otra. Así los 4 agentes del seed
-- siguen colgando de él y no hay que rehacer nada.
--
-- ⚠️ Al cambiar el correo a uno que no termine en @demo.mx, esta fila deja de
-- ser demo: volver a correr 99_seed_demo.sql ya NO la va a borrar (ese archivo
-- limpia con `email like '%@demo.mx'`), pero sí borrará y recreará los cuatro
-- agentes de prueba. Correrlo después de tener agentes reales es mala idea.

-- update public.usuarios
--    set nombre   = 'Nombre real del Director',
--        email    = 'correo.real@dominio.mx',
--        telefono = '+52...'
--  where email = 'director@demo.mx';

-- Y en Authentication → Users, cambiarle el correo a esa misma cuenta para que
-- los dos lados coincidan. El `auth_user_id` no se toca: ya está vinculado.
