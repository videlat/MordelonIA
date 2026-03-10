import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDocs, deleteDoc, query, orderBy, limit } from 'firebase/firestore';

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

// ─── UTILIDAD: serialización segura para Firestore ───────────────────────────
// Elimina undefined, circular refs, y objetos DOM que no son serializables
const safeSerialize = (obj, seen = new WeakSet()) => {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  // Detectar circular references y objetos DOM
  if (seen.has(obj)) return '[circular]';
  if (typeof window !== 'undefined' && obj instanceof window.Element) return '[DOMElement]';
  if (typeof window !== 'undefined' && obj instanceof window.Event) return '[Event]';
  seen.add(obj);
  if (Array.isArray(obj)) return obj.map(v => safeSerialize(v, seen));
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, safeSerialize(v, seen)])
  );
};
// Alias para compatibilidad
const stripUndefined = safeSerialize;

// ─── Normaliza el content de un mensaje para Firestore ───────────────────────
// Soporta: string, array de bloques (vision/multimodal), cualquier otra cosa
const normalizeContent = (content) => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    // Filtramos image_url (base64 pesado) y dejamos solo los bloques de texto
    return content
      .filter(b => b.type === 'text')
      .map(b => b.text || '')
      .join('\n') || JSON.stringify(content);
  }
  try { return JSON.stringify(content); } catch { return String(content); }
};

export const saveConversation = async (conv) => {
  try {
    const data = stripUndefined({
      ...conv,
      messages: conv.messages.map(m => ({
        role:      m.role      || 'user',
        content:   normalizeContent(m.content),
        timestamp: m.timestamp || Date.now(),
        // originalCode solo si existe y es string
        ...(m.originalCode ? { originalCode: m.originalCode.slice(0, 5000) } : {}),
        attachments: (m.attachments || []).map(a => ({
          name: a.name  || '',
          type: a.type  || '',
          size: a.size  || 0,
        })),
      })),
    });
    await setDoc(doc(db, 'conversations', conv.id), data);
  } catch (e) { console.error('Firebase save error:', e); }
};

export const loadConversations = async () => {
  try {
    const q = query(collection(db, 'conversations'), orderBy('updatedAt', 'desc'), limit(200));
    const snap = await getDocs(q);
    return snap.docs.map(d => {
      const data = d.data();
      return {
        ...data,
        messages: (data.messages || []).map(m => ({
          ...m,
          content: (() => {
            try { return typeof m.content === 'string' && m.content.startsWith('[') ? JSON.parse(m.content) : m.content; }
            catch { return m.content; }
          })(),
        })),
      };
    });
  } catch (e) { console.error('Firebase load error:', e); return []; }
};

export const deleteConversation = async (id) => {
  try { await deleteDoc(doc(db, 'conversations', id)); }
  catch (e) { console.error('Firebase delete error:', e); }
};
