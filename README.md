# Vaxti — directorio y agenda de agentes de seguros

Sitio donde un cliente busca un agente de seguros cerca de él, ve su perfil y
los ramos que maneja, y le agenda una asesoría. Más dos paneles privados: uno
para el agente y otro para el director del equipo.

> ⚠️ **Esto es una demostración.** Los agentes, las cédulas, las reseñas y las
> fotografías son ficticios. No es un servicio real y no hay nadie a quien
> contratar un seguro. El aviso está visible en todas las pantallas.

---

## Qué hay

**Público, sin cuenta:**

| Pantalla | Qué hace |
|---|---|
| `index.html` | Portada: hero con slides, buscador por zona y ramo, agentes destacados |
| `agentes.html` | Directorio con seis filtros y orden por cercanía |
| `perfil.html?a=<slug>` | Perfil del agente: galería, ramos, reseñas y agenda |

**Privado:**

| Pantalla | Quién |
|---|---|
| `panel-agente.html` | El agente: sus citas, su disponibilidad, su perfil |
| `panel-director.html` | El director: su equipo, las citas, moderación de reseñas |
| `cartera/` | CRM de cartera: pólizas, vencimientos y oportunidades |

---

## Stack

HTML, CSS y JavaScript sin framework y sin build step. Supabase (Postgres +
Auth + RLS) para los datos. Se sirve tal cual desde GitHub Pages.

Una sola dependencia externa: `supabase-js` por CDN.

```
index.html · agentes.html · perfil.html      Sitio público
panel-agente.html · panel-director.html      Paneles
styles.css                                    Todos los estilos
app.js                                        Toda la lógica
supabase-config.js                            ⚠️ único archivo a editar
db/                                           Esquema SQL, en orden
cartera/                                      CRM de cartera
```

---

## Correrlo local

```bash
python3 -m http.server 8080
```

Y abre `http://localhost:8080`. Sin base de datos configurada, el sitio funciona
con datos de ejemplo: así se ve la demostración.

---

## Conectarlo a Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En el **SQL Editor**, corre los archivos de `db/` en orden: `01` → `07`.
   El `99_seed_demo.sql` es opcional y solo sirve para desarrollo.
3. Copia **Project URL** y **anon public key** desde Settings → API, y pégalas
   en [supabase-config.js](supabase-config.js).

La anon key es pública por diseño: viaja en el navegador y no da acceso a nada
por sí sola. Lo que protege los datos es el Row Level Security de `db/05_rls.sql`.
La `service_role` key no va en este repositorio.

En cuanto la base queda conectada, el modo demostración se apaga solo: el aviso
desaparece y el acceso a los paneles pasa a pedir cuenta real.

### Crear el primer director

Ninguna política permite crear directores desde la aplicación, a propósito:

1. **Authentication → Users → Add user**. Copia el UID.
2. En el SQL Editor:

```sql
insert into public.usuarios (auth_user_id, nombre, email, telefono, rol)
values ('UID-QUE-COPIASTE', 'Nombre', 'correo@dominio.mx', '+52...', 'director');
```

De ahí en adelante el director da de alta a su equipo desde su panel.

---

## Seguridad

- Sin contraseñas en el código. El acceso va por Supabase Auth.
- El público puede **insertar** citas, reseñas y postulaciones, pero no puede
  leer la tabla `citas`: ahí van los datos de contacto de quien agendó.
- Las reseñas entran sin publicar. El director las aprueba antes de que salgan.
- La ubicación del visitante se usa en memoria para ordenar por distancia y no
  se guarda.
