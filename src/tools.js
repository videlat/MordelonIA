// ─── MORDELONIA TOOLS ENGINE ──────────────────────────────────────────────────
// Cada tool tiene: definition (para el LLM), execute (lógica cliente)

// ─── TOOL DEFINITIONS (formato OpenAI function calling) ──────────────────────
export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'ejecutar_javascript',
      description: 'Ejecuta código JavaScript en el browser y devuelve el resultado. Útil para cálculos, transformaciones de datos, probar algoritmos, regex, etc.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Código JavaScript a ejecutar' },
          description: { type: 'string', description: 'Qué hace este código en una línea' },
        },
        required: ['code', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_archivo',
      description: 'Crea o edita un archivo de texto en el sistema de archivos virtual. El usuario puede descargarlo.',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'Nombre del archivo con extensión (ej: index.html, script.py)' },
          content:  { type: 'string', description: 'Contenido completo del archivo' },
          description: { type: 'string', description: 'Descripción de qué hace el archivo' },
        },
        required: ['filename', 'content', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analizar_codigo',
      description: 'Analiza código en profundidad: bugs, seguridad, performance, code smells, complejidad ciclomática. Devuelve reporte estructurado.',
      parameters: {
        type: 'object',
        properties: {
          code:     { type: 'string', description: 'Código a analizar' },
          language: { type: 'string', description: 'Lenguaje del código' },
          focus:    { type: 'string', enum: ['bugs', 'seguridad', 'performance', 'todo'], description: 'Qué aspecto analizar' },
        },
        required: ['code', 'language', 'focus'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_web',
      description: 'Busca información actualizada en la web. Usar cuando el usuario pregunta algo que requiere datos recientes.',
      parameters: {
        type: 'object',
        properties: {
          query:    { type: 'string', description: 'Consulta de búsqueda' },
          language: { type: 'string', description: 'Idioma de búsqueda (es, en)', default: 'es' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generar_imagen',
      description: 'Genera una imagen a partir de una descripción. Usar cuando el usuario pide crear una imagen, ilustración o diseño.',
      parameters: {
        type: 'object',
        properties: {
          prompt:  { type: 'string', description: 'Descripción detallada de la imagen en inglés' },
          style:   { type: 'string', enum: ['realistic', 'illustration', 'pixel-art', 'sketch'], description: 'Estilo visual' },
          ratio:   { type: 'string', enum: ['1:1', '16:9', '9:16'], description: 'Relación de aspecto' },
        },
        required: ['prompt', 'style'],
      },
    },
  },
];

// ─── EJECUTORES ───────────────────────────────────────────────────────────────

export const executeTool = async (toolName, args, apiKey) => {
  switch (toolName) {
    case 'ejecutar_javascript': return executeJS(args);
    case 'crear_archivo':       return createFile(args);
    case 'analizar_codigo':     return analyzeCode(args, apiKey);
    case 'buscar_web':          return searchWeb(args);
    case 'generar_imagen':      return generateImage(args);
    default: return { error: `Herramienta desconocida: ${toolName}` };
  }
};

// ── 1. EJECUTAR JAVASCRIPT ────────────────────────────────────────────────────
const executeJS = ({ code, description }) => {
  const logs = [];
  const errors = [];
  let result = undefined;
  const startTime = performance.now();

  try {
    // Sandbox: capturar console.log
    const sandboxConsole = {
      log:   (...a) => logs.push(a.map(x => stringify(x)).join(' ')),
      warn:  (...a) => logs.push('⚠️ ' + a.map(x => stringify(x)).join(' ')),
      error: (...a) => errors.push(a.map(x => stringify(x)).join(' ')),
      table: (...a) => logs.push('📊 ' + JSON.stringify(a[0], null, 2)),
    };

    // eslint-disable-next-line no-new-func
    const fn = new Function('console', `
      "use strict";
      ${code}
    `);
    result = fn(sandboxConsole);
  } catch (e) {
    errors.push(e.message);
  }

  const elapsed = (performance.now() - startTime).toFixed(2);

  return {
    success: errors.length === 0,
    result:  result !== undefined ? stringify(result) : undefined,
    logs,
    errors,
    elapsed_ms: elapsed,
    description,
  };
};

const stringify = (v) => {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'object') {
    try { return JSON.stringify(v, null, 2); } catch { return String(v); }
  }
  return String(v);
};

// ── 2. CREAR ARCHIVO ──────────────────────────────────────────────────────────
const fileRegistry = {}; // filesystem virtual en memoria

const createFile = ({ filename, content, description }) => {
  fileRegistry[filename] = { content, createdAt: Date.now(), description };
  return {
    success: true,
    filename,
    description,
    size: content.length,
    lines: content.split('\n').length,
    download_ready: true,
    // El componente UI va a usar esto para ofrecer el botón de descarga
  };
};

export const downloadVirtualFile = (filename) => {
  const file = fileRegistry[filename];
  if (!file) return false;
  const ext = filename.split('.').pop().toLowerCase();
  const mimeMap = {
    html: 'text/html', css: 'text/css', js: 'application/javascript',
    ts: 'application/typescript', py: 'text/x-python', json: 'application/json',
    md: 'text/markdown', txt: 'text/plain', sh: 'application/x-sh',
    sql: 'application/sql', yaml: 'application/yaml', yml: 'application/yaml',
  };
  const mime = mimeMap[ext] || 'text/plain';
  const blob = new Blob([file.content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  return true;
};

export const getVirtualFiles = () => Object.entries(fileRegistry).map(([name, f]) => ({
  name, ...f
}));

// ── 3. ANALIZAR CÓDIGO ────────────────────────────────────────────────────────
const analyzeCode = async ({ code, language, focus }, apiKey) => {
  const focusMap = {
    bugs:        'Buscá TODOS los bugs, errores lógicos, casos edge no manejados y problemas de runtime.',
    seguridad:   'Buscá vulnerabilidades de seguridad: XSS, injection, datos no sanitizados, secretos expuestos, permisos incorrectos.',
    performance: 'Buscá problemas de performance: loops innecesarios, re-renders, memory leaks, queries N+1, operaciones bloqueantes.',
    todo:        'Hacé un análisis COMPLETO: bugs, seguridad, performance, code smells, complejidad y deuda técnica.',
  };

  const prompt = `Sos un senior developer experto en seguridad y performance. Analizá este código ${language}:

\`\`\`${language}
${code.slice(0, 4000)}
\`\`\`

${focusMap[focus] || focusMap.todo}

Respondé SOLO con JSON (sin markdown):
{
  "summary": "resumen en 1 línea de qué hace el código",
  "score": 75,
  "issues": [
    {
      "severity": "critical|warning|info",
      "type": "bug|security|performance|style",
      "line": 12,
      "title": "título corto",
      "description": "explicación del problema",
      "fix": "cómo arreglarlo"
    }
  ],
  "metrics": {
    "lines": ${code.split('\n').length},
    "complexity": "low|medium|high",
    "maintainability": "low|medium|high"
  }
}`;

  try {
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    return { success: true, analysis: JSON.parse(clean), language, focus };
  } catch (e) {
    return { success: false, error: e.message };
  }
};

// ── 4. BÚSQUEDA WEB ───────────────────────────────────────────────────────────
const searchWeb = async ({ query, language = 'es' }) => {
  // Llama al proxy serverless /api/search — la key de Serper vive en el servidor
  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, language, num: 6 }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      // not_configured viene del servidor si falta la key
      return {
        success: false,
        not_configured: data.not_configured || false,
        query,
        message: data.message || data.error || `Error ${res.status}`,
      };
    }
    return data; // { success, provider, query, results, answerBox?, knowledgeGraph? }
  } catch (e) {
    return { success: false, query, message: `Error de red: ${e.message}` };
  }
};

// ── 5. GENERACIÓN DE IMÁGENES ─────────────────────────────────────────────────
const generateImage = async ({ prompt, style, ratio = '1:1' }) => {
  const falKey    = process.env.REACT_APP_FAL_KEY;
  const openaiKey = process.env.REACT_APP_OPENAI_KEY;

  const stylePrompts = {
    realistic:    'photorealistic, high detail, 8k',
    illustration: 'digital illustration, vibrant colors, artistic',
    'pixel-art':  'pixel art, 16-bit style, retro game',
    sketch:       'pencil sketch, hand drawn, detailed linework',
  };
  const fullPrompt = `${prompt}, ${stylePrompts[style] || ''}`;

  // fal.ai (FLUX)
  if (falKey) {
    try {
      const sizeMap = { '1:1': '1024x1024', '16:9': '1792x1024', '9:16': '1024x1792' };
      const res = await fetch('https://fal.run/fal-ai/flux/schnell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Key ${falKey}` },
        body: JSON.stringify({ prompt: fullPrompt, image_size: sizeMap[ratio] || '1024x1024', num_images: 1 }),
      });
      const data = await res.json();
      return { success: true, provider: 'fal.ai (FLUX)', url: data.images?.[0]?.url, prompt: fullPrompt };
    } catch (e) { /* fallthrough */ }
  }

  // DALL-E 3
  if (openaiKey) {
    try {
      const sizeMap = { '1:1': '1024x1024', '16:9': '1792x1024', '9:16': '1024x1792' };
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
        body: JSON.stringify({ model: 'dall-e-3', prompt: fullPrompt, size: sizeMap[ratio] || '1024x1024', n: 1 }),
      });
      const data = await res.json();
      return { success: true, provider: 'DALL-E 3', url: data.data?.[0]?.url, prompt: fullPrompt };
    } catch (e) { /* fallthrough */ }
  }

  return {
    success: false,
    not_configured: true,
    prompt: fullPrompt,
    message: 'Generación de imágenes no configurada. Agregá REACT_APP_FAL_KEY o REACT_APP_OPENAI_KEY al .env',
  };
};
