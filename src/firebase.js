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

export const saveConversation = async (conv) => {
  try {
    const data = {
      ...conv,
      messages: conv.messages.map(m => ({
        ...m,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        attachments: (m.attachments || []).map(a => ({ name: a.name, type: a.type || '', size: a.size || 0 })),
      })),
    };
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
