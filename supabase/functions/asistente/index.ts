/* ============================================================================
   asistente/index.ts — Edge Function del asistente de Vaxti

   POR QUÉ ESTO VIVE EN EL SERVIDOR Y NO EN app.js
   La API key de Anthropic da acceso de pago a la cuenta. En el navegador sería
   pública: cualquiera abre las herramientas de desarrollo, la copia y gasta el
   saldo del Director. Por eso la clave vive en un secreto de Supabase y el
   navegador solo habla con esta función.

   LÍMITE REGULATORIO — CNSF (CLAUDE.md §15). NO ES OPCIONAL
   La asesoría y el cierre de venta de seguros requieren cédula A1/A2 vigente.
   Este asistente NO asesora: entiende el caso, pregunta lo justo, explica en
   términos generales qué coberturas suelen aplicar, y prepara el contexto para
   que un agente con cédula haga el trabajo. No recomienda un producto concreto,
   no da precios, no cierra nada. Esa frontera está en el prompt de abajo y
   además se le dice al visitante en la interfaz.

   PRIVACIDAD
   Esta función NO escribe en la base. La conversación vive en el navegador del
   visitante y solo se guarda si él decide agendar — ahí viaja con la cita, para
   el agente que eligió. Registrar aquí lo que la gente cuenta de su salud o su
   patrimonio sería construir un archivo que nadie pidió.

   DESPLIEGUE
     supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
     supabase functions deploy asistente --no-verify-jwt
   `--no-verify-jwt` porque el visitante no tiene cuenta: es el mismo caso que
   agendar una cita sin registrarse.
   ========================================================================== */

import Anthropic from 'npm:@anthropic-ai/sdk@0.72.0';

const MODELO = 'claude-opus-5';

/* Tope de mensajes por conversación. No es por costo, es por diseño: si a los
   doce turnos el caso no está claro, lo que hace falta es una persona. */
const MAX_TURNOS = 12;

/* El catálogo tiene que coincidir con `RAMOS` de app.js y con el CHECK de
   `ramos_agente`. Si se agrega un ramo y no se agrega aquí, el asistente nunca
   lo propondrá; si se escribe uno que la base no acepta, la cita se rechaza. */
const RAMOS = [
  'auto', 'vida', 'gastos_medicos', 'hogar',
  'empresarial', 'educativo', 'fianzas', 'ahorro', 'retiro', 'mascotas',
] as const;

const SISTEMA = `Eres el asistente de Vaxti Asesores Financieros, una agencia de
asesores en Jalisco, México, que coloca productos de GNP Seguros.

TU TRABAJO
Recibes a alguien que llega al sitio sin saber a quién acudir. Tu labor es
entender su caso, hacerle POCAS preguntas y dejarlo listo para hablar con el
asesor correcto. Eres la recepción, no el asesor.

LÍMITE QUE NO PUEDES CRUZAR
En México, asesorar sobre seguros y cerrar una venta requiere cédula A1 o A2 de
la CNSF. Tú no la tienes. Por lo tanto:
- NO recomiendas un producto concreto ni dices cuál "le conviene más".
- NO das precios, primas, sumas aseguradas ni cotizaciones, ni siquiera
  aproximadas o "de referencia".
- NO opinas sobre si una póliza que ya tiene es buena o mala.
- SÍ explicas en términos generales qué TIPOS de cobertura suelen aplicar a una
  situación como la suya, y por qué conviene que lo vea un asesor.
Si te insisten en un precio o en una recomendación, dilo con naturalidad: eso lo
tiene que ver un asesor con cédula, y justamente para eso le vas a conseguir uno.
No te disculpes de más ni lo repitas en cada mensaje.

CÓMO CONVERSAS
- En español de México, natural y directo. Tuteas.
- Mensajes CORTOS: dos o tres frases. Esto es un chat, no un correo.
- UNA pregunta a la vez. Nunca sueltes una lista de preguntas.
- Haz DOS o TRES preguntas antes de cerrar. Con una sola, el agente llega a la
  cita sin saber nada; con más de tres, esto se siente un cuestionario y la
  gente lo abandona. Lo que falte lo pregunta el agente en la cita.
- Enlaza cada pregunta con lo que te acaban de decir, no la sueltes a secas.
- **SÍ preguntas la edad** cuando el caso lo pide (gastos médicos, vida, retiro,
  educativo): en seguros la edad define casi todo, y sin ella el agente no
  puede preparar nada. Lo mismo con el detalle concreto del bien a asegurar:
  marca, modelo y año del coche; a qué se dedica el negocio; si la casa es
  propia o rentada.
- **NO pides datos de contacto ni de identidad**: ni nombre, ni teléfono, ni
  correo, ni RFC, ni CURP, ni número de póliza, ni datos bancarios. Eso se lo
  deja al agente, y solo cuando el cliente decide agendar. Si te los dan, no
  los repitas ni los guardes en el resumen.
- Si alguien te cuenta algo delicado de salud, trátalo con normalidad y sin
  dramatismo. No hagas diagnósticos ni preguntes más de lo necesario.

QUÉ NECESITAS AVERIGUAR, según el caso — dos cosas de cada uno
- Auto: marca, modelo y año · si ya trae seguro o se le venció.
- Gastos médicos: para quién es (él, pareja, hijos, papás) · las edades de
  quienes entrarían en la póliza.
- Vida: quién depende de él económicamente · su edad.
- Hogar: si es propia o rentada · zona y tamaño aproximado.
- Empresarial: a qué se dedica · cuántos empleados.
- Educativo: edad del hijo · en cuántos años entra a la universidad.
- Ahorro: en cuántos años piensa usarlo · si es para una meta concreta.
- Retiro: qué edad tiene hoy · a qué edad quiere dejar de trabajar.
- Fianzas: qué tipo (cumplimiento, anticipo, vicios ocultos) · para qué contrato.
- Mascotas: si es perro o gato y su edad · si ha tenido algo serio de salud.

Si menciona DOS ramos, pregunta también por el segundo antes de cerrar. Quien
llega diciendo dos cosas espera que le pregunten por las dos.

CUÁNDO TERMINAS
En cuanto entiendas qué necesita, usa la herramienta preparar_resumen. No
anuncies que vas a usarla ni digas "voy a preparar tu resumen": simplemente
llámala. El sitio se encarga del resto.

Si la persona escribe algo que no tiene que ver con seguros ni con finanzas
personales, redirige con amabilidad en una frase. Si insiste dos veces, usa
preparar_resumen con lo poco que tengas y deja que un humano lo atienda.`;

const HERRAMIENTA = {
  name: 'preparar_resumen',
  description:
    'Cierra la conversación y entrega el caso ordenado para el asesor. ' +
    'Úsala en cuanto entiendas qué necesita la persona, sin anunciarlo.',
  strict: true,
  input_schema: {
    type: 'object' as const,
    properties: {
      ramos: {
        type: 'array',
        items: { type: 'string', enum: RAMOS },
        description:
          'Los ramos que aplican al caso, del más al menos relevante. ' +
          'Uno o dos normalmente; tres como máximo.',
      },
      resumen: {
        type: 'string',
        description:
          'El caso escrito PARA EL ASESOR, en tercera persona. Primero qué ' +
          'busca en una frase, y después los datos concretos que averiguaste, ' +
          'en formato «Etiqueta: valor» separados por · para que se lean de un ' +
          'vistazo. Sin datos de contacto. Ejemplo: «Busca gastos médicos y ' +
          'seguro de auto. Coche: Nissan Sentra 2022 · Seguro actual: se venció ' +
          'el mes pasado · Para quién: él y su esposa · Edades: 38 y 35.»',
      },
      para_el_cliente: {
        type: 'string',
        description:
          'Mensaje de cierre que lee el visitante, dirigido a él y en segunda ' +
          'persona. Dos frases: qué entendiste y qué sigue. Sin recomendar ' +
          'producto ni dar precios.',
      },
      urgencia: {
        type: 'string',
        enum: ['normal', 'pronto'],
        description:
          '«pronto» solo si hay una fecha real encima: una póliza que vence en ' +
          'días, un trámite con plazo, un viaje inminente. Si no, «normal».',
      },
    },
    required: ['ramos', 'resumen', 'para_el_cliente', 'urgencia'],
    additionalProperties: false,
  },
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Solo POST.' }, 405);

  const clave = Deno.env.get('ANTHROPIC_API_KEY');
  if (!clave) {
    // Se distingue del resto de errores a propósito: es de configuración, no
    // del visitante, y quien lo lea en los logs tiene que saber qué hacer.
    console.error('Falta el secreto ANTHROPIC_API_KEY. Correr: supabase secrets set ANTHROPIC_API_KEY=...');
    return json({ error: 'El asistente no está configurado todavía.' }, 503);
  }

  let cuerpo: { mensajes?: Array<{ role: string; content: string }> };
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: 'Cuerpo inválido.' }, 400);
  }

  const mensajes = Array.isArray(cuerpo.mensajes) ? cuerpo.mensajes : [];
  if (!mensajes.length) return json({ error: 'Sin mensajes.' }, 400);
  if (mensajes.length > MAX_TURNOS * 2) {
    return json({ error: 'Conversación demasiado larga.', agotado: true }, 400);
  }

  /* El historial llega del navegador, así que es entrada del usuario y no se
     puede confiar en su forma. Se reconstruye entero: solo roles válidos, solo
     texto, y con un tope de longitud por mensaje. Sin esto, cualquiera podría
     inyectar un rol distinto o un bloque de contenido arbitrario. */
  const limpios = mensajes
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, 4000) }));

  if (!limpios.length || limpios[limpios.length - 1].role !== 'user') {
    return json({ error: 'El último mensaje tiene que ser del visitante.' }, 400);
  }

  const client = new Anthropic({ apiKey: clave });

  try {
    const respuesta = await client.messages.create({
      model: MODELO,
      max_tokens: 2000,
      // El sistema es idéntico en cada llamada: se cachea y el resto de la
      // conversación viaja detrás sin invalidarlo.
      system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
      // Conversación corta y acotada: no necesita razonar hondo, y `low` es la
      // diferencia entre responder en dos segundos o en diez.
      output_config: { effort: 'low' },
      thinking: { type: 'adaptive' },
      tools: [HERRAMIENTA],
      messages: limpios,
    });

    // Fable/Opus 5 pueden declinar una petición: llega HTTP 200 con este
    // stop_reason, así que hay que mirarlo ANTES de leer el contenido.
    if (respuesta.stop_reason === 'refusal') {
      return json({
        texto: 'Mejor que esto lo veas directamente con un asesor. Te paso con uno.',
        cerrar: true,
      });
    }

    let texto = '';
    let resumen = null;
    for (const bloque of respuesta.content) {
      if (bloque.type === 'text') texto += bloque.text;
      if (bloque.type === 'tool_use' && bloque.name === 'preparar_resumen') {
        resumen = bloque.input;
      }
    }

    return json({
      texto: texto.trim(),
      resumen,
      // Sirve para que el Director pueda ver qué cuesta esto de verdad.
      uso: {
        entrada: respuesta.usage.input_tokens,
        salida: respuesta.usage.output_tokens,
        cache_leido: respuesta.usage.cache_read_input_tokens ?? 0,
      },
    });
  } catch (e) {
    // El motivo real va al log del servidor; al visitante se le da algo que
    // pueda hacer. Un stack trace en pantalla no le sirve a nadie.
    console.error('Fallo llamando a la API de Claude:', e);
    const status = (e as { status?: number })?.status;
    if (status === 429) {
      return json({ error: 'Hay mucha gente preguntando ahora mismo. Intenta en un minuto.' }, 429);
    }
    return json({ error: 'No pudimos con eso. Puedes elegir agente tú mismo.' }, 502);
  }
});
