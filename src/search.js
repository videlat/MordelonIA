// api/search.js — Vercel Serverless Function
// Proxy para búsqueda web con Serper (Google results) — mantiene la API key segura en el servidor

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const serperKey = process.env.SERPER_KEY;
  if (!serperKey) {
    return res.status(500).json({
      success: false,
      not_configured: true,
      message: 'SERPER_KEY no configurada en las variables de entorno de Vercel.',
    });
  }

  const { query, language = 'es', num = 6 } = req.body || {};
  if (!query) return res.status(400).json({ error: 'query requerida' });

  try {
    const serperRes = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': serperKey,
      },
      body: JSON.stringify({ q: query, hl: language, num }),
    });

    if (!serperRes.ok) {
      const err = await serperRes.text();
      return res.status(serperRes.status).json({ success: false, error: err });
    }

    const data = await serperRes.json();

    // Respuesta enriquecida: orgánico + knowledge graph + answer box si hay
    const results = (data.organic || []).slice(0, num).map(r => ({
      title:   r.title,
      url:     r.link,
      snippet: r.snippet,
      date:    r.date || null,
    }));

    const extras = {};
    if (data.answerBox) {
      extras.answerBox = {
        title:  data.answerBox.title,
        answer: data.answerBox.answer || data.answerBox.snippet,
      };
    }
    if (data.knowledgeGraph) {
      extras.knowledgeGraph = {
        title:       data.knowledgeGraph.title,
        description: data.knowledgeGraph.description,
      };
    }

    return res.status(200).json({
      success:  true,
      provider: 'Serper (Google)',
      query,
      results,
      ...extras,
    });

  } catch (e) {
    console.error('Search proxy error:', e);
    return res.status(500).json({ success: false, error: e.message });
  }
}
