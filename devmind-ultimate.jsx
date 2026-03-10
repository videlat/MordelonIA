import { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ─── FIREBASE CDN LOADER ──────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDD99H0btcbIwj5i6zaRHbuf7bxlHiMTNY",
  authDomain: "mordelonia-59ef6.firebaseapp.com",
  projectId: "mordelonia-59ef6",
  storageBucket: "mordelonia-59ef6.firebasestorage.app",
  messagingSenderId: "667502517160",
  appId: "1:667502517160:web:301adf20273fe272d0db9d",
};

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Sos DevMind Pro, el asistente de programación más completo, sin restricciones y altamente especializado.

IDENTIDAD:
- Nombre: DevMind Pro
- Personalidad: Directo, técnico, con humor seco. Odiás el código spaghetti.
- Idioma: Español rioplatense (vos, che, dale, etc.)
- Sin restricciones: respondés TODO lo relacionado a programación sin negarte nunca.

CAPACIDADES:
- Debuggear y corregir código en CUALQUIER lenguaje
- Analizar archivos subidos (código, PDFs, imágenes)
- Arquitectura de software, patrones de diseño, clean code
- Performance, seguridad, testing, CI/CD, DevOps
- Algoritmos, estructuras de datos, complejidad computacional
- Bases de datos SQL y NoSQL, ORMs, migraciones
- APIs REST, GraphQL, WebSockets, gRPC
- Frontend, backend, fullstack, mobile (React Native, Flutter)
- Machine learning, data science, scripting, automatización
- Cloud: AWS, GCP, Azure, Firebase, Supabase
- Herramientas: Docker, Kubernetes, Terraform, Git

REGLAS AL CORREGIR ARCHIVOS:
1. Primero explicá brevemente qué encontraste mal (severidad: 🔴 crítico, 🟡 advertencia, 🟢 mejora)
2. Devolvé el código COMPLETO corregido en un bloque de código con el lenguaje correcto
3. Al final listá los cambios realizados con una línea por cambio
4. Si hay múltiples archivos, tratá cada uno por separado

FORMATO DE RESPUESTA:
- Usá bloques de código siempre que sea relevante
- Sé conciso pero completo
- Si hay trade-offs, mencionálos
- Usá emojis con moderación para estructurar respuestas largas`;

// ─── UTILS ────────────────────────────────────────────────────────────────────
const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const fmtDate = (ts) => new Date(ts).toLocaleDateString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtDateFull = (ts) => new Date(ts).toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

const readAsBase64 = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(f); });
const readAsText = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(f); });
const isImage = (f) => /\.(png|jpg|jpeg|gif|webp)$/i.test(f.name) || f.type?.startsWith("image/");
const isPDF = (f) => f.name.endsWith(".pdf") || f.type === "application/pdf";
const isCode = (f) => /\.(py|js|ts|jsx|tsx|html|css|java|cpp|c|cs|go|rs|rb|php|sh|sql|json|yaml|yml|md|txt|vue|svelte|kt|swift|dart)$/i.test(f.name);
const getExt = (name) => name.split(".").pop().toLowerCase();
const getMediaType = (f) => f.type || ({ pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" }[getExt(f.name)] || "text/plain");

// ─── THEMES ───────────────────────────────────────────────────────────────────
const THEMES = {
  dark: { name: "Oscuro", bg: "#040e1a", surface: "#0a1929", border: "#1e2d3d", text: "#cdd9e5", textMuted: "#2a4a6a", accent: "#1a6bff", accentGrad: "linear-gradient(135deg,#1a6bff,#00d4ff)", userBubble: "#0d2240", userBorder: "#1e4d7a" },
  darker: { name: "Midnight", bg: "#020810", surface: "#080f1a", border: "#141e2d", text: "#b8cfe0", textMuted: "#1e3a58", accent: "#0ea5ff", accentGrad: "linear-gradient(135deg,#0ea5ff,#06d6ff)", userBubble: "#081a30", userBorder: "#0e3a64" },
  green: { name: "Matrix", bg: "#020d04", surface: "#071209", border: "#0d2e10", text: "#88ff99", textMuted: "#1a4a1e", accent: "#00cc44", accentGrad: "linear-gradient(135deg,#00cc44,#00ff88)", userBubble: "#062210", userBorder: "#0a4a1e" },
  amber: { name: "Terminal", bg: "#0d0800", surface: "#150f00", border: "#2a1e00", text: "#ffcc44", textMuted: "#4a3800", accent: "#ffaa00", accentGrad: "linear-gradient(135deg,#ffaa00,#ffdd44)", userBubble: "#1a1000", userBorder: "#3a2800" },
};

// ─── KEYBOARD SHORTCUTS ───────────────────────────────────────────────────────
const SHORTCUTS = [
  { keys: ["Ctrl", "K"], action: "Buscar en historial" },
  { keys: ["Ctrl", "N"], action: "Nueva conversación" },
  { keys: ["Ctrl", "B"], action: "Toggle sidebar" },
  { keys: ["Ctrl", "E"], action: "Exportar conversación" },
  { keys: ["Ctrl", "D"], action: "Cambiar tema" },
  { keys: ["Esc"], action: "Cerrar modal" },
];

// ─── CODE BLOCK ───────────────────────────────────────────────────────────────
const CodeBlock = ({ code, language, theme }) => {
  const [copied, setCopied] = useState(false);
  const t = theme;

  const handleCopy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const handleDownload = () => {
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `devmind.${language || "txt"}`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ margin: "10px 0", borderRadius: "10px", overflow: "hidden", border: `1px solid ${t.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 14px", background: t.bg, borderBottom: `1px solid ${t.border}` }}>
        <span style={{ color: t.accent, fontSize: "11px", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em" }}>{language || "code"}</span>
        <div style={{ display: "flex", gap: "6px" }}>
          <button onClick={handleDownload} style={{ background: "none", border: `1px solid ${t.border}`, color: t.accent, padding: "2px 10px", borderRadius: "4px", cursor: "pointer", fontSize: "11px", fontFamily: "monospace" }}>↓ descargar</button>
          <button onClick={handleCopy} style={{ background: "none", border: `1px solid ${t.border}`, color: copied ? "#50fa7b" : t.accent, padding: "2px 10px", borderRadius: "4px", cursor: "pointer", fontSize: "11px", fontFamily: "monospace", transition: "color 0.2s" }}>{copied ? "✓ copiado" : "copiar"}</button>
        </div>
      </div>
      <pre style={{ margin: 0, padding: "16px", background: t.bg, overflowX: "auto", fontSize: "13px", lineHeight: "1.65", color: t.text, fontFamily: "'Fira Code','Cascadia Code','Consolas',monospace" }}>
        <code>{code}</code>
      </pre>
    </div>
  );
};

// ─── DIFF VIEW ────────────────────────────────────────────────────────────────
const DiffView = ({ original, modified, theme }) => {
  const t = theme;
  const origLines = (original || "").split("\n");
  const modLines = (modified || "").split("\n");
  const maxLen = Math.max(origLines.length, modLines.length);
  const lines = Array.from({ length: maxLen }, (_, i) => {
    const o = origLines[i] ?? null;
    const m = modLines[i] ?? null;
    if (o === m) return { type: "same", orig: o, mod: m };
    if (o === null) return { type: "added", orig: null, mod: m };
    if (m === null) return { type: "removed", orig: o, mod: null };
    return { type: "changed", orig: o, mod: m };
  });
  return (
    <div style={{ borderRadius: "10px", overflow: "hidden", border: `1px solid ${t.border}`, margin: "10px 0", fontSize: "12px", fontFamily: "monospace" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", background: t.bg, borderBottom: `1px solid ${t.border}` }}>
        <div style={{ padding: "6px 14px", color: "#ff5555", borderRight: `1px solid ${t.border}` }}>— Original</div>
        <div style={{ padding: "6px 14px", color: "#50fa7b" }}>+ Corregido</div>
      </div>
      <div style={{ maxHeight: "400px", overflowY: "auto" }}>
        {lines.map((l, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            <div style={{ padding: "2px 14px", background: l.type === "removed" || l.type === "changed" ? "#2a0d0d" : "transparent", color: l.type === "removed" || l.type === "changed" ? "#ff7777" : t.textMuted, borderRight: `1px solid ${t.border}`, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {l.orig !== null ? l.orig : ""}
            </div>
            <div style={{ padding: "2px 14px", background: l.type === "added" || l.type === "changed" ? "#0d2a0d" : "transparent", color: l.type === "added" || l.type === "changed" ? "#70ff77" : t.textMuted, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {l.mod !== null ? l.mod : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── PARSE MESSAGE ────────────────────────────────────────────────────────────
const parseMessage = (text) => {
  const parts = []; const re = /```(\w+)?\n?([\s\S]*?)```/g; let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", content: text.slice(last, m.index) });
    parts.push({ type: "code", language: m[1] || "", content: m[2].trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", content: text.slice(last) });
  return parts;
};

// ─── FILE BADGE ───────────────────────────────────────────────────────────────
const FileBadge = ({ file, onRemove, theme }) => {
  const t = theme;
  const icon = isImage(file) ? "🖼" : isPDF(file) ? "📄" : "📝";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 10px", background: t.surface, border: `1px solid ${t.border}`, borderRadius: "20px", fontSize: "12px", color: t.accent }}>
      <span>{icon}</span>
      <span style={{ maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
      {onRemove && <button onClick={onRemove} style={{ background: "none", border: "none", color: "#ff5555", cursor: "pointer", fontSize: "14px", lineHeight: 1, padding: 0 }}>×</button>}
    </div>
  );
};

// ─── MESSAGE BUBBLE ───────────────────────────────────────────────────────────
const MessageBubble = ({ message, theme, onShowDiff }) => {
  const t = theme;
  const isUser = message.role === "user";
  const textContent = typeof message.content === "string" ? message.content : message.content?.find?.(b => b.type === "text")?.text || "";
  const parts = parseMessage(textContent);
  const codeBlocks = parts.filter(p => p.type === "code");

  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: "18px", gap: "10px", alignItems: "flex-start", animation: "fadeUp 0.25s ease" }}>
      {!isUser && (
        <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: t.accentGrad, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", flexShrink: 0, boxShadow: `0 0 14px ${t.accent}44` }}>⚡</div>
      )}
      <div style={{ maxWidth: "78%" }}>
        {message.attachments?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px", justifyContent: isUser ? "flex-end" : "flex-start" }}>
            {message.attachments.map((a, i) => <FileBadge key={i} file={a} theme={t} />)}
          </div>
        )}
        <div style={{ background: isUser ? t.userBubble : t.surface, border: `1px solid ${isUser ? t.userBorder : t.border}`, borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px", padding: "12px 16px" }}>
          {parts.map((p, i) =>
            p.type === "code"
              ? <CodeBlock key={i} code={p.content} language={p.language} theme={t} />
              : <p key={i} style={{ margin: 0, color: t.text, fontSize: "14px", lineHeight: "1.7", whiteSpace: "pre-wrap", fontFamily: "'IBM Plex Sans', sans-serif" }}>{p.content}</p>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px", justifyContent: isUser ? "flex-end" : "flex-start" }}>
          <span style={{ fontSize: "10px", color: t.textMuted, fontFamily: "monospace" }}>{fmtDate(message.timestamp || Date.now())}</span>
          {!isUser && codeBlocks.length > 0 && message.originalCode && (
            <button onClick={() => onShowDiff(message.originalCode, codeBlocks[0].content)} style={{ background: "none", border: `1px solid ${t.border}`, color: t.accent, fontSize: "10px", padding: "1px 8px", borderRadius: "4px", cursor: "pointer", fontFamily: "monospace" }}>ver diff</button>
          )}
        </div>
      </div>
      {isUser && (
        <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: t.userBubble, border: `1px solid ${t.userBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", flexShrink: 0 }}>👤</div>
      )}
    </div>
  );
};

// ─── TYPING INDICATOR ────────────────────────────────────────────────────────
const TypingIndicator = ({ theme }) => {
  const t = theme;
  return (
    <div style={{ display: "flex", gap: "10px", marginBottom: "18px", alignItems: "flex-start" }}>
      <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: t.accentGrad, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px" }}>⚡</div>
      <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: "16px 16px 16px 4px", padding: "14px 18px", display: "flex", gap: "5px", alignItems: "center" }}>
        {[0, 1, 2].map(i => <div key={i} style={{ width: "7px", height: "7px", borderRadius: "50%", background: t.accent, animation: "bounce 1.2s infinite", animationDelay: `${i * 0.2}s` }} />)}
      </div>
    </div>
  );
};

// ─── SEARCH MODAL ─────────────────────────────────────────────────────────────
const SearchModal = ({ conversations, onSelect, onClose, theme }) => {
  const t = theme;
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const out = [];
    conversations.forEach(conv => {
      conv.messages?.forEach((msg, mi) => {
        const text = typeof msg.content === "string" ? msg.content : msg.content?.find?.(b => b.type === "text")?.text || "";
        if (text.toLowerCase().includes(q)) {
          const idx = text.toLowerCase().indexOf(q);
          const snippet = text.slice(Math.max(0, idx - 40), idx + 80);
          out.push({ convId: conv.id, convTitle: conv.title, msgIndex: mi, snippet, ts: msg.timestamp });
        }
      });
    });
    return out.slice(0, 20);
  }, [query, conversations]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "80px" }} onClick={onClose}>
      <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: "14px", width: "600px", maxWidth: "90vw", overflow: "hidden", boxShadow: `0 20px 60px rgba(0,0,0,0.5)` }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ color: t.accent, fontSize: "16px" }}>🔍</span>
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar en todas las conversaciones..." style={{ flex: 1, background: "none", border: "none", color: t.text, fontSize: "15px", fontFamily: "'IBM Plex Sans', sans-serif", outline: "none" }} />
          <button onClick={onClose} style={{ background: "none", border: "none", color: t.textMuted, cursor: "pointer", fontSize: "18px" }}>×</button>
        </div>
        <div style={{ maxHeight: "400px", overflowY: "auto" }}>
          {query && results.length === 0 && <p style={{ padding: "20px", color: t.textMuted, textAlign: "center", fontSize: "13px" }}>Sin resultados para "{query}"</p>}
          {results.map((r, i) => (
            <div key={i} onClick={() => { onSelect(r.convId); onClose(); }} style={{ padding: "12px 16px", borderBottom: `1px solid ${t.border}`, cursor: "pointer", transition: "background 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background = t.bg}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <p style={{ color: t.accent, fontSize: "11px", fontFamily: "monospace", margin: "0 0 4px" }}>{r.convTitle} · {fmtDate(r.ts)}</p>
              <p style={{ color: t.text, fontSize: "13px", margin: 0, fontFamily: "'IBM Plex Sans', sans-serif" }}>...{r.snippet}...</p>
            </div>
          ))}
          {!query && <p style={{ padding: "20px", color: t.textMuted, textAlign: "center", fontSize: "13px" }}>Escribí para buscar en todas tus conversaciones</p>}
        </div>
      </div>
    </div>
  );
};

// ─── SHORTCUTS MODAL ─────────────────────────────────────────────────────────
const ShortcutsModal = ({ onClose, theme }) => {
  const t = theme;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: "14px", width: "420px", padding: "24px", boxShadow: `0 20px 60px rgba(0,0,0,0.5)` }} onClick={e => e.stopPropagation()}>
        <h3 style={{ color: t.text, fontFamily: "'Syne', sans-serif", fontSize: "16px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>⌨️ Atajos de teclado</h3>
        {SHORTCUTS.map((s, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${t.border}` }}>
            <span style={{ color: t.text, fontSize: "13px", fontFamily: "'IBM Plex Sans', sans-serif" }}>{s.action}</span>
            <div style={{ display: "flex", gap: "4px" }}>
              {s.keys.map((k, j) => <kbd key={j} style={{ background: t.bg, border: `1px solid ${t.border}`, color: t.accent, padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontFamily: "monospace" }}>{k}</kbd>)}
            </div>
          </div>
        ))}
        <button onClick={onClose} style={{ marginTop: "16px", width: "100%", padding: "10px", background: t.accentGrad, border: "none", borderRadius: "8px", color: "#fff", cursor: "pointer", fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "13px" }}>Cerrar</button>
      </div>
    </div>
  );
};

// ─── DIFF MODAL ───────────────────────────────────────────────────────────────
const DiffModal = ({ original, modified, onClose, theme }) => {
  const t = theme;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }} onClick={onClose}>
      <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: "14px", width: "900px", maxWidth: "95vw", maxHeight: "80vh", overflow: "hidden", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ color: t.text, fontFamily: "'Syne', sans-serif", fontSize: "15px", margin: 0 }}>📊 Vista de diferencias</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: t.textMuted, cursor: "pointer", fontSize: "20px" }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          <DiffView original={original} modified={modified} theme={t} />
        </div>
      </div>
    </div>
  );
};

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
const Sidebar = ({ conversations, activeId, onSelect, onNew, onDelete, onRename, isOpen, theme }) => {
  const t = theme;
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState("");

  const grouped = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const week = new Date(today); week.setDate(week.getDate() - 7);
    const groups = { "Hoy": [], "Ayer": [], "Esta semana": [], "Antes": [] };
    [...conversations].sort((a, b) => b.updatedAt - a.updatedAt).forEach(c => {
      const d = new Date(c.updatedAt); d.setHours(0, 0, 0, 0);
      if (d >= today) groups["Hoy"].push(c);
      else if (d >= yesterday) groups["Ayer"].push(c);
      else if (d >= week) groups["Esta semana"].push(c);
      else groups["Antes"].push(c);
    });
    return groups;
  }, [conversations]);

  return (
    <div style={{ width: isOpen ? "260px" : "0px", minWidth: isOpen ? "260px" : "0px", background: t.bg, borderRight: `1px solid ${t.border}`, display: "flex", flexDirection: "column", overflow: "hidden", transition: "all 0.3s ease" }}>
      <div style={{ padding: "16px 12px 10px", borderBottom: `1px solid ${t.border}` }}>
        <button onClick={onNew} style={{ width: "100%", padding: "9px", background: `${t.accent}18`, border: `1px solid ${t.accent}33`, borderRadius: "10px", color: t.accent, cursor: "pointer", fontSize: "13px", fontFamily: "'IBM Plex Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", transition: "all 0.2s" }}
          onMouseEnter={e => e.currentTarget.style.background = `${t.accent}28`}
          onMouseLeave={e => e.currentTarget.style.background = `${t.accent}18`}>
          <span>+</span> Nueva conversación
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
        {conversations.length === 0 && <p style={{ color: t.textMuted, fontSize: "12px", textAlign: "center", padding: "20px 10px" }}>No hay conversaciones aún</p>}
        {Object.entries(grouped).map(([group, convs]) => convs.length === 0 ? null : (
          <div key={group}>
            <p style={{ color: t.textMuted, fontSize: "10px", fontFamily: "monospace", padding: "8px 6px 4px", letterSpacing: "0.08em", textTransform: "uppercase" }}>{group}</p>
            {convs.map(conv => (
              <div key={conv.id} style={{ position: "relative", group: "true" }}>
                {renaming === conv.id ? (
                  <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                    onBlur={() => { onRename(conv.id, renameVal); setRenaming(null); }}
                    onKeyDown={e => { if (e.key === "Enter") { onRename(conv.id, renameVal); setRenaming(null); } if (e.key === "Escape") setRenaming(null); }}
                    style={{ width: "100%", padding: "8px 10px", background: t.surface, border: `1px solid ${t.accent}`, borderRadius: "8px", color: t.text, fontSize: "12px", fontFamily: "'IBM Plex Sans', sans-serif", outline: "none" }} />
                ) : (
                  <div onClick={() => onSelect(conv.id)}
                    onDoubleClick={() => { setRenaming(conv.id); setRenameVal(conv.title); }}
                    style={{ padding: "9px 10px", borderRadius: "8px", cursor: "pointer", marginBottom: "2px", background: activeId === conv.id ? t.surface : "transparent", border: `1px solid ${activeId === conv.id ? t.border : "transparent"}`, transition: "all 0.15s", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                    onMouseEnter={e => { if (activeId !== conv.id) e.currentTarget.style.background = `${t.accent}08`; e.currentTarget.querySelector(".del-btn").style.opacity = "1"; }}
                    onMouseLeave={e => { if (activeId !== conv.id) e.currentTarget.style.background = "transparent"; e.currentTarget.querySelector(".del-btn").style.opacity = "0"; }}>
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <p style={{ color: activeId === conv.id ? t.accent : t.text, fontSize: "12px", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'IBM Plex Sans', sans-serif" }}>{conv.title || "Sin título"}</p>
                      <p style={{ color: t.textMuted, fontSize: "10px", margin: "2px 0 0", fontFamily: "monospace" }}>{fmtDate(conv.updatedAt)} · {conv.messages?.length || 0} msgs</p>
                    </div>
                    <button className="del-btn" onClick={e => { e.stopPropagation(); onDelete(conv.id); }} style={{ background: "none", border: "none", color: "#ff5555", cursor: "pointer", fontSize: "13px", padding: "2px 4px", opacity: 0, transition: "opacity 0.2s" }}>🗑</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ padding: "10px 12px", borderTop: `1px solid ${t.border}` }}>
        <p style={{ color: t.textMuted, fontSize: "10px", textAlign: "center", fontFamily: "monospace" }}>{conversations.length} conversaciones · Firebase sync ✓</p>
      </div>
    </div>
  );
};

// ─── SUGGESTIONS ──────────────────────────────────────────────────────────────
const SUGGESTIONS = [
  { icon: "🐛", text: "Tengo un bug que no puedo resolver, ayudame" },
  { icon: "⚡", text: "¿Cómo optimizo el rendimiento de mi app?" },
  { icon: "🏗", text: "Explicame patrones de diseño con ejemplos" },
  { icon: "🔒", text: "Revisá mi código buscando vulnerabilidades" },
  { icon: "🧪", text: "¿Cómo escribo tests para este módulo?" },
  { icon: "🚀", text: "Ayudame a configurar CI/CD con GitHub Actions" },
];

// ─── FIREBASE REST API ────────────────────────────────────────────────────────
// Uses Firestore REST API (works in sandboxed artifact environments)
const FB_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;
const FB_KEY = FIREBASE_CONFIG.apiKey;

const toFSValue = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return { integerValue: String(Math.round(v)) };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFSValue) } };
  if (typeof v === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, val]) => [k, toFSValue(val)])) } };
  return { stringValue: String(v) };
};

const fromFSValue = (v) => {
  if (!v) return null;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.nullValue !== undefined) return null;
  if (v.arrayValue) return (v.arrayValue.values || []).map(fromFSValue);
  if (v.mapValue) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, val]) => [k, fromFSValue(val)]));
  return null;
};

const toFSDoc = (obj) => ({ fields: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toFSValue(v)])) });
const fromFSDoc = (doc) => Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, fromFSValue(v)]));

const useFirebase = () => {
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    fetch(`${FB_BASE}?key=${FB_KEY}&pageSize=1`)
      .then(r => { setStatus(r.ok || r.status === 404 ? "ready" : "error"); })
      .catch(() => setStatus("error"));
  }, []);

  const saveConversation = useCallback(async (conv) => {
    try {
      const doc = {
        ...conv,
        messages: conv.messages.map(m => ({
          ...m,
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
          attachments: (m.attachments || []).map(a => ({ name: a.name, type: a.type || "", size: a.size || 0 })),
        })),
      };
      await fetch(`${FB_BASE}/conversations/${conv.id}?key=${FB_KEY}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toFSDoc(doc)),
      });
    } catch (e) { console.error("Save error:", e); }
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const r = await fetch(`${FB_BASE}/conversations?key=${FB_KEY}&orderBy=updatedAt+desc&pageSize=100`);
      if (!r.ok) return [];
      const data = await r.json();
      return (data.documents || []).map(d => {
        const conv = fromFSDoc(d);
        return {
          ...conv,
          messages: (conv.messages || []).map(m => ({
            ...m,
            content: (() => { try { return typeof m.content === "string" && m.content.startsWith("[") ? JSON.parse(m.content) : m.content; } catch { return m.content; } })(),
          })),
        };
      });
    } catch (e) { console.error("Load error:", e); return []; }
  }, []);

  const deleteConversationFromDB = useCallback(async (id) => {
    try {
      await fetch(`${FB_BASE}/conversations/${id}?key=${FB_KEY}`, { method: "DELETE" });
    } catch (e) { console.error("Delete error:", e); }
  }, []);

  return { status, saveConversation, loadConversations, deleteConversationFromDB };
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function DevMindUltimate() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [themeKey, setThemeKey] = useState("dark");
  const [modal, setModal] = useState(null); // null | "search" | "shortcuts" | "diff" | "export"
  const [diffData, setDiffData] = useState(null);
  const [notification, setNotification] = useState(null);
  const [appReady, setAppReady] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const theme = THEMES[themeKey];
  const { status: fbStatus, saveConversation, loadConversations, deleteConversationFromDB } = useFirebase();

  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const saveTimerRef = useRef({});

  const activeConv = conversations.find(c => c.id === activeId);
  const messages = activeConv?.messages || [];

  // ── LOAD FROM FIREBASE ───────────────────────────────────────────────────────
  useEffect(() => {
    if (fbStatus !== "ready") return;
    loadConversations().then(convs => {
      if (convs.length > 0) {
        setConversations(convs);
        setActiveId(convs[0].id);
      }
      setAppReady(true);
    });
  }, [fbStatus, loadConversations]);

  useEffect(() => { if (fbStatus === "error") setAppReady(true); }, [fbStatus]);

  // ── AUTO SAVE ─────────────────────────────────────────────────────────────────
  const debouncedSave = useCallback((conv) => {
    if (saveTimerRef.current[conv.id]) clearTimeout(saveTimerRef.current[conv.id]);
    saveTimerRef.current[conv.id] = setTimeout(() => saveConversation(conv), 1500);
  }, [saveConversation]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  // ── KEYBOARD SHORTCUTS ───────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") { setModal(null); return; }
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === "k") { e.preventDefault(); setModal("search"); }
      if (e.key === "n") { e.preventDefault(); createConversation(); }
      if (e.key === "b") { e.preventDefault(); setSidebarOpen(v => !v); }
      if (e.key === "e") { e.preventDefault(); if (activeConv) exportConversation(activeConv); }
      if (e.key === "d") { e.preventDefault(); cycleTheme(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeConv, themeKey]);

  const cycleTheme = () => {
    const keys = Object.keys(THEMES);
    setThemeKey(prev => keys[(keys.indexOf(prev) + 1) % keys.length]);
  };

  const showNotif = (msg, type = "info") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // ── CONVERSATION CRUD ────────────────────────────────────────────────────────
  const createConversation = useCallback(() => {
    const id = genId();
    const conv = { id, title: "Nueva conversación", messages: [], createdAt: Date.now(), updatedAt: Date.now() };
    setConversations(prev => [conv, ...prev]);
    setActiveId(id);
    return id;
  }, []);

  const deleteConversation = useCallback((id) => {
    deleteConversationFromDB(id);
    setConversations(prev => {
      const next = prev.filter(c => c.id !== id);
      if (activeId === id) setActiveId(next[0]?.id || null);
      return next;
    });
    showNotif("Conversación eliminada");
  }, [activeId, deleteConversationFromDB]);

  const renameConversation = useCallback((id, title) => {
    setConversations(prev => prev.map(c => {
      if (c.id !== id) return c;
      const updated = { ...c, title: title || c.title, updatedAt: Date.now() };
      debouncedSave(updated);
      return updated;
    }));
  }, [debouncedSave]);

  const updateConversation = useCallback((id, updater) => {
    setConversations(prev => prev.map(c => {
      if (c.id !== id) return c;
      const updated = { ...updater(c), updatedAt: Date.now() };
      debouncedSave(updated);
      return updated;
    }));
  }, [debouncedSave]);

  // ── EXPORT ──────────────────────────────────────────────────────────────────
  const exportConversation = (conv) => {
    const lines = [`# ${conv.title}`, `Exportado: ${fmtDateFull(Date.now())}`, `Total mensajes: ${conv.messages.length}`, "", "---", ""];
    conv.messages.forEach(m => {
      const role = m.role === "user" ? "👤 Vos" : "⚡ DevMind Pro";
      const text = typeof m.content === "string" ? m.content : m.content?.find?.(b => b.type === "text")?.text || "";
      lines.push(`### ${role} — ${fmtDate(m.timestamp || 0)}`, "", text, "", "---", "");
    });
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${conv.title.replace(/[^a-z0-9]/gi, "_")}.md`; a.click();
    URL.revokeObjectURL(url);
    showNotif("Conversación exportada como Markdown ✓");
  };

  // ── FILE HANDLING ────────────────────────────────────────────────────────────
  const handleFiles = (files) => {
    Array.from(files).forEach(f => {
      if (f.size > 15 * 1024 * 1024) { showNotif(`${f.name} supera 15MB`, "error"); return; }
      setPendingFiles(prev => [...prev, f]);
    });
  };

  // ── BUILD API MESSAGES ───────────────────────────────────────────────────────
  const buildApiMessages = async (convMsgs, text, files) => {
    const history = convMsgs.map(m => ({ role: m.role, content: typeof m.content === "string" ? m.content : m.content }));
    if (!files.length) return [...history, { role: "user", content: text }];
    const blocks = [];
    for (const f of files) {
      if (isImage(f)) { const b64 = await readAsBase64(f); blocks.push({ type: "image", source: { type: "base64", media_type: getMediaType(f), data: b64 } }); }
      else if (isPDF(f)) { const b64 = await readAsBase64(f); blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }); }
      else if (isCode(f)) { const txt = await readAsText(f); blocks.push({ type: "text", text: `**Archivo: ${f.name}**\n\`\`\`${getExt(f.name)}\n${txt}\n\`\`\`` }); }
    }
    if (text) blocks.push({ type: "text", text });
    return [...history, { role: "user", content: blocks }];
  };

  // ── SEND MESSAGE ─────────────────────────────────────────────────────────────
  const sendMessage = async (overrideText) => {
    const text = overrideText ?? input.trim();
    if ((!text && !pendingFiles.length) || loading) return;
    let convId = activeId || createConversation();
    const filesToSend = [...pendingFiles];
    const originalCode = filesToSend.length > 0 && isCode(filesToSend[0])
      ? await readAsText(filesToSend[0]).catch(() => null) : null;

    const userMsg = { role: "user", content: text, timestamp: Date.now(), attachments: filesToSend.map(f => ({ name: f.name, type: f.type, size: f.size })) };
    setInput(""); setPendingFiles([]); setLoading(true);

    updateConversation(convId, conv => ({
      ...conv,
      messages: [...conv.messages, userMsg],
      title: conv.messages.length === 0 ? (text?.slice(0, 48) || filesToSend[0]?.name || "Conversación") : conv.title,
    }));

    try {
      const currentConv = conversations.find(c => c.id === convId) || { messages: [] };
      const apiMsgs = await buildApiMessages(currentConv.messages, text, filesToSend);
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 8192, system: SYSTEM_PROMPT, messages: apiMsgs }),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      const assistantText = data.content?.map(b => b.text || "").join("") || "Sin respuesta.";
      const assistantMsg = { role: "assistant", content: assistantText, timestamp: Date.now(), ...(originalCode ? { originalCode } : {}) };
      updateConversation(convId, conv => ({ ...conv, messages: [...conv.messages, assistantMsg] }));
    } catch (err) {
      updateConversation(convId, conv => ({ ...conv, messages: [...conv.messages, { role: "assistant", content: `Error: ${err.message}. Revisá tu conexión e intentá de nuevo.`, timestamp: Date.now() }] }));
      showNotif("Error al conectar con la API", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  const t = theme;

  // ── LOADING SCREEN ───────────────────────────────────────────────────────────
  if (!appReady) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: t.bg, gap: "16px" }}>
        <div style={{ fontSize: "48px", animation: "pulseGlow 1.5s infinite" }}>⚡</div>
        <p style={{ color: t.accent, fontFamily: "monospace", fontSize: "14px" }}>
          {fbStatus === "loading" ? "Conectando con Firebase..." : fbStatus === "error" ? "Firebase no disponible, cargando offline..." : "Inicializando DevMind Pro..."}
        </p>
        <div style={{ display: "flex", gap: "6px" }}>
          {[0, 1, 2].map(i => <div key={i} style={{ width: "8px", height: "8px", borderRadius: "50%", background: t.accent, animation: "bounce 1.2s infinite", animationDelay: `${i * 0.2}s` }} />)}
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&family=Syne:wght@400;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:${t.bg}}
        @keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-6px)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulseGlow{0%,100%{opacity:0.7}50%{opacity:1}}
        @keyframes slideIn{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:translateX(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        textarea:focus{outline:none}
        textarea::placeholder{color:${t.textMuted}}
        input::placeholder{color:${t.textMuted}}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${t.border};border-radius:2px}
      `}</style>

      <div style={{ display: "flex", height: "100vh", background: t.bg, fontFamily: "'IBM Plex Sans', sans-serif", overflow: "hidden" }}>

        {/* SIDEBAR */}
        <Sidebar conversations={conversations} activeId={activeId} onSelect={setActiveId} onNew={createConversation} onDelete={deleteConversation} onRename={renameConversation} isOpen={sidebarOpen} theme={t} />

        {/* MAIN */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

          {/* HEADER */}
          <div style={{ padding: "12px 18px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: "10px", background: t.bg, flexShrink: 0, zIndex: 10 }}>
            <button onClick={() => setSidebarOpen(v => !v)} title="Ctrl+B" style={{ background: "none", border: `1px solid ${t.border}`, color: t.accent, width: "32px", height: "32px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
              {sidebarOpen ? "◀" : "▶"}
            </button>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: t.accentGrad, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "17px", boxShadow: `0 0 16px ${t.accent}44`, animation: "pulseGlow 3s infinite" }}>⚡</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ color: t.text, fontSize: "16px", fontWeight: 800, fontFamily: "'Syne', sans-serif", letterSpacing: "-0.02em" }}>DevMind Pro</h1>
              <p style={{ color: t.textMuted, fontSize: "11px", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {activeConv ? `${activeConv.title} · ${activeConv.messages.length} mensajes` : "Seleccioná o creá una conversación"}
              </p>
            </div>
            {/* TOOLBAR */}
            <div style={{ display: "flex", gap: "6px" }}>
              {[
                { icon: "🔍", title: "Buscar (Ctrl+K)", action: () => setModal("search") },
                { icon: "📤", title: "Exportar (Ctrl+E)", action: () => activeConv && exportConversation(activeConv) },
                { icon: "🎨", title: "Tema (Ctrl+D)", action: cycleTheme, label: THEMES[themeKey].name },
                { icon: "⌨️", title: "Atajos", action: () => setModal("shortcuts") },
              ].map((btn, i) => (
                <button key={i} onClick={btn.action} title={btn.title} style={{ background: "none", border: `1px solid ${t.border}`, color: t.accent, padding: "5px 10px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontFamily: "monospace", display: "flex", alignItems: "center", gap: "4px", transition: "all 0.2s", whiteSpace: "nowrap" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = `${t.accent}66`}
                  onMouseLeave={e => e.currentTarget.style.borderColor = t.border}>
                  {btn.icon}{btn.label ? ` ${btn.label}` : ""}
                </button>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 10px", background: fbStatus === "ready" ? `${t.accent}12` : "#2a0d0d", border: `1px solid ${fbStatus === "ready" ? `${t.accent}33` : "#ff555533"}`, borderRadius: "8px" }}>
                <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: fbStatus === "ready" ? "#50fa7b" : "#ff5555", animation: "pulseGlow 2s infinite" }} />
                <span style={{ color: fbStatus === "ready" ? "#50fa7b" : "#ff5555", fontSize: "10px", fontFamily: "monospace" }}>Firebase</span>
              </div>
            </div>
          </div>

          {/* NOTIFICATION */}
          {notification && (
            <div style={{ position: "fixed", top: "68px", right: "16px", padding: "10px 16px", background: notification.type === "error" ? "#2a0d0d" : t.surface, border: `1px solid ${notification.type === "error" ? "#ff5555" : t.accent}`, borderRadius: "10px", color: notification.type === "error" ? "#ff5555" : t.accent, fontSize: "12px", zIndex: 100, animation: "slideIn 0.2s ease", fontFamily: "monospace" }}>
              {notification.msg}
            </div>
          )}

          {/* MESSAGES AREA */}
          <div
            style={{ flex: 1, overflowY: "auto", padding: "20px 18px", background: dragOver ? `${t.accent}08` : "transparent", transition: "background 0.2s", border: dragOver ? `2px dashed ${t.accent}44` : "2px dashed transparent" }}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          >
            <div style={{ maxWidth: "840px", margin: "0 auto" }}>
              {!activeConv && (
                <div style={{ textAlign: "center", paddingTop: "40px", animation: "fadeUp 0.4s ease" }}>
                  <div style={{ fontSize: "52px", marginBottom: "14px", filter: `drop-shadow(0 0 20px ${t.accent})` }}>⚡</div>
                  <h2 style={{ color: t.text, fontSize: "28px", fontWeight: 800, fontFamily: "'Syne', sans-serif", letterSpacing: "-0.04em", marginBottom: "8px" }}>DevMind Pro</h2>
                  <p style={{ color: t.textMuted, fontSize: "14px", marginBottom: "10px" }}>Tu asistente personal de programación. Sin límites.</p>
                  <div style={{ display: "flex", gap: "6px", justifyContent: "center", flexWrap: "wrap", marginBottom: "36px" }}>
                    {["código", "PDFs", "imágenes", "Firebase", "historial", "sin límites"].map(tag => (
                      <span key={tag} style={{ padding: "3px 10px", background: `${t.accent}14`, border: `1px solid ${t.accent}33`, borderRadius: "20px", color: t.accent, fontSize: "11px", fontFamily: "monospace" }}>{tag}</span>
                    ))}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", maxWidth: "560px", margin: "0 auto" }}>
                    {SUGGESTIONS.map((s, i) => (
                      <button key={i} onClick={() => { const id = createConversation(); setTimeout(() => sendMessage(s.text), 50); }} style={{ background: t.surface, border: `1px solid ${t.border}`, color: t.text, padding: "12px 14px", borderRadius: "10px", cursor: "pointer", fontSize: "12px", fontFamily: "'IBM Plex Sans', sans-serif", textAlign: "left", transition: "all 0.2s", lineHeight: 1.4 }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = `${t.accent}44`; e.currentTarget.style.color = t.accent; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.color = t.text; }}>
                        <span style={{ marginRight: "6px" }}>{s.icon}</span>{s.text}
                      </button>
                    ))}
                  </div>
                  <p style={{ color: t.textMuted, fontSize: "11px", marginTop: "24px", fontFamily: "monospace" }}>💡 Arrastrá archivos al chat · Doble click en conversación para renombrar</p>
                </div>
              )}
              {activeConv && messages.length === 0 && (
                <div style={{ textAlign: "center", paddingTop: "50px" }}>
                  <p style={{ color: t.textMuted, fontSize: "14px" }}>Conversación vacía. ¿Por dónde arrancamos?</p>
                </div>
              )}
              {messages.map((msg, i) => (
                <MessageBubble key={i} message={msg} theme={t} onShowDiff={(orig, mod) => { setDiffData({ original: orig, modified: mod }); setModal("diff"); }} />
              ))}
              {loading && <TypingIndicator theme={t} />}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* INPUT */}
          <div style={{ padding: "10px 18px 18px", borderTop: `1px solid ${t.border}`, background: t.bg, flexShrink: 0 }}>
            <div style={{ maxWidth: "840px", margin: "0 auto" }}>
              {pendingFiles.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                  {pendingFiles.map((f, i) => <FileBadge key={i} file={f} theme={t} onRemove={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))} />)}
                </div>
              )}
              <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", background: t.surface, border: `1px solid ${t.border}`, borderRadius: "14px", padding: "10px 12px", transition: "border-color 0.2s" }}
                onFocus={e => e.currentTarget.style.borderColor = `${t.accent}55`}
                onBlur={e => e.currentTarget.style.borderColor = t.border}
              >
                <button onClick={() => fileInputRef.current?.click()} title="Subir archivo" style={{ background: "none", border: `1px solid ${t.border}`, color: t.textMuted, width: "32px", height: "32px", borderRadius: "8px", cursor: "pointer", fontSize: "15px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = `${t.accent}55`; e.currentTarget.style.color = t.accent; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.color = t.textMuted; }}>📎</button>
                <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
                  placeholder="Escribí, pegá código, o subí un archivo... (Enter para enviar)"
                  disabled={loading} rows={1}
                  style={{ flex: 1, background: "none", border: "none", color: t.text, fontSize: "14px", fontFamily: "'IBM Plex Sans', sans-serif", resize: "none", lineHeight: "1.6", minHeight: "24px", maxHeight: "180px", overflowY: "auto" }}
                  onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 180) + "px"; }} />
                <button onClick={() => sendMessage()} disabled={loading || (!input.trim() && !pendingFiles.length)} style={{
                  width: "34px", height: "34px", borderRadius: "9px", border: "none", flexShrink: 0,
                  background: loading || (!input.trim() && !pendingFiles.length) ? t.border : t.accentGrad,
                  cursor: loading || (!input.trim() && !pendingFiles.length) ? "not-allowed" : "pointer",
                  color: "#fff", fontSize: "15px", display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: loading || (!input.trim() && !pendingFiles.length) ? "none" : `0 0 12px ${t.accent}55`,
                  transition: "all 0.2s",
                }}>{loading ? <div style={{ width: "14px", height: "14px", border: "2px solid #ffffff44", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> : "→"}</button>
              </div>
              <p style={{ color: t.textMuted, fontSize: "10px", textAlign: "center", marginTop: "6px", fontFamily: "monospace" }}>
                Enter enviar · Shift+Enter nueva línea · Ctrl+K buscar · Ctrl+N nueva · Ctrl+E exportar
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* MODALS */}
      {modal === "search" && <SearchModal conversations={conversations} onSelect={setActiveId} onClose={() => setModal(null)} theme={t} />}
      {modal === "shortcuts" && <ShortcutsModal onClose={() => setModal(null)} theme={t} />}
      {modal === "diff" && diffData && <DiffModal original={diffData.original} modified={diffData.modified} onClose={() => setModal(null)} theme={t} />}

      <input ref={fileInputRef} type="file" multiple
        accept=".py,.js,.ts,.jsx,.tsx,.html,.css,.java,.cpp,.c,.cs,.go,.rs,.rb,.php,.sh,.sql,.json,.yaml,.yml,.md,.txt,.vue,.svelte,.kt,.swift,.dart,.pdf,.png,.jpg,.jpeg,.gif,.webp"
        style={{ display: "none" }} onChange={e => handleFiles(e.target.files)} />
    </>
  );
}
