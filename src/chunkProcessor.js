// ─── chunkProcessor.js ────────────────────────────────────────────────────────
// Procesador de archivos grandes por chunks.
// Divide, analiza cada parte, consolida el mapa estructural y genera la edición
// con el razonamiento de un dev que leyó el archivo completo.
// ─────────────────────────────────────────────────────────────────────────────

export const CHUNK_SIZE = 20000;          // chars por chunk (~5k tokens)
export const LARGE_FILE_THRESHOLD = 25000; // umbral para activar modo chunks

const getExt = (n) => n.split('.').pop().toLowerCase();

// Delay entre requests para no saturar el rate limit
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const INTER_CHUNK_DELAY = 3000; // 3s entre chunks

// Wrapper con retry automático para 429
const fetchWithRetry = async (claudeFetch, body, signal, retries = 4) => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await claudeFetch(body, signal);
    if (res.status !== 429) return res;
    if (attempt === retries) return res;
    let waitMs = (attempt + 1) * 8000; // backoff: 8s, 16s, 24s, 32s
    try {
      const errData = await res.clone().json();
      const msg = errData?.error?.message || '';
      const match = msg.match(/try again in ([\d.]+)s/i);
      if (match) waitMs = Math.ceil(parseFloat(match[1]) * 1000) + 2000;
    } catch (_) {}
    console.warn(`[chunkProcessor] Rate limit, reintentando en ${Math.round(waitMs / 1000)}s...`);
    await sleep(waitMs);
  }
};

/**
 * analyzeAndEditLargeFile
 *
 * @param {string}   fileName      - Nombre del archivo (ej: "mordelon-cliente.html")
 * @param {string}   fileContent   - Contenido completo del archivo
 * @param {string}   userRequest   - Pedido del usuario en lenguaje natural
 * @param {Array}    history       - Historial de mensajes de la conversación
 * @param {string}   systemPrompt  - System prompt base de la app
 * @param {Function} claudeFetch   - Función de fetch al proxy /api/claude
 * @param {string}   MODEL_SMART   - Modelo a usar (ej: 'claude-sonnet-4-5')
 * @param {AbortSignal} signal     - AbortSignal para cancelar
 * @param {Function} onStream      - Callback(delta, isContentStream)
 *                                   isContentStream=false → mensaje de progreso
 *                                   isContentStream=true  → delta del texto final
 * @returns {Promise<string>}      - Texto completo de la respuesta
 */
export const analyzeAndEditLargeFile = async ({
  fileName,
  fileContent,
  userRequest,
  history,
  systemPrompt,
  claudeFetch,
  MODEL_SMART,
  signal,
  onStream,
}) => {

  // ── Dividir en chunks ──────────────────────────────────────────────────────
  const chunks = [];
  for (let i = 0; i < fileContent.length; i += CHUNK_SIZE) {
    chunks.push(fileContent.slice(i, i + CHUNK_SIZE));
  }
  const totalChunks = chunks.length;

  // ── FASE 1: Analizar cada chunk → mapa estructural parcial ────────────────
  onStream(`🔍 Analizando archivo en ${totalChunks} partes...`, false);

  const chunkSummaries = [];
  for (let i = 0; i < chunks.length; i++) {
    onStream(`📄 Leyendo parte ${i + 1} de ${totalChunks}...`, false);

    const res = await fetchWithRetry(claudeFetch, {
      model: MODEL_SMART,
      max_tokens: 1500,
      system: `Sos un analizador de código experto. Tu trabajo es leer un fragmento de un archivo y extraer un mapa estructural detallado: qué funciones/clases/secciones hay, qué IDs/clases CSS existen, qué hace cada parte. Sé específico y técnico. Responde SOLO con el análisis estructural, sin explicaciones extras.`,
      messages: [{
        role: 'user',
        content:
          `Archivo: ${fileName} | Fragmento ${i + 1}/${totalChunks} | ` +
          `Chars ${i * CHUNK_SIZE}–${Math.min((i + 1) * CHUNK_SIZE, fileContent.length)} de ${fileContent.length}\n\n` +
          `Petición del usuario: "${userRequest}"\n\n` +
          `ANALIZÁ este fragmento — identificá estructuras relevantes, IDs, clases, funciones, ` +
          `y cualquier cosa relacionada con la petición:\n\`\`\`\n${chunks[i]}\n\`\`\``
      }]
    }, signal);

    if (!res.ok) throw new Error(`Error analizando chunk ${i + 1}`);
    const data = await res.json();
    const summary = data.content?.[0]?.text || '';
    chunkSummaries.push(
      `=== PARTE ${i + 1}/${totalChunks} ` +
      `(chars ${i * CHUNK_SIZE}–${Math.min((i + 1) * CHUNK_SIZE, fileContent.length)}) ===\n${summary}`
    );
    // Pausa entre chunks para no saturar el rate limit
    if (i < chunks.length - 1) await sleep(INTER_CHUNK_DELAY);
  }

  // ── FASE 2: Consolidar mapa unificado del archivo completo ────────────────
  onStream(`🧠 Consolidando mapa del archivo...`, false);

  const consolidateRes = await fetchWithRetry(claudeFetch, {
    model: MODEL_SMART,
    max_tokens: 3000,
    system:
      `Sos un arquitecto de software. Te dan análisis parciales de fragmentos de un archivo ` +
      `y tu trabajo es construir un mapa unificado y coherente del archivo completo. ` +
      `Identificá especialmente: estructura general, IDs/clases importantes, funciones clave, ` +
      `dependencias internas, y los puntos exactos relevantes para la petición del usuario.`,
    messages: [{
      role: 'user',
      content:
        `Archivo: ${fileName} (${fileContent.length} chars total)\n` +
        `Petición: "${userRequest}"\n\n` +
        `Análisis por partes:\n${chunkSummaries.join('\n\n')}\n\n` +
        `Generá un MAPA UNIFICADO con: estructura general, IDs/clases/funciones clave, ` +
        `y exactamente qué necesita modificarse para cumplir la petición.`
    }]
  }, signal);

  if (!consolidateRes.ok) throw new Error('Error en consolidación');
  const consolidateData = await consolidateRes.json();
  const fileMap = consolidateData.content?.[0]?.text || '';

  // ── FASE 3: Generar la modificación con contexto completo ─────────────────
  onStream(`✏️ Generando respuesta...`, false);

  const historyCtx = history.slice(-4).map(m => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content.slice(0, 1000) : '[mensaje anterior]'
  }));

  // Si el archivo cabe en 120k chars lo mandamos completo; si no, usamos solo el mapa
  const fileContextForEdit = fileContent.length <= 120000
    ? `ARCHIVO COMPLETO (${fileName}):\n\`\`\`${getExt(fileName)}\n${fileContent}\n\`\`\``
    : `MAPA COMPLETO DEL ARCHIVO (${fileName}, ${fileContent.length} chars):\n${fileMap}\n\n` +
      `⚠️ Archivo demasiado grande para incluir completo. ` +
      `Usá el mapa para razonar los cambios. Generá el código completo y correcto basándote en él.`;

  const editRes = await fetchWithRetry(claudeFetch, {
    model: MODEL_SMART,
    max_tokens: 8192,
    stream: true,
    system:
      `${systemPrompt}\n\n` +
      `TENÉS ACCESO AL MAPA COMPLETO DEL ARCHIVO. ` +
      `Razonás como un dev senior que leyó todo el código. ` +
      `Cuando modifiques, respetás EXACTAMENTE los IDs, clases, nombres de funciones y estructura existente. ` +
      `NUNCA reescribís desde cero — solo modificás lo necesario.`,
    messages: [
      ...historyCtx,
      {
        role: 'user',
        content: `${fileContextForEdit}\n\nMAPA ESTRUCTURAL ANALIZADO:\n${fileMap}\n\nPETICIÓN: ${userRequest}`
      }
    ]
  }, signal);

  if (!editRes.ok) {
    const e = await editRes.json();
    throw new Error(e.error?.message || `HTTP ${editRes.status}`);
  }

  // ── Stream de la respuesta final ───────────────────────────────────────────
  const reader = editRes.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const raw = decoder.decode(value, { stream: true });
    for (const line of raw.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]' || data === '') continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
          const delta = parsed.delta.text;
          if (delta) { fullText += delta; onStream(delta, true); }
        }
      } catch (_) {}
    }
  }

  return fullText;
};
