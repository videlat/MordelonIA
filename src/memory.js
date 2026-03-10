import { getFirestore, collection, doc, setDoc, getDocs, deleteDoc, query, orderBy } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';

const firebaseConfig = {
  apiKey:            process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain:        process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.REACT_APP_FIREBASE_APP_ID,
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ─── TIPOS DE MEMORIA ────────────────────────────────────────────────────────
// preferencias | proyectos | correcciones | hechos

export const MEMORY_CATEGORIES = {
  preferencias: { label: 'Preferencias', icon: '👤', color: '#ff6b00' },
  proyectos:    { label: 'Proyectos',    icon: '🏗',  color: '#cc44ff' },
  correcciones: { label: 'Correcciones', icon: '✏️',  color: '#00cc44' },
  hechos:       { label: 'Hechos',       icon: '💡',  color: '#44aaff' },
};

export const saveMemory = async (memory) => {
  // memory: { id, category, content, source_conv_id, createdAt, updatedAt }
  try {
    await setDoc(doc(db, 'memories', memory.id), memory);
    return true;
  } catch (e) { console.error('Memory save error:', e); return false; }
};

export const loadMemories = async () => {
  try {
    const q = query(collection(db, 'memories'), orderBy('updatedAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  } catch (e) { console.error('Memory load error:', e); return []; }
};

export const deleteMemory = async (id) => {
  try { await deleteDoc(doc(db, 'memories', id)); return true; }
  catch (e) { console.error('Memory delete error:', e); return false; }
};

// ─── EXTRACTOR DE MEMORIAS VÍA GROQ ─────────────────────────────────────────
// Llama a Groq con un prompt especial para extraer recuerdos de la conversación
export const extractMemoriesFromConv = async (messages, existingMemories, apiKey) => {
  const recentMessages = messages.slice(-6); // últimos 6 mensajes
  const convoText = recentMessages.map(m => {
    const txt = typeof m.content === 'string' ? m.content
      : m.content?.find?.(b => b.type === 'text')?.text || '';
    return `${m.role === 'user' ? 'Usuario' : 'IA'}: ${txt.slice(0, 500)}`;
  }).join('\n\n');

  const existingText = existingMemories.length > 0
    ? `\nMemorias ya guardadas (NO duplicar):\n${existingMemories.map(m => `- [${m.category}] ${m.content}`).join('\n')}`
    : '';

  const prompt = `Analizá esta conversación y extraé SOLO información nueva y valiosa para recordar a largo plazo sobre el usuario.

Categorías posibles:
- preferencias: nombre, lenguajes favoritos, stack, estilo de código, preferencias de comunicación
- proyectos: proyectos en curso, su stack, estado, detalles técnicos
- correcciones: cuando el usuario corrigió a la IA o pidió que cambie algo
- hechos: datos importantes del usuario (empresa, experiencia, contexto personal relevante)

${existingText}

Conversación reciente:
${convoText}

Respondé SOLO con un JSON array. Si no hay nada nuevo para recordar, devolvé [].
Formato exacto (sin markdown, sin explicaciones):
[{"category":"preferencias","content":"Prefiere TypeScript sobre JavaScript"},{"category":"proyectos","content":"Está construyendo una app de delivery en React Native con Supabase"}]

Reglas:
- Máximo 3 memorias nuevas por llamada
- Solo info concreta y útil, nada obvio
- Cada memoria: máximo 120 caracteres
- NO duplicar lo que ya existe`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 400,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '[]';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(m => m.category && m.content && MEMORY_CATEGORIES[m.category]);
  } catch (e) {
    console.error('Memory extraction error:', e);
    return [];
  }
};

// ─── FORMATEA MEMORIAS PARA EL SYSTEM PROMPT ────────────────────────────────
export const formatMemoriesForPrompt = (memories) => {
  if (!memories.length) return '';
  const byCategory = {};
  memories.forEach(m => {
    if (!byCategory[m.category]) byCategory[m.category] = [];
    byCategory[m.category].push(m.content);
  });
  const lines = ['═══════════════════════════════════════', 'LO QUE SABÉS DEL USUARIO (memoria persistente)', '═══════════════════════════════════════'];
  Object.entries(byCategory).forEach(([cat, items]) => {
    const { label, icon } = MEMORY_CATEGORIES[cat];
    lines.push(`\n${icon} ${label.toUpperCase()}:`);
    items.forEach(i => lines.push(`  • ${i}`));
  });
  lines.push('\nUsá esta información naturalmente en tus respuestas. No la menciones explícitamente a menos que sea relevante.');
  return lines.join('\n');
};
