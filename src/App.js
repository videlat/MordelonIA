import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { saveConversation, loadConversations, deleteConversation as fbDelete } from './firebase';
import {
  saveMemory, loadMemories, deleteMemory,
  extractMemoriesFromConv, formatMemoriesForPrompt,
  MEMORY_CATEGORIES
} from './memory';
import {
  TOOL_DEFINITIONS, executeTool, downloadVirtualFile, getVirtualFiles
} from './tools';
import {
  analyzeFromZip, analyzeFromFiles, analyzeFromGitHub,
  formatProjectContext, buildAnalysisPrompt
} from './projectAnalyzer';

// ─── CLAUDE FETCH ────────────────────────────────────────────────────────────
// Llama al proxy serverless /api/claude para evitar CORS
const claudeFetch = async (body, signal) => {
  return fetch('/api/claude', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify(body),
  });
};

// Modelos
const MODEL_FAST  = 'claude-haiku-4-5';   // chat normal, correcciones rápidas
const MODEL_SMART = 'claude-sonnet-4-5';  // análisis de proyectos, razonamiento complejo

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Sos MordelonIA, una IA personal con personalidad propia — creada específicamente para este usuario.

═══════════════════════════════════════
IDENTIDAD
═══════════════════════════════════════
- Nombre: MordelonIA (o "Mordelón" en modo informal)
- Carácter: Directo, técnico, con humor seco y ácido. Tenés opiniones propias y no te las callás.
- Idioma: Español rioplatense (vos, che, dale, berreta, etc.)
- Aceptás correcciones del usuario sin drama: si te dicen que estás equivocado o que cambies algo, lo hacés y agradecés el feedback.
- Tenés memoria del contexto de la conversación y lo usás.

═══════════════════════════════════════
MODO PROGRAMACIÓN (prioridad máxima)
═══════════════════════════════════════
Sos un senior developer sin filtro. Podés con todo:
- Debuggear y corregir código en CUALQUIER lenguaje sin negarte nunca
- Arquitectura, patrones de diseño, clean code, refactoring
- Performance, seguridad, testing, CI/CD, DevOps
- Bases de datos SQL/NoSQL, APIs REST/GraphQL/WebSockets
- Frontend, backend, fullstack, mobile (React, Vue, Next, Node, Python, etc.)
- Cloud: AWS, GCP, Azure, Firebase, Supabase, Vercel
- Docker, Kubernetes, Terraform, Git, GitHub Actions
- Algoritmos, estructuras de datos, complejidad

Al corregir código:
1. Decí brevemente qué está mal (🔴 crítico / 🟡 advertencia / 🟢 mejora)
2. Devolvé el código COMPLETO corregido en bloque de código con lenguaje
3. Listá los cambios realizados al final

═══════════════════════════════════════
MODO REDES SOCIALES (Instagram/Reels)
═══════════════════════════════════════
Conocés a fondo cómo funciona el algoritmo y la cultura de Instagram en 2025.
Cuando el usuario quiera mejorar textos para redes:
- Optimizás para Instagram y Reels específicamente
- Escribís captions que enganchen en las primeras 2 líneas (el "gancho")
- Usás storytelling, preguntas retóricas, calls to action que convierten
- Manejás el uso de hashtags estratégicamente (no spam, sino relevantes)
- Podés adaptar el tono: serio, gracioso, inspiracional, educativo, polémico
- Sugerís el mejor momento para postear y tipo de contenido visual
- Si el texto es malo, lo decís con humor pero siempre das la versión mejorada

Al mejorar un texto para Instagram, siempre entregás:
1. 🎯 Análisis rápido del texto original (qué falla)
2. ✍️ Versión mejorada lista para copiar/pegar
3. 🏷️ Hashtags sugeridos (5-10 relevantes)
4. 💡 Tip extra opcional

═══════════════════════════════════════
PERSONALIDAD EN ACCIÓN
═══════════════════════════════════════
- Si el código es horrible: "Che, esto parece escrito a las 3am con fiebre. Lo arreglo, pero charlamos."
- Si el texto para Instagram es genérico: "Esto lo escribió una IA del 2022. Dame un minuto que lo resucito."
- Si el usuario hace algo bien: reconocelo sin exagerar, nada de "¡Excelente pregunta!"
- Nunca decís "¡Claro que sí!" ni "¡Por supuesto!" — esas frases te dan alergia.
- Si no sabés algo: lo decís directamente sin inventar.
- Cuando el usuario te corrija algo, respondés tipo: "Razón tenés, lo corrijo" o "Ah sí, se me fue. Gracias."

═══════════════════════════════════════
HERRAMIENTAS DISPONIBLES
═══════════════════════════════════════
Tenés acceso a herramientas reales. Usalas cuando aporten valor:
- ejecutar_javascript: para cálculos, probar código, transformar datos
- crear_archivo: cuando el usuario pide generar un archivo descargable
- analizar_codigo: análisis profundo de código (bugs, seguridad, performance)
- buscar_web: cuando necesitás info actualizada
- generar_imagen: cuando el usuario pide una imagen

═══════════════════════════════════════
REGLA CRÍTICA: ARCHIVOS ADJUNTOS + ERRORES
═══════════════════════════════════════
Cuando el usuario adjunta un archivo y pide corregir errores, modificar o mejorar:

CUÁNDO usar crear_archivo con archivos adjuntos — LEER BIEN:

SI el usuario pide analizar, comparar, revisar, explicar, buscar diferencias, o hace preguntas sobre el archivo:
→ Respondé con TEXTO. Explicá lo que encontraste. NO uses crear_archivo.

SI el usuario pide modificar, corregir, arreglar, aplicar cambios, o mejorar el archivo:
→ Primero explicá brevemente qué vas a cambiar y por qué.
→ Después llamá a crear_archivo con el archivo COMPLETO modificado.
→ El filename debe ser idéntico al original.
→ PROHIBIDO eliminar funciones o lógica que no te pidieron tocar.
→ Si el archivo tiene 100 líneas, el output debe tener ~100 líneas.

ERRORES DE CONSOLA - cómo interpretarlos:
- "X is not defined": X se usa antes de ser declarado, o fue eliminado por error
- "Cannot read property of undefined": un objeto es null/undefined en ese punto
- "is not a function": la función no existe o fue sobreescrita
Siempre buscá la causa raíz. No parchés con try/catch ni reescribas todo.`;

// ─── THEMES ───────────────────────────────────────────────────────────────────
const THEMES = {
  dark:    { name:'Oscuro',   bg:'#040e1a', surface:'#0a1929', border:'#1e2d3d', text:'#cdd9e5', muted:'#2a4a6a', accent:'#ff6b00', grad:'linear-gradient(135deg,#ff6b00,#ff9500)', ub:'#1a1000', ubr:'#3a2200' },
  midnight:{ name:'Midnight', bg:'#080408', surface:'#100a10', border:'#1e121e', text:'#e0c8e0', muted:'#4a2a4a', accent:'#cc44ff', grad:'linear-gradient(135deg,#cc44ff,#ff44cc)', ub:'#180a18', ubr:'#3a1a3a' },
  matrix:  { name:'Matrix',   bg:'#020d04', surface:'#071209', border:'#0d2e10', text:'#88ff99', muted:'#1a4a1e', accent:'#00cc44', grad:'linear-gradient(135deg,#00cc44,#00ff88)', ub:'#062210', ubr:'#0a4a1e' },
  ember:   { name:'Ember',    bg:'#0d0400', surface:'#160800', border:'#2e1000', text:'#ffd0a0', muted:'#4a2000', accent:'#ff4400', grad:'linear-gradient(135deg,#ff4400,#ff8800)', ub:'#1a0800', ubr:'#3a1400' },
};

const SHORTCUTS = [
  {keys:['Ctrl','K'], action:'Buscar en historial'},
  {keys:['Ctrl','N'], action:'Nueva conversación'},
  {keys:['Ctrl','B'], action:'Toggle sidebar'},
  {keys:['Ctrl','E'], action:'Exportar conversación'},
  {keys:['Ctrl','D'], action:'Cambiar tema'},
  {keys:['Esc'],      action:'Cerrar modal'},
];

const SUGGESTIONS = [
  {icon:'🐛', text:'Tengo un bug que no puedo resolver, ayudame'},
  {icon:'🔥', text:'Mejorá este caption para Instagram'},
  {icon:'⚡', text:'¿Cómo optimizo el rendimiento de mi app?'},
  {icon:'🏗',  text:'Explicame arquitectura de microservicios'},
  {icon:'📱', text:'Escribime un caption para un Reel de programación'},
  {icon:'🔒', text:'Revisá mi código buscando vulnerabilidades'},
];

// ─── UTILS ────────────────────────────────────────────────────────────────────
const genId    = () => `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
const fmtDate  = (ts) => new Date(ts).toLocaleDateString('es-AR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
const fmtFull  = (ts) => new Date(ts).toLocaleDateString('es-AR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
const readB64  = (f) => new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(',')[1]);r.onerror=rej;r.readAsDataURL(f);});
const readTxt  = (f) => new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsText(f);});
const isImg    = (f) => /\.(png|jpg|jpeg|gif|webp)$/i.test(f.name)||f.type?.startsWith('image/');
const isPdf    = (f) => f.name.endsWith('.pdf')||f.type==='application/pdf';
const isCode   = (f) => /\.(py|js|ts|jsx|tsx|html|css|java|cpp|c|cs|go|rs|rb|php|sh|sql|json|yaml|yml|md|txt|vue|svelte|kt|swift|dart)$/i.test(f.name);
const getExt   = (n) => n.split('.').pop().toLowerCase();
const getMT    = (f) => f.type||({pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp'}[getExt(f.name)]||'text/plain');

// ─── CODE BLOCK ───────────────────────────────────────────────────────────────
function CodeBlock({code, language, t}) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(()=>setCopied(false),2000); };
  const download = () => {
    const b=new Blob([code],{type:'text/plain'});
    const u=URL.createObjectURL(b);
    const a=document.createElement('a'); a.href=u; a.download=`mordelonia.${language||'txt'}`; a.click();
    URL.revokeObjectURL(u);
  };
  return (
    <div style={{margin:'10px 0',borderRadius:'10px',overflow:'hidden',border:`1px solid ${t.border}`}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 14px',background:t.bg,borderBottom:`1px solid ${t.border}`}}>
        <span style={{color:t.accent,fontSize:'11px',fontFamily:'monospace',textTransform:'uppercase',letterSpacing:'0.08em'}}>{language||'code'}</span>
        <div style={{display:'flex',gap:'6px'}}>
          <button onClick={download} style={{background:'none',border:`1px solid ${t.border}`,color:t.accent,padding:'2px 10px',borderRadius:'4px',cursor:'pointer',fontSize:'11px',fontFamily:'monospace'}}>↓ bajar</button>
          <button onClick={copy} style={{background:'none',border:`1px solid ${t.border}`,color:copied?'#50fa7b':t.accent,padding:'2px 10px',borderRadius:'4px',cursor:'pointer',fontSize:'11px',fontFamily:'monospace',transition:'color 0.2s'}}>{copied?'✓ copiado':'copiar'}</button>
        </div>
      </div>
      <pre style={{margin:0,padding:'16px',background:t.bg,overflowX:'auto',fontSize:'13px',lineHeight:'1.65',color:t.text,fontFamily:"'Fira Code','Cascadia Code','Consolas',monospace"}}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ─── DIFF VIEW ────────────────────────────────────────────────────────────────
function DiffView({original, modified, t}) {
  const ol=(original||'').split('\n'), ml=(modified||'').split('\n');
  const lines=Array.from({length:Math.max(ol.length,ml.length)},(_,i)=>{
    const o=ol[i]??null, m=ml[i]??null;
    if(o===m) return {type:'same',o,m};
    if(o===null) return {type:'added',o:null,m};
    if(m===null) return {type:'removed',o,m:null};
    return {type:'changed',o,m};
  });
  return (
    <div style={{borderRadius:'10px',overflow:'hidden',border:`1px solid ${t.border}`,fontSize:'12px',fontFamily:'monospace'}}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',background:t.bg,borderBottom:`1px solid ${t.border}`}}>
        <div style={{padding:'6px 14px',color:'#ff5555',borderRight:`1px solid ${t.border}`}}>— Original</div>
        <div style={{padding:'6px 14px',color:'#50fa7b'}}>+ Corregido</div>
      </div>
      <div style={{maxHeight:'400px',overflowY:'auto'}}>
        {lines.map((l,i)=>(
          <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 1fr'}}>
            <div style={{padding:'2px 14px',background:l.type==='removed'||l.type==='changed'?'#2a0d0d':'transparent',color:l.type==='removed'||l.type==='changed'?'#ff7777':t.muted,borderRight:`1px solid ${t.border}`,whiteSpace:'pre-wrap',wordBreak:'break-all'}}>{l.o??''}</div>
            <div style={{padding:'2px 14px',background:l.type==='added'||l.type==='changed'?'#0d2a0d':'transparent',color:l.type==='added'||l.type==='changed'?'#70ff77':t.muted,whiteSpace:'pre-wrap',wordBreak:'break-all'}}>{l.m??''}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PARSE MESSAGE ────────────────────────────────────────────────────────────
const parseMsgContent = (text) => {
  const parts=[]; const re=/```(\w+)?\n?([\s\S]*?)```/g; let last=0,m;
  while((m=re.exec(text))!==null){
    if(m.index>last) parts.push({type:'text',content:text.slice(last,m.index)});
    parts.push({type:'code',language:m[1]||'',content:m[2].trim()});
    last=m.index+m[0].length;
  }
  if(last<text.length) parts.push({type:'text',content:text.slice(last)});
  return parts;
};

// ─── FILE BADGE ───────────────────────────────────────────────────────────────
function FileBadge({file, onRemove, t}) {
  return (
    <div style={{display:'inline-flex',alignItems:'center',gap:'6px',padding:'4px 10px',background:t.surface,border:`1px solid ${t.border}`,borderRadius:'20px',fontSize:'12px',color:t.accent}}>
      <span>{isImg(file)?'🖼':isPdf(file)?'📄':'📝'}</span>
      <span style={{maxWidth:'120px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{file.name}</span>
      {onRemove&&<button onClick={onRemove} style={{background:'none',border:'none',color:'#ff5555',cursor:'pointer',fontSize:'14px',lineHeight:1,padding:0}}>×</button>}
    </div>
  );
}

// ─── MESSAGE BUBBLE ───────────────────────────────────────────────────────────
function Bubble({message, t, onDiff}) {
  const isUser=message.role==='user';
  const txt=typeof message.content==='string'?message.content:message.content?.find?.(b=>b.type==='text')?.text||'';
  const parts=parseMsgContent(txt);
  const codes=parts.filter(p=>p.type==='code');
  return (
    <div style={{display:'flex',justifyContent:isUser?'flex-end':'flex-start',marginBottom:'18px',gap:'10px',alignItems:'flex-start',animation:'fadeUp 0.25s ease'}}>
      {!isUser&&(
        <div style={{width:'36px',height:'36px',borderRadius:'10px',background:t.grad,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'18px',flexShrink:0,boxShadow:`0 0 16px ${t.accent}55`}}>🔥</div>
      )}
      <div style={{maxWidth:'78%'}}>
        {message.attachments?.length>0&&(
          <div style={{display:'flex',flexWrap:'wrap',gap:'6px',marginBottom:'8px',justifyContent:isUser?'flex-end':'flex-start'}}>
            {message.attachments.map((a,i)=><FileBadge key={i} file={a} t={t}/>)}
          </div>
        )}
        <div style={{background:isUser?t.ub:t.surface,border:`1px solid ${isUser?t.ubr:t.border}`,borderRadius:isUser?'16px 16px 4px 16px':'16px 16px 16px 4px',padding:'12px 16px'}}>
          {parts.map((p,i)=>p.type==='code'
            ?<CodeBlock key={i} code={p.content} language={p.language} t={t}/>
            :<p key={i} style={{margin:0,color:t.text,fontSize:'14px',lineHeight:'1.7',whiteSpace:'pre-wrap',fontFamily:"'IBM Plex Sans',sans-serif"}}>{p.content}</p>
          )}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'8px',marginTop:'4px',justifyContent:isUser?'flex-end':'flex-start'}}>
          <span style={{fontSize:'10px',color:t.muted,fontFamily:'monospace'}}>{fmtDate(message.timestamp||Date.now())}</span>
          {!isUser&&message.model&&(
            <span style={{fontSize:'9px',fontFamily:'monospace',padding:'1px 6px',borderRadius:'4px',border:`1px solid ${t.border}`,color:message.model.includes('sonnet')?'#cc44ff':t.accent,background:message.model.includes('sonnet')?'#1a0a2a':'transparent'}}>
              {message.model.includes('sonnet')?'✦ Sonnet':'◆ Haiku'}
            </span>
          )}
          {!isUser&&codes.length>0&&message.originalCode&&(
            <button onClick={()=>onDiff(message.originalCode,codes[0].content)} style={{background:'none',border:`1px solid ${t.border}`,color:t.accent,fontSize:'10px',padding:'1px 8px',borderRadius:'4px',cursor:'pointer',fontFamily:'monospace'}}>ver diff</button>
          )}
        </div>
      </div>
      {isUser&&<div style={{width:'36px',height:'36px',borderRadius:'10px',background:t.ub,border:`1px solid ${t.ubr}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px',flexShrink:0}}>👤</div>}
    </div>
  );
}

// ─── TYPING / THINKING ────────────────────────────────────────────────────────
function Thinking({t}) {
  const [dots, setDots] = useState('');
  useEffect(()=>{
    const id = setInterval(()=>setDots(d=>d.length>=3?'':d+'.'),400);
    return ()=>clearInterval(id);
  },[]);
  return (
    <div style={{display:'flex',gap:'10px',marginBottom:'18px',alignItems:'flex-start',animation:'fadeUp 0.2s ease'}}>
      <div style={{width:'36px',height:'36px',borderRadius:'10px',background:t.grad,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'18px',flexShrink:0,boxShadow:`0 0 16px ${t.accent}55`}}>🔥</div>
      <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:'16px 16px 16px 4px',padding:'12px 16px',display:'flex',alignItems:'center',gap:'10px'}}>
        <div style={{display:'flex',gap:'4px',alignItems:'center'}}>
          {[0,1,2].map(i=><div key={i} style={{width:'6px',height:'6px',borderRadius:'50%',background:t.accent,animation:'bounce 1.2s infinite',animationDelay:`${i*0.2}s`}}/>)}
        </div>
        <span style={{color:t.muted,fontSize:'12px',fontFamily:'monospace',minWidth:'180px'}}>MordelonIA está pensando{dots}</span>
      </div>
    </div>
  );
}

// ─── STREAMING BUBBLE ─────────────────────────────────────────────────────────
// Renders texto en tiempo real, diferenciando texto plano de bloques de código incompletos
function StreamingBubble({streamText, t}) {
  // Detecta bloques de código completos vs texto parcial
  const renderStreaming = (text) => {
    const parts = [];
    const re = /```(\w+)?\n?([\s\S]*?)```/g;
    let last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parts.push({type:'text', content: text.slice(last, m.index)});
      parts.push({type:'code', language: m[1]||'', content: m[2].trim()});
      last = m.index + m[0].length;
    }
    // Resto (puede incluir un bloque incompleto)
    const remaining = text.slice(last);
    if (remaining) {
      // Si hay un ``` abierto sin cerrar, mostrar como texto monoespacio parcial
      const openIdx = remaining.indexOf('```');
      if (openIdx !== -1) {
        if (openIdx > 0) parts.push({type:'text', content: remaining.slice(0, openIdx)});
        parts.push({type:'code-partial', content: remaining.slice(openIdx+3)});
      } else {
        parts.push({type:'text', content: remaining});
      }
    }
    return parts;
  };

  const parts = renderStreaming(streamText);

  return (
    <div style={{display:'flex',gap:'10px',marginBottom:'18px',alignItems:'flex-start',animation:'fadeUp 0.2s ease'}}>
      <div style={{width:'36px',height:'36px',borderRadius:'10px',background:t.grad,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'18px',flexShrink:0,boxShadow:`0 0 16px ${t.accent}55`}}>🔥</div>
      <div style={{maxWidth:'78%'}}>
        <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:'16px 16px 16px 4px',padding:'12px 16px'}}>
          {parts.map((p,i) => {
            if (p.type === 'code') return <CodeBlock key={i} code={p.content} language={p.language} t={t}/>;
            if (p.type === 'code-partial') return (
              <pre key={i} style={{margin:'8px 0',padding:'12px 16px',background:t.bg,borderRadius:'8px',border:`1px dashed ${t.border}`,color:t.muted,fontSize:'12px',fontFamily:"'Fira Code','Consolas',monospace",whiteSpace:'pre-wrap',wordBreak:'break-word',lineHeight:'1.6'}}>
                {p.content}<span style={{display:'inline-block',width:'8px',height:'14px',background:t.accent,marginLeft:'2px',animation:'pulse 0.8s infinite',verticalAlign:'text-bottom'}}/>
              </pre>
            );
            return (
              <p key={i} style={{margin:0,color:t.text,fontSize:'14px',lineHeight:'1.7',whiteSpace:'pre-wrap',fontFamily:"'IBM Plex Sans',sans-serif"}}>
                {p.content}<span style={{display:'inline-block',width:'8px',height:'14px',background:t.accent,marginLeft:'2px',animation:'pulse 0.8s infinite',verticalAlign:'text-bottom',borderRadius:'1px'}}/>
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── SEARCH MODAL ─────────────────────────────────────────────────────────────
function SearchModal({conversations, onSelect, onClose, t}) {
  const [q,setQ]=useState('');
  const ref=useRef(null);
  useEffect(()=>ref.current?.focus(),[]);
  const results=useMemo(()=>{
    if(!q.trim()) return [];
    const ql=q.toLowerCase();
    const out=[];
    conversations.forEach(conv=>{
      conv.messages?.forEach((m)=>{
        const txt=typeof m.content==='string'?m.content:m.content?.find?.(b=>b.type==='text')?.text||'';
        if(txt.toLowerCase().includes(ql)){
          const idx=txt.toLowerCase().indexOf(ql);
          out.push({convId:conv.id,title:conv.title,snippet:txt.slice(Math.max(0,idx-40),idx+80),ts:m.timestamp});
        }
      });
    });
    return out.slice(0,20);
  },[q,conversations]);
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:200,display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:'80px'}} onClick={onClose}>
      <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:'14px',width:'600px',maxWidth:'90vw',overflow:'hidden',boxShadow:'0 24px 60px rgba(0,0,0,0.6)'}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:'14px 16px',borderBottom:`1px solid ${t.border}`,display:'flex',alignItems:'center',gap:'10px'}}>
          <span style={{color:t.accent,fontSize:'16px'}}>🔍</span>
          <input ref={ref} value={q} onChange={e=>setQ(e.target.value)} placeholder='Buscar en todas las conversaciones...' style={{flex:1,background:'none',border:'none',color:t.text,fontSize:'15px',fontFamily:"'IBM Plex Sans',sans-serif",outline:'none'}}/>
          <button onClick={onClose} style={{background:'none',border:'none',color:t.muted,cursor:'pointer',fontSize:'18px'}}>×</button>
        </div>
        <div style={{maxHeight:'400px',overflowY:'auto'}}>
          {q&&results.length===0&&<p style={{padding:'20px',color:t.muted,textAlign:'center',fontSize:'13px'}}>Sin resultados para "{q}"</p>}
          {results.map((r,i)=>(
            <div key={i} onClick={()=>{onSelect(r.convId);onClose();}} style={{padding:'12px 16px',borderBottom:`1px solid ${t.border}`,cursor:'pointer'}}
              onMouseEnter={e=>e.currentTarget.style.background=t.bg} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <p style={{color:t.accent,fontSize:'11px',fontFamily:'monospace',margin:'0 0 4px'}}>{r.title} · {fmtDate(r.ts)}</p>
              <p style={{color:t.text,fontSize:'13px',margin:0}}>...{r.snippet}...</p>
            </div>
          ))}
          {!q&&<p style={{padding:'20px',color:t.muted,textAlign:'center',fontSize:'13px'}}>Escribí para buscar en tu historial</p>}
        </div>
      </div>
    </div>
  );
}

// ─── DIFF MODAL ───────────────────────────────────────────────────────────────
function DiffModal({original, modified, onClose, t}) {
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}} onClick={onClose}>
      <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:'14px',width:'900px',maxWidth:'95vw',maxHeight:'80vh',overflow:'hidden',display:'flex',flexDirection:'column'}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:'14px 18px',borderBottom:`1px solid ${t.border}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <h3 style={{color:t.text,fontFamily:"'Syne',sans-serif",fontSize:'15px',margin:0}}>📊 Vista de diferencias</h3>
          <button onClick={onClose} style={{background:'none',border:'none',color:t.muted,cursor:'pointer',fontSize:'20px'}}>×</button>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'16px'}}><DiffView original={original} modified={modified} t={t}/></div>
      </div>
    </div>
  );
}

// ─── SHORTCUTS MODAL ──────────────────────────────────────────────────────────
function ShortcutsModal({onClose, t}) {
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={onClose}>
      <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:'14px',width:'420px',padding:'24px'}} onClick={e=>e.stopPropagation()}>
        <h3 style={{color:t.text,fontFamily:"'Syne',sans-serif",fontSize:'16px',marginBottom:'20px'}}>⌨️ Atajos de teclado</h3>
        {SHORTCUTS.map((s,i)=>(
          <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:`1px solid ${t.border}`}}>
            <span style={{color:t.text,fontSize:'13px'}}>{s.action}</span>
            <div style={{display:'flex',gap:'4px'}}>
              {s.keys.map((k,j)=><kbd key={j} style={{background:t.bg,border:`1px solid ${t.border}`,color:t.accent,padding:'2px 8px',borderRadius:'4px',fontSize:'11px',fontFamily:'monospace'}}>{k}</kbd>)}
            </div>
          </div>
        ))}
        <button onClick={onClose} style={{marginTop:'16px',width:'100%',padding:'10px',background:t.grad,border:'none',borderRadius:'8px',color:'#fff',cursor:'pointer',fontFamily:"'IBM Plex Sans',sans-serif",fontSize:'13px'}}>Cerrar</button>
      </div>
    </div>
  );
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
function Sidebar({conversations, activeId, onSelect, onNew, onDelete, onRename, isOpen, t}) {
  const [renaming,setRenaming]=useState(null);
  const [renameVal,setRenameVal]=useState('');
  const grouped=useMemo(()=>{
    const today=new Date(); today.setHours(0,0,0,0);
    const yesterday=new Date(today); yesterday.setDate(yesterday.getDate()-1);
    const week=new Date(today); week.setDate(week.getDate()-7);
    const g={'Hoy':[],'Ayer':[],'Esta semana':[],'Antes':[]};
    [...conversations].sort((a,b)=>b.updatedAt-a.updatedAt).forEach(c=>{
      const d=new Date(c.updatedAt); d.setHours(0,0,0,0);
      if(d>=today) g['Hoy'].push(c);
      else if(d>=yesterday) g['Ayer'].push(c);
      else if(d>=week) g['Esta semana'].push(c);
      else g['Antes'].push(c);
    });
    return g;
  },[conversations]);
  return (
    <div style={{width:isOpen?'260px':'0px',minWidth:isOpen?'260px':'0px',background:t.bg,borderRight:`1px solid ${t.border}`,display:'flex',flexDirection:'column',overflow:'hidden',transition:'all 0.3s ease',flexShrink:0}}>
      <div style={{padding:'16px 12px 12px',borderBottom:`1px solid ${t.border}`}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'12px',padding:'0 4px'}}>
          <span style={{fontSize:'20px'}}>🔥</span>
          <span style={{color:t.accent,fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:'15px',letterSpacing:'-0.02em'}}>MordelonIA</span>
        </div>
        <button onClick={onNew} style={{width:'100%',padding:'9px',background:`${t.accent}18`,border:`1px solid ${t.accent}33`,borderRadius:'10px',color:t.accent,cursor:'pointer',fontSize:'13px',fontFamily:"'IBM Plex Sans',sans-serif",display:'flex',alignItems:'center',justifyContent:'center',gap:'8px',transition:'all 0.2s'}}
          onMouseEnter={e=>e.currentTarget.style.background=`${t.accent}28`} onMouseLeave={e=>e.currentTarget.style.background=`${t.accent}18`}>
          + Nueva conversación
        </button>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'6px 8px'}}>
        {conversations.length===0&&<p style={{color:t.muted,fontSize:'12px',textAlign:'center',padding:'24px 10px'}}>Todavía no hay conversaciones</p>}
        {Object.entries(grouped).map(([group,convs])=>convs.length===0?null:(
          <div key={group}>
            <p style={{color:t.muted,fontSize:'10px',fontFamily:'monospace',padding:'8px 6px 4px',letterSpacing:'0.08em',textTransform:'uppercase'}}>{group}</p>
            {convs.map(conv=>(
              <div key={conv.id}>
                {renaming===conv.id?(
                  <input autoFocus value={renameVal} onChange={e=>setRenameVal(e.target.value)}
                    onBlur={()=>{onRename(conv.id,renameVal);setRenaming(null);}}
                    onKeyDown={e=>{if(e.key==='Enter'){onRename(conv.id,renameVal);setRenaming(null);}if(e.key==='Escape')setRenaming(null);}}
                    style={{width:'100%',padding:'8px 10px',background:t.surface,border:`1px solid ${t.accent}`,borderRadius:'8px',color:t.text,fontSize:'12px',fontFamily:"'IBM Plex Sans',sans-serif",outline:'none',boxSizing:'border-box'}}/>
                ):(
                  <div onClick={()=>onSelect(conv.id)} onDoubleClick={()=>{setRenaming(conv.id);setRenameVal(conv.title);}}
                    style={{padding:'9px 10px',borderRadius:'8px',cursor:'pointer',marginBottom:'2px',background:activeId===conv.id?t.surface:'transparent',border:`1px solid ${activeId===conv.id?t.border:'transparent'}`,transition:'all 0.15s',display:'flex',justifyContent:'space-between',alignItems:'center'}}
                    onMouseEnter={e=>{if(activeId!==conv.id)e.currentTarget.style.background=`${t.accent}08`;e.currentTarget.querySelector('.dbtn').style.opacity='1';}}
                    onMouseLeave={e=>{if(activeId!==conv.id)e.currentTarget.style.background='transparent';e.currentTarget.querySelector('.dbtn').style.opacity='0';}}>
                    <div style={{flex:1,overflow:'hidden'}}>
                      <p style={{color:activeId===conv.id?t.accent:t.text,fontSize:'12px',margin:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontFamily:"'IBM Plex Sans',sans-serif"}}>{conv.title||'Sin título'}</p>
                      <p style={{color:t.muted,fontSize:'10px',margin:'2px 0 0',fontFamily:'monospace'}}>{fmtDate(conv.updatedAt)} · {conv.messages?.length||0} msgs</p>
                    </div>
                    <button className='dbtn' onClick={e=>{e.stopPropagation();onDelete(conv.id);}} style={{background:'none',border:'none',color:'#ff5555',cursor:'pointer',fontSize:'13px',padding:'2px 4px',opacity:0,transition:'opacity 0.2s',flexShrink:0}}>🗑</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{padding:'10px 12px',borderTop:`1px solid ${t.border}`}}>
        <p style={{color:t.muted,fontSize:'10px',textAlign:'center',fontFamily:'monospace'}}>{conversations.length} convs · Firebase sync ✓</p>
      </div>
    </div>
  );
}

// ─── MEMORY PANEL ─────────────────────────────────────────────────────────────
function MemoryPanel({ memories, onDelete, onClose, t }) {
  const [filter, setFilter] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [editVal, setEditVal] = useState('');

  const filtered = filter === 'all' ? memories : memories.filter(m => m.category === filter);

  const fmtRelative = (ts) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'hace un momento';
    if (diff < 3600000) return `hace ${Math.floor(diff/60000)}m`;
    if (diff < 86400000) return `hace ${Math.floor(diff/3600000)}h`;
    return fmtDate(ts);
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}} onClick={onClose}>
      <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:'16px',width:'560px',maxWidth:'95vw',maxHeight:'82vh',overflow:'hidden',display:'flex',flexDirection:'column',boxShadow:'0 24px 60px rgba(0,0,0,0.6)'}} onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{padding:'16px 20px',borderBottom:`1px solid ${t.border}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <h3 style={{color:t.text,fontFamily:"'Syne',sans-serif",fontSize:'16px',margin:0}}>🧠 Memoria de MordelonIA</h3>
            <p style={{color:t.muted,fontSize:'11px',fontFamily:'monospace',margin:'2px 0 0'}}>{memories.length} recuerdos guardados</p>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:t.muted,cursor:'pointer',fontSize:'20px'}}>×</button>
        </div>

        {/* Filtros */}
        <div style={{padding:'10px 20px',borderBottom:`1px solid ${t.border}`,display:'flex',gap:'6px',flexWrap:'wrap'}}>
          {[{key:'all',label:'Todos',icon:'📋'},...Object.entries(MEMORY_CATEGORIES).map(([k,v])=>({key:k,label:v.label,icon:v.icon}))].map(f=>(
            <button key={f.key} onClick={()=>setFilter(f.key)}
              style={{padding:'3px 10px',borderRadius:'20px',border:`1px solid ${filter===f.key?t.accent:t.border}`,background:filter===f.key?`${t.accent}18`:'none',color:filter===f.key?t.accent:t.muted,fontSize:'11px',cursor:'pointer',fontFamily:'monospace',transition:'all 0.15s'}}>
              {f.icon} {f.label}
            </button>
          ))}
        </div>

        {/* Lista */}
        <div style={{flex:1,overflowY:'auto',padding:'12px 20px'}}>
          {filtered.length === 0 && (
            <div style={{textAlign:'center',padding:'40px 0'}}>
              <p style={{fontSize:'28px',marginBottom:'8px'}}>🧠</p>
              <p style={{color:t.muted,fontSize:'13px'}}>
                {memories.length === 0 ? 'Todavía no hay recuerdos. Se van generando automáticamente.' : 'No hay recuerdos en esta categoría.'}
              </p>
            </div>
          )}
          {filtered.map(mem => {
            const cat = MEMORY_CATEGORIES[mem.category];
            return (
              <div key={mem.id} style={{padding:'10px 14px',borderRadius:'10px',border:`1px solid ${t.border}`,marginBottom:'8px',background:t.bg,display:'flex',gap:'10px',alignItems:'flex-start'}}>
                <span style={{fontSize:'18px',flexShrink:0,marginTop:'1px'}}>{cat?.icon||'💡'}</span>
                <div style={{flex:1,minWidth:0}}>
                  {editingId === mem.id ? (
                    <input
                      autoFocus value={editVal}
                      onChange={e=>setEditVal(e.target.value)}
                      onBlur={()=>{
                        if(editVal.trim()) saveMemory({...mem,content:editVal.trim(),updatedAt:Date.now()});
                        setEditingId(null);
                      }}
                      onKeyDown={e=>{
                        if(e.key==='Enter'){if(editVal.trim())saveMemory({...mem,content:editVal.trim(),updatedAt:Date.now()});setEditingId(null);}
                        if(e.key==='Escape')setEditingId(null);
                      }}
                      style={{width:'100%',background:t.surface,border:`1px solid ${t.accent}`,borderRadius:'6px',color:t.text,fontSize:'13px',padding:'4px 8px',fontFamily:"'IBM Plex Sans',sans-serif",outline:'none',boxSizing:'border-box'}}
                    />
                  ) : (
                    <p style={{color:t.text,fontSize:'13px',margin:0,lineHeight:1.5}}>{mem.content}</p>
                  )}
                  <div style={{display:'flex',alignItems:'center',gap:'8px',marginTop:'4px'}}>
                    <span style={{fontSize:'10px',fontFamily:'monospace',padding:'1px 7px',borderRadius:'10px',background:`${cat?.color||t.accent}18`,color:cat?.color||t.accent,border:`1px solid ${cat?.color||t.accent}33`}}>{cat?.label||mem.category}</span>
                    <span style={{color:t.muted,fontSize:'10px',fontFamily:'monospace'}}>{fmtRelative(mem.updatedAt)}</span>
                  </div>
                </div>
                <div style={{display:'flex',gap:'4px',flexShrink:0}}>
                  <button onClick={()=>{setEditingId(mem.id);setEditVal(mem.content);}}
                    style={{background:'none',border:`1px solid ${t.border}`,color:t.muted,cursor:'pointer',fontSize:'11px',padding:'3px 7px',borderRadius:'5px',fontFamily:'monospace'}}>✏️</button>
                  <button onClick={()=>onDelete(mem.id)}
                    style={{background:'none',border:`1px solid ${t.border}`,color:'#ff5555',cursor:'pointer',fontSize:'11px',padding:'3px 7px',borderRadius:'5px',fontFamily:'monospace'}}>🗑</button>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{padding:'12px 20px',borderTop:`1px solid ${t.border}`}}>
          <p style={{color:t.muted,fontSize:'10px',textAlign:'center',fontFamily:'monospace'}}>Los recuerdos se extraen automáticamente tras cada respuesta · Doble click para editar</p>
        </div>
      </div>
    </div>
  );
}

// ─── TOOL RESULT CARDS ────────────────────────────────────────────────────────
function ToolResultCard({ execution, t }) {
  const [expanded, setExpanded] = useState(true);
  const { toolName, args, result, status, startedAt } = execution;

  const toolMeta = {
    ejecutar_javascript: { icon: '🧮', label: 'JS Ejecutado',    color: '#f7df1e' },
    crear_archivo:       { icon: '📋', label: 'Archivo Creado',   color: '#4ec9b0' },
    analizar_codigo:     { icon: '🐞', label: 'Análisis de Código', color: '#ff6b6b' },
    buscar_web:          { icon: '🌐', label: 'Búsqueda Web',     color: '#61afef' },
    generar_imagen:      { icon: '🖼', label: 'Imagen Generada',  color: '#c678dd' },
  };
  const meta = toolMeta[toolName] || { icon: '⚙️', label: toolName, color: '#aaa' };

  return (
    <div style={{border:`1px solid ${t.border}`,borderRadius:'10px',marginBottom:'8px',overflow:'hidden',background:t.bg}}>
      {/* Header */}
      <div onClick={()=>setExpanded(v=>!v)} style={{display:'flex',alignItems:'center',gap:'8px',padding:'8px 12px',cursor:'pointer',borderBottom:expanded?`1px solid ${t.border}`:'none'}}>
        <span style={{fontSize:'16px'}}>{meta.icon}</span>
        <span style={{color:meta.color,fontSize:'12px',fontFamily:'monospace',fontWeight:600}}>{meta.label}</span>
        {args.description && <span style={{color:t.muted,fontSize:'11px',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>— {args.description}</span>}
        <span style={{color:status==='ok'?'#50fa7b':status==='error'?'#ff5555':'#f1fa8c',fontSize:'10px',fontFamily:'monospace'}}>
          {status==='ok'?'✓':status==='error'?'✗':'⟳'}
        </span>
        <span style={{color:t.muted,fontSize:'10px'}}>{expanded?'▲':'▼'}</span>
      </div>

      {/* Body */}
      {expanded && (
        <div style={{padding:'10px 12px'}}>
          {/* JS Result */}
          {toolName==='ejecutar_javascript' && result && (
            <div style={{fontSize:'12px',fontFamily:'monospace'}}>
              {result.logs?.length>0 && (
                <div style={{marginBottom:'6px'}}>
                  <p style={{color:t.muted,fontSize:'10px',marginBottom:'3px'}}>OUTPUT</p>
                  {result.logs.map((l,i)=><div key={i} style={{color:'#50fa7b',padding:'2px 0'}}>{l}</div>)}
                </div>
              )}
              {result.result!==undefined && (
                <div style={{marginBottom:'6px'}}>
                  <p style={{color:t.muted,fontSize:'10px',marginBottom:'3px'}}>RETURN VALUE</p>
                  <div style={{color:t.text,background:t.surface,padding:'6px 8px',borderRadius:'6px'}}>{result.result}</div>
                </div>
              )}
              {result.errors?.length>0 && result.errors.map((e,i)=><div key={i} style={{color:'#ff5555',padding:'2px 0'}}>✗ {e}</div>)}
              <div style={{color:t.muted,fontSize:'10px',marginTop:'4px'}}>⏱ {result.elapsed_ms}ms</div>
            </div>
          )}

          {/* Archivo creado */}
          {toolName==='crear_archivo' && result?.success && (
            <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
              <div style={{flex:1}}>
                <p style={{color:t.text,fontSize:'12px',fontFamily:'monospace'}}>{result.filename}</p>
                <p style={{color:t.muted,fontSize:'10px'}}>{result.lines} líneas · {result.size} bytes</p>
              </div>
              <button onClick={()=>downloadVirtualFile(result.filename)}
                style={{padding:'5px 12px',background:t.grad,border:'none',borderRadius:'6px',color:'#fff',cursor:'pointer',fontSize:'11px',fontFamily:'monospace'}}>
                ↓ Descargar
              </button>
            </div>
          )}

          {/* Análisis de código */}
          {toolName==='analizar_codigo' && result?.success && result.analysis && (
            <div style={{fontSize:'12px'}}>
              <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'8px'}}>
                <div style={{fontSize:'24px',fontWeight:800,fontFamily:"'Syne',sans-serif",color:
                  result.analysis.score>=80?'#50fa7b':result.analysis.score>=60?'#f1fa8c':'#ff5555'}}>
                  {result.analysis.score}/100
                </div>
                <p style={{color:t.muted,fontSize:'12px'}}>{result.analysis.summary}</p>
              </div>
              {(result.analysis.issues||[]).map((issue,i)=>(
                <div key={i} style={{padding:'6px 8px',marginBottom:'4px',borderRadius:'6px',border:`1px solid ${issue.severity==='critical'?'#ff555533':issue.severity==='warning'?'#f1fa8c33':'#44475a'}`,background:issue.severity==='critical'?'#1a0d0d':issue.severity==='warning'?'#1a1a0d':t.surface}}>
                  <div style={{display:'flex',gap:'6px',alignItems:'center',marginBottom:'2px'}}>
                    <span style={{fontSize:'10px',padding:'1px 6px',borderRadius:'4px',fontFamily:'monospace',background:issue.severity==='critical'?'#ff5555':issue.severity==='warning'?'#f1fa8c':'#6272a4',color:issue.severity==='warning'?'#000':'#fff'}}>{issue.severity}</span>
                    {issue.line && <span style={{color:t.muted,fontSize:'10px',fontFamily:'monospace'}}>línea {issue.line}</span>}
                    <span style={{color:t.text,fontSize:'12px',fontWeight:600}}>{issue.title}</span>
                  </div>
                  <p style={{color:t.muted,fontSize:'11px',margin:'0 0 2px'}}>{issue.description}</p>
                  {issue.fix && <p style={{color:'#50fa7b',fontSize:'11px',margin:0}}>💡 {issue.fix}</p>}
                </div>
              ))}
              {result.analysis.metrics && (
                <div style={{display:'flex',gap:'8px',marginTop:'6px'}}>
                  {Object.entries(result.analysis.metrics).map(([k,v])=>(
                    <span key={k} style={{padding:'2px 8px',background:t.surface,border:`1px solid ${t.border}`,borderRadius:'4px',fontSize:'10px',fontFamily:'monospace',color:t.muted}}>{k}: {v}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Búsqueda web */}
          {toolName==='buscar_web' && result && (
            result.not_configured
              ? <p style={{color:'#f1fa8c',fontSize:'12px',fontFamily:'monospace'}}>⚠️ {result.message}</p>
              : (result.results||[]).map((r,i)=>(
                  <div key={i} style={{marginBottom:'6px',paddingBottom:'6px',borderBottom:`1px solid ${t.border}`}}>
                    <a href={r.url} target='_blank' rel='noreferrer' style={{color:t.accent,fontSize:'12px',textDecoration:'none'}}>{r.title}</a>
                    <p style={{color:t.muted,fontSize:'11px',margin:'2px 0 0'}}>{r.snippet}</p>
                  </div>
                ))
          )}

          {/* Imagen generada */}
          {toolName==='generar_imagen' && result && (
            result.not_configured
              ? <p style={{color:'#f1fa8c',fontSize:'12px',fontFamily:'monospace'}}>⚠️ {result.message}</p>
              : result.url && <img src={result.url} alt={result.prompt} style={{maxWidth:'100%',borderRadius:'8px',border:`1px solid ${t.border}`}}/>
          )}

          {/* Error genérico */}
          {result?.error && <p style={{color:'#ff5555',fontSize:'12px',fontFamily:'monospace'}}>✗ {result.error}</p>}
        </div>
      )}
    </div>
  );
}

// ─── TOOLS PANEL (sidebar derecho) ───────────────────────────────────────────
function ToolsPanel({ executions, isOpen, onClose, t }) {
  const virtualFiles = getVirtualFiles();
  return (
    <div style={{width:isOpen?'320px':'0px',minWidth:isOpen?'320px':'0px',background:t.bg,borderLeft:`1px solid ${t.border}`,display:'flex',flexDirection:'column',overflow:'hidden',transition:'all 0.3s ease',flexShrink:0}}>
      <div style={{padding:'14px 16px',borderBottom:`1px solid ${t.border}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <h3 style={{color:t.text,fontFamily:"'Syne',sans-serif",fontSize:'14px',margin:0}}>⚙️ Herramientas</h3>
          <p style={{color:t.muted,fontSize:'10px',fontFamily:'monospace',margin:'2px 0 0'}}>{executions.length} ejecuciones</p>
        </div>
        <button onClick={onClose} style={{background:'none',border:`1px solid ${t.border}`,color:t.muted,cursor:'pointer',fontSize:'12px',padding:'3px 8px',borderRadius:'6px'}}>✕</button>
      </div>

      <div style={{flex:1,overflowY:'auto',padding:'10px 12px'}}>
        {executions.length===0 && (
          <div style={{textAlign:'center',padding:'40px 10px'}}>
            <p style={{fontSize:'28px',marginBottom:'8px'}}>⚙️</p>
            <p style={{color:t.muted,fontSize:'12px',lineHeight:1.5}}>Las herramientas aparecen acá cuando MordelonIA las usa.</p>
            <p style={{color:t.muted,fontSize:'11px',marginTop:'12px',fontFamily:'monospace'}}>Ej: "ejecutá este código", "buscá X", "creá un archivo..."</p>
          </div>
        )}
        {[...executions].reverse().map((ex,i)=><ToolResultCard key={i} execution={ex} t={t}/>)}
      </div>

      {/* Archivos virtuales */}
      {virtualFiles.length>0 && (
        <div style={{borderTop:`1px solid ${t.border}`,padding:'10px 12px'}}>
          <p style={{color:t.muted,fontSize:'10px',fontFamily:'monospace',marginBottom:'6px',textTransform:'uppercase',letterSpacing:'0.06em'}}>📁 Archivos generados</p>
          {virtualFiles.map((f,i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'4px 0'}}>
              <span style={{color:t.text,fontSize:'11px',fontFamily:'monospace',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{f.name}</span>
              <button onClick={()=>downloadVirtualFile(f.name)}
                style={{background:'none',border:`1px solid ${t.accent}44`,color:t.accent,fontSize:'10px',padding:'2px 7px',borderRadius:'4px',cursor:'pointer',fontFamily:'monospace',flexShrink:0,marginLeft:'6px'}}>↓</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PROJECT ANALYZER MODAL ───────────────────────────────────────────────────
function ProjectAnalyzerModal({ onClose, onAnalyze, t }) {
  const [tab, setTab]           = useState('zip');
  const [githubUrl, setGithubUrl] = useState('');
  const [focus, setFocus]       = useState('completo');
  const [status, setStatus]     = useState(null);
  const [project, setProject]   = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const zipRef   = useRef(null);
  const filesRef = useRef(null);

  const focusOptions = [
    { key:'completo',     label:'Análisis completo', icon:'🔍' },
    { key:'estructura',   label:'Estructura',         icon:'🏗' },
    { key:'metricas',     label:'Métricas',           icon:'📊' },
    { key:'seguridad',    label:'Seguridad',          icon:'🔒' },
    { key:'arquitectura', label:'Arquitectura',       icon:'🧭' },
    { key:'deuda',        label:'Deuda técnica',      icon:'💸' },
  ];

  const handleZip = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus('loading'); setErrorMsg('');
    try { const p = await analyzeFromZip(file); setProject(p); setStatus('ready'); }
    catch(err) { setStatus('error'); setErrorMsg(err.message); }
  };

  const handleFiles = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    setStatus('loading'); setErrorMsg('');
    try { const p = await analyzeFromFiles(files); setProject(p); setStatus('ready'); }
    catch(err) { setStatus('error'); setErrorMsg(err.message); }
  };

  const handleGitHub = async () => {
    if (!githubUrl.trim()) return;
    setStatus('loading'); setErrorMsg('');
    try { const p = await analyzeFromGitHub(githubUrl.trim()); setProject(p); setStatus('ready'); }
    catch(err) { setStatus('error'); setErrorMsg(err.message); }
  };

  const tabs = [
    { key:'zip',    icon:'📦', label:'.ZIP' },
    { key:'files',  icon:'📂', label:'Archivos' },
    { key:'github', icon:'🐙', label:'GitHub' },
  ];

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}} onClick={onClose}>
      <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:'16px',width:'600px',maxWidth:'95vw',maxHeight:'90vh',overflow:'hidden',display:'flex',flexDirection:'column',boxShadow:'0 24px 60px rgba(0,0,0,0.7)'}} onClick={e=>e.stopPropagation()}>

        <div style={{padding:'18px 20px',borderBottom:`1px solid ${t.border}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <h3 style={{color:t.text,fontFamily:"'Syne',sans-serif",fontSize:'17px',margin:0}}>🔬 Analizador de proyectos</h3>
            <p style={{color:t.muted,fontSize:'11px',fontFamily:'monospace',margin:'3px 0 0'}}>El análisis se inyecta como contexto en la conversación</p>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:t.muted,cursor:'pointer',fontSize:'22px',lineHeight:1}}>×</button>
        </div>

        <div style={{flex:1,overflowY:'auto',padding:'18px 20px'}}>
          <div style={{display:'flex',gap:'6px',marginBottom:'18px'}}>
            {tabs.map(tb=>(
              <button key={tb.key} onClick={()=>{setTab(tb.key);setProject(null);setStatus(null);setErrorMsg('');}}
                style={{flex:1,padding:'9px',borderRadius:'10px',border:`1px solid ${tab===tb.key?t.accent:t.border}`,background:tab===tb.key?`${t.accent}18`:'none',color:tab===tb.key?t.accent:t.muted,cursor:'pointer',fontSize:'12px',fontFamily:"'IBM Plex Sans',sans-serif",display:'flex',alignItems:'center',justifyContent:'center',gap:'6px',transition:'all 0.15s'}}>
                {tb.icon} {tb.label}
              </button>
            ))}
          </div>

          {tab==='zip'&&(
            <div onClick={()=>zipRef.current?.click()} style={{border:`2px dashed ${status==='ready'?'#50fa7b':t.border}`,borderRadius:'12px',padding:'32px',textAlign:'center',cursor:'pointer',background:status==='ready'?'#0d2a0d':'none',transition:'all 0.2s'}}
              onMouseEnter={e=>e.currentTarget.style.borderColor=`${t.accent}88`} onMouseLeave={e=>e.currentTarget.style.borderColor=status==='ready'?'#50fa7b':t.border}>
              <div style={{fontSize:'36px',marginBottom:'10px'}}>{status==='ready'?'✅':status==='loading'?'⏳':'📦'}</div>
              <p style={{color:t.text,fontSize:'14px',margin:'0 0 4px'}}>{status==='ready'?`✓ ${project.name} · ${project.stats.codeFiles} archivos`:status==='loading'?'Procesando ZIP...':'Hacé click o arrastrá tu .zip acá'}</p>
              {status!=='ready'&&<p style={{color:t.muted,fontSize:'11px',margin:0,fontFamily:'monospace'}}>node_modules y .git se ignoran automáticamente</p>}
              <input ref={zipRef} type='file' accept='.zip' style={{display:'none'}} onChange={handleZip}/>
            </div>
          )}

          {tab==='files'&&(
            <div onClick={()=>filesRef.current?.click()} style={{border:`2px dashed ${status==='ready'?'#50fa7b':t.border}`,borderRadius:'12px',padding:'32px',textAlign:'center',cursor:'pointer',background:status==='ready'?'#0d2a0d':'none',transition:'all 0.2s'}}
              onMouseEnter={e=>e.currentTarget.style.borderColor=`${t.accent}88`} onMouseLeave={e=>e.currentTarget.style.borderColor=status==='ready'?'#50fa7b':t.border}>
              <div style={{fontSize:'36px',marginBottom:'10px'}}>{status==='ready'?'✅':status==='loading'?'⏳':'📂'}</div>
              <p style={{color:t.text,fontSize:'14px',margin:'0 0 4px'}}>{status==='ready'?`✓ ${project.stats.codeFiles} archivos cargados`:status==='loading'?'Procesando...':'Seleccioná múltiples archivos'}</p>
              {status!=='ready'&&<p style={{color:t.muted,fontSize:'11px',margin:0,fontFamily:'monospace'}}>Ctrl+A para seleccionar todos</p>}
              <input ref={filesRef} type='file' multiple style={{display:'none'}} onChange={handleFiles}/>
            </div>
          )}

          {tab==='github'&&(
            <div>
              <div style={{display:'flex',gap:'8px',marginBottom:'8px'}}>
                <input value={githubUrl} onChange={e=>setGithubUrl(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleGitHub()}
                  placeholder='https://github.com/usuario/repo'
                  style={{flex:1,background:t.bg,border:`1px solid ${t.border}`,borderRadius:'10px',padding:'10px 14px',color:t.text,fontSize:'13px',fontFamily:'monospace',outline:'none'}}/>
                <button onClick={handleGitHub} disabled={!githubUrl.trim()||status==='loading'}
                  style={{padding:'10px 18px',background:t.grad,border:'none',borderRadius:'10px',color:'#fff',cursor:githubUrl.trim()?'pointer':'not-allowed',fontSize:'13px',opacity:githubUrl.trim()?1:0.5,flexShrink:0}}>
                  {status==='loading'?'⏳':'Cargar'}
                </button>
              </div>
              <p style={{color:t.muted,fontSize:'11px',fontFamily:'monospace',margin:0}}>Solo repos públicos · Se leen hasta 60 archivos</p>
              {status==='ready'&&<div style={{marginTop:'10px',padding:'10px 14px',background:'#0d2a0d',border:'1px solid #50fa7b33',borderRadius:'8px'}}>
                <p style={{color:'#50fa7b',fontSize:'12px',margin:0,fontFamily:'monospace'}}>✓ {project.name} · Stack: {project.stack.join(', ')} · {project.stats.codeFiles} archivos · {project.stats.totalLines.toLocaleString()} líneas</p>
              </div>}
            </div>
          )}

          {status==='error'&&<div style={{marginTop:'10px',padding:'10px 14px',background:'#2a0d0d',border:'1px solid #ff555533',borderRadius:'8px'}}><p style={{color:'#ff5555',fontSize:'12px',margin:0,fontFamily:'monospace'}}>✗ {errorMsg}</p></div>}

          {status==='ready'&&project&&(
            <div style={{marginTop:'16px'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px',marginBottom:'12px'}}>
                {[{label:'Archivos código',value:project.stats.codeFiles},{label:'Líneas totales',value:project.stats.totalLines.toLocaleString()},{label:'TODOs/FIXMEs',value:project.todos.length}].map((s,i)=>(
                  <div key={i} style={{padding:'10px',background:t.bg,border:`1px solid ${t.border}`,borderRadius:'8px',textAlign:'center'}}>
                    <p style={{color:t.accent,fontSize:'18px',fontWeight:800,fontFamily:"'Syne',sans-serif",margin:0}}>{s.value}</p>
                    <p style={{color:t.muted,fontSize:'10px',fontFamily:'monospace',margin:'2px 0 0'}}>{s.label}</p>
                  </div>
                ))}
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:'4px',marginBottom:'14px'}}>
                {project.stack.map(s=><span key={s} style={{padding:'3px 10px',background:`${t.accent}14`,border:`1px solid ${t.accent}33`,borderRadius:'20px',color:t.accent,fontSize:'11px',fontFamily:'monospace'}}>{s}</span>)}
              </div>
              <p style={{color:t.muted,fontSize:'10px',fontFamily:'monospace',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'8px'}}>Tipo de análisis</p>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'6px'}}>
                {focusOptions.map(f=>(
                  <button key={f.key} onClick={()=>setFocus(f.key)} style={{padding:'8px 10px',borderRadius:'8px',border:`1px solid ${focus===f.key?t.accent:t.border}`,background:focus===f.key?`${t.accent}18`:'none',color:focus===f.key?t.accent:t.muted,cursor:'pointer',fontSize:'11px',display:'flex',alignItems:'center',gap:'6px',transition:'all 0.15s'}}>
                    {f.icon} {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{padding:'14px 20px',borderTop:`1px solid ${t.border}`,display:'flex',gap:'8px',justifyContent:'flex-end'}}>
          <button onClick={onClose} style={{padding:'9px 18px',background:'none',border:`1px solid ${t.border}`,borderRadius:'8px',color:t.muted,cursor:'pointer',fontSize:'13px'}}>Cancelar</button>
          <button onClick={()=>onAnalyze(project,focus)} disabled={!project}
            style={{padding:'9px 20px',background:project?t.grad:'none',border:`1px solid ${project?'transparent':t.border}`,borderRadius:'8px',color:project?'#fff':t.muted,cursor:project?'pointer':'not-allowed',fontSize:'13px',boxShadow:project?`0 0 16px ${t.accent}44`:'none',transition:'all 0.2s'}}>
            🔬 Analizar proyecto →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [convs,setConvs]=useState([]);
  const [activeId,setActiveId]=useState(null);
  const [input,setInput]=useState('');
  const [loading,setLoading]=useState(false);
  const [files,setFiles]=useState([]);
  const [sidebarOpen,setSidebarOpen]=useState(true);
  const [themeKey,setThemeKey]=useState('dark');
  const [modal,setModal]=useState(null);
  const [diffData,setDiffData]=useState(null);
  const [notif,setNotif]=useState(null);
  const [ready,setReady]=useState(false);
  const [drag,setDrag]=useState(false);
  const [fbOk,setFbOk]=useState(false);
  const [memories,setMemories]=useState([]);
  const [extractingMemory,setExtractingMemory]=useState(false);
  const [streamText,setStreamText]=useState('');
  const [isThinking,setIsThinking]=useState(false);
  const abortRef=useRef(null);
  const streamTextRef=useRef('');
  const [toolExecutions,setToolExecutions]=useState([]);
  const [toolsPanelOpen,setToolsPanelOpen]=useState(false);

  const t=THEMES[themeKey];
  const activeConv=convs.find(c=>c.id===activeId);
  const messages=activeConv?.messages||[];
  const bottomRef=useRef(null);
  const fileRef=useRef(null);
  const taRef=useRef(null);
  const saveTimer=useRef({});

  // LOAD FROM FIREBASE
  useEffect(()=>{
    Promise.all([
      loadConversations().catch(()=>[]),
      loadMemories().catch(()=>[]),
    ]).then(([loaded, mems])=>{
      setFbOk(true);
      if(loaded.length>0){ setConvs(loaded); setActiveId(loaded[0].id); }
      setMemories(mems);
      setReady(true);
    }).catch(()=>{ setFbOk(false); setReady(true); });
  },[]);

  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:'smooth'}); },[messages,loading]);

  const debouncedSave=useCallback((conv)=>{
    clearTimeout(saveTimer.current[conv.id]);
    saveTimer.current[conv.id]=setTimeout(()=>saveConversation(conv),1500);
  },[]);

  // KEYBOARD SHORTCUTS
  useEffect(()=>{
    const h=(e)=>{
      if(e.key==='Escape'){setModal(null);return;}
      if(!e.ctrlKey&&!e.metaKey) return;
      if(e.key==='k'){e.preventDefault();setModal('search');}
      if(e.key==='n'){e.preventDefault();newConv();}
      if(e.key==='b'){e.preventDefault();setSidebarOpen(v=>!v);}
      if(e.key==='e'){e.preventDefault();if(activeConv)exportConv(activeConv);}
      if(e.key==='d'){e.preventDefault();cycleTheme();}
    };
    window.addEventListener('keydown',h);
    return ()=>window.removeEventListener('keydown',h);
  },[activeConv,themeKey]);

  const cycleTheme=()=>{ const k=Object.keys(THEMES); setThemeKey(p=>k[(k.indexOf(p)+1)%k.length]); };
  const showNotif=(msg,type='info')=>{ setNotif({msg,type}); setTimeout(()=>setNotif(null),3000); };

  const newConv=useCallback(()=>{
    const id=genId();
    const conv={id,title:'Nueva conversación',messages:[],createdAt:Date.now(),updatedAt:Date.now()};
    setConvs(prev=>[conv,...prev]);
    setActiveId(id);
    return id;
  },[]);

  const deleteConv=useCallback((id)=>{
    fbDelete(id);
    setConvs(prev=>{ const n=prev.filter(c=>c.id!==id); if(activeId===id)setActiveId(n[0]?.id||null); return n; });
    showNotif('Conversación eliminada');
  },[activeId]);

  const handleDeleteMemory=useCallback(async(id)=>{
    await deleteMemory(id);
    setMemories(prev=>prev.filter(m=>m.id!==id));
    showNotif('Recuerdo eliminado');
  },[]);

  const renameConv=useCallback((id,title)=>{

    setConvs(prev=>prev.map(c=>{
      if(c.id!==id) return c;
      const u={...c,title:title||c.title,updatedAt:Date.now()};
      debouncedSave(u); return u;
    }));
  },[debouncedSave]);

  const updateConv=useCallback((id,fn)=>{
    setConvs(prev=>prev.map(c=>{
      if(c.id!==id) return c;
      const u={...fn(c),updatedAt:Date.now()};
      debouncedSave(u); return u;
    }));
  },[debouncedSave]);

  const exportConv=(conv)=>{
    const lines=[`# ${conv.title}`,`Exportado: ${fmtFull(Date.now())}`,`Total: ${conv.messages.length} mensajes`,'','---',''];
    conv.messages.forEach(m=>{
      const role=m.role==='user'?'👤 Vos':'🔥 MordelonIA';
      const txt=typeof m.content==='string'?m.content:m.content?.find?.(b=>b.type==='text')?.text||'';
      lines.push(`### ${role} — ${fmtDate(m.timestamp||0)}`,'',txt,'','---','');
    });
    const b=new Blob([lines.join('\n')],{type:'text/markdown'});
    const u=URL.createObjectURL(b);
    const a=document.createElement('a'); a.href=u; a.download=`${conv.title.replace(/[^a-z0-9]/gi,'_')}.md`; a.click();
    URL.revokeObjectURL(u);
    showNotif('Exportado como Markdown ✓');
  };

  const handleFiles=(fl)=>{
    Array.from(fl).forEach(f=>{
      if(f.size>15*1024*1024){showNotif(`${f.name} supera 15MB`,'error');return;}
      setFiles(prev=>[...prev,f]);
    });
  };

  const buildMsgs=async(history,text,fls)=>{
    // Máximo 12 mensajes de historial para no superar el límite de tokens
    const trimmed = history.slice(-12);
    const h=trimmed.map(m=>({
      role:m.role,
      content:typeof m.content==='string'?m.content.slice(0,6000):
        Array.isArray(m.content)?m.content.map(b=>b.type==='text'?b.text:'[archivo]').join('\n').slice(0,6000):
        String(m.content).slice(0,6000)
    }));
    if(!fls.length) return [...h,{role:'user',content:text||''}];
    const parts=[];
    for(const f of fls){
      if(isImg(f)){
        const b=await readB64(f);
        parts.push({type:'image_url',image_url:{url:`data:${getMT(f)};base64,${b}`}});
      } else if(isPdf(f)){
        // Groq no soporta PDFs nativamente, extraemos como texto descriptivo
        parts.push({type:'text',text:`[PDF adjunto: ${f.name} - ${(f.size/1024).toFixed(1)}KB. El usuario subió este PDF.]`});
      } else if(isCode(f)){
        const tx=await readTxt(f);
        parts.push({type:'text',text:`**Archivo: ${f.name}**\n\`\`\`${getExt(f.name)}\n${tx}\n\`\`\``});
      }
    }
    if(text) parts.push({type:'text',text});
    return [...h,{role:'user',content:parts}];
  };

  const stopStream = () => {
    abortRef.current?.abort();
  };

  const send=async(override)=>{
    const text=override??input.trim();
    if((!text&&!files.length)||loading) return;
    let cid=activeId||newConv();
    const fls=[...files];
    const origCode=fls.length>0&&isCode(fls[0])?await readTxt(fls[0]).catch(()=>null):null;
    const userMsg={role:'user',content:text,timestamp:Date.now(),attachments:fls.map(f=>({name:f.name,type:f.type,size:f.size}))};
    setInput(''); setFiles([]); setLoading(true); setIsThinking(true); setStreamText('');
    updateConv(cid,c=>({...c,messages:[...c.messages,userMsg],title:c.messages.length===0?(text?.slice(0,48)||fls[0]?.name||'Conversación'):c.title}));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const current=convs.find(c=>c.id===cid)||{messages:[]};
      const apiMsgs=await buildMsgs(current.messages,text,fls);
      const memoryBlock=formatMemoriesForPrompt(memories);
      const fullSystemPrompt=[SYSTEM_PROMPT, memoryBlock||null].filter(Boolean).join('\n\n');
      const hasProjectCtx = !!(current.projectContext);
      const hasFiles = fls.length > 0;
      // Sonnet si: hay archivos adjuntos, hay proyecto cargado, o el mensaje es largo (análisis)
      const needsSmart = hasProjectCtx || hasFiles || text?.length > 500;
      const chatModel = needsSmart ? MODEL_SMART : MODEL_FAST;

      // Convertir TOOL_DEFINITIONS de formato OpenAI a formato Anthropic
      const claudeTools = TOOL_DEFINITIONS.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));

      // ── PASO 1: llamada para detectar tool use ───────────────────────────────
      const firstRes = await claudeFetch({
          model: chatModel,
          max_tokens: 8192,
          system: fullSystemPrompt,
          tools: claudeTools,
          messages: apiMsgs,
        }, controller.signal);
      if(!firstRes.ok){ const e=await firstRes.json(); throw new Error(e.error?.message||`HTTP ${firstRes.status}`); }
      const firstData = await firstRes.json();
      // Anthropic devuelve tool_use blocks en content
      const toolUseBlocks = firstData.content?.filter(b => b.type === 'tool_use') || [];

      let finalText = '';

      // Helper para streaming SSE de Anthropic
      const streamAnthropic = async (res) => {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let firstChunk = true;
        while(true){
          const {done,value} = await reader.read();
          if(done) break;
          const chunk = decoder.decode(value,{stream:true});
          for(const line of chunk.split('\n')){
            if(!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if(data==='[DONE]' || data==='') continue;
            try{
              const parsed = JSON.parse(data);
              // Anthropic SSE: event type content_block_delta con delta.text
              if(parsed.type==='content_block_delta' && parsed.delta?.type==='text_delta'){
                const delta = parsed.delta.text;
                if(delta){ if(firstChunk){setIsThinking(false);firstChunk=false;} finalText+=delta; streamTextRef.current=finalText; setStreamText(finalText); }
              }
            } catch(_) {}
          }
        }
      };

      const apiKey = process.env.REACT_APP_ANTHROPIC_KEY;

      if(toolUseBlocks.length > 0) {
        // ── PASO 2: ejecutar herramientas ─────────────────────────────────────
        setIsThinking(false);
        setToolsPanelOpen(true);
        const toolResults = [];

        for(const tc of toolUseBlocks) {
          const toolName = tc.name;
          const args = tc.input || {};

          const execution = { id: tc.id, toolName, args, status: 'running', startedAt: Date.now(), result: null };
          setToolExecutions(prev => [...prev, execution]);
          showNotif(`⚙️ Ejecutando ${toolName.replace(/_/g,' ')}...`);

          const result = await executeTool(toolName, args, apiKey);
          execution.result = result;
          execution.status = result?.success === false ? 'error' : 'ok';
          setToolExecutions(prev => prev.map(e => e.id===tc.id ? {...execution} : e));

          toolResults.push({
            type: 'tool_result',
            tool_use_id: tc.id,
            content: JSON.stringify(result),
          });
        }

        // ── PASO 3: segunda llamada con resultados de tools + stream ──────────
        setIsThinking(true);
        // Anthropic: el historial incluye el assistant turn con tool_use + user turn con tool_result
        const secondMsgs = [
          ...apiMsgs,
          { role: 'assistant', content: firstData.content },
          { role: 'user', content: toolResults },
        ];

        const streamRes = await claudeFetch({
            model: chatModel,
            max_tokens: 8192,
            system: fullSystemPrompt,
            tools: claudeTools,
            stream: true,
            messages: secondMsgs,
          }, controller.signal);
        if(!streamRes.ok){ const e=await streamRes.json(); throw new Error(e.error?.message||`HTTP ${streamRes.status}`); }
        await streamAnthropic(streamRes);

      } else {
        // ── Sin tool use: streaming normal ────────────────────────────────────
        // Extraer texto directo si Anthropic ya respondió sin tools
        const directText = firstData.content?.find(b=>b.type==='text')?.text || '';
        if(directText){
          // Simular streaming del texto ya recibido
          setIsThinking(false);
          finalText = directText;
          setStreamText(finalText);
          streamTextRef.current = finalText;
        } else {
          // Pedir con stream=true
          const streamRes = await claudeFetch({
              model: chatModel,
              max_tokens: 8192,
              system: fullSystemPrompt,
              tools: claudeTools,
              stream: true,
              messages: apiMsgs,
            }, controller.signal);
          if(!streamRes.ok){ const e=await streamRes.json(); throw new Error(e.error?.message||`HTTP ${streamRes.status}`); }
          await streamAnthropic(streamRes);
        }
      }

      // ── Commit mensaje final ─────────────────────────────────────────────────
      setStreamText(''); setIsThinking(false);
      const replyTxt = finalText || 'Sin respuesta.';
      const assistantMsg={role:'assistant',content:replyTxt,timestamp:Date.now(),model:chatModel,...(origCode?{originalCode:origCode}:{})};
      updateConv(cid,c=>({...c,messages:[...c.messages,assistantMsg]}));

      // ── Extraer memorias en background ───────────────────────────────────────
      const updatedMsgs=[...current.messages,userMsg,assistantMsg];
      setExtractingMemory(true);
      extractMemoriesFromConv(updatedMsgs, memories, process.env.REACT_APP_ANTHROPIC_KEY)
        .then(async(newMems)=>{
          if(newMems.length>0){
            const saved=[];
            for(const m of newMems){
              const mem={id:genId(),category:m.category,content:m.content,source_conv_id:cid,createdAt:Date.now(),updatedAt:Date.now()};
              const ok=await saveMemory(mem);
              if(ok) saved.push(mem);
            }
            if(saved.length>0){
              setMemories(prev=>[...saved,...prev]);
              showNotif(`🧠 ${saved.length} recuerdo${saved.length>1?'s':''} nuevo${saved.length>1?'s':''}`);
            }
          }
        })
        .finally(()=>setExtractingMemory(false));

    } catch(err){
      setIsThinking(false); setStreamText(''); streamTextRef.current='';
      if(err.name==='AbortError'){
        const captured = streamTextRef.current;
        if(captured) updateConv(cid,c=>({...c,messages:[...c.messages,{role:'assistant',content:captured+'\n\n*(respuesta interrumpida)*',timestamp:Date.now()}]}));
        showNotif('Respuesta detenida');
      } else {
        updateConv(cid,c=>({...c,messages:[...c.messages,{role:'assistant',content:`Error: ${err.message}`,timestamp:Date.now()}]}));
        showNotif('Error al conectar','error');
      }
    } finally { setLoading(false); setStreamText(''); setIsThinking(false); streamTextRef.current=''; }
  };

  // Declarado DESPUÉS de send para evitar referencia antes de inicialización
  const handleProjectAnalyze = (project, focus) => {
    const id=genId();
    const ctx=formatProjectContext(project, focus);
    const prompt=buildAnalysisPrompt(project, focus);
    const conv={id,title:`🔬 ${project.name}`,messages:[],createdAt:Date.now(),updatedAt:Date.now(),projectContext:ctx};
    setConvs(prev=>[conv,...prev]);
    setActiveId(id);
    showNotif(`🔬 ${project.name} · ${project.stats.codeFiles} archivos cargados`);
    setTimeout(()=>send(prompt),300);
  };

  if(!ready) return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100vh',background:THEMES.dark.bg,gap:'16px'}}>
      <div style={{fontSize:'52px',filter:'drop-shadow(0 0 20px #ff6b00)'}}>🔥</div>
      <p style={{color:'#ff6b00',fontFamily:'monospace',fontSize:'14px',letterSpacing:'0.05em'}}>Iniciando MordelonIA...</p>
      <div style={{display:'flex',gap:'6px'}}>{[0,1,2].map(i=><div key={i} style={{width:'8px',height:'8px',borderRadius:'50%',background:'#ff6b00',animation:'bounce 1.2s infinite',animationDelay:`${i*0.2}s`}}/>)}</div>
    </div>
  );

  return (
    <>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:${t.bg};overflow:hidden}
        @keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-6px)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:0.6}50%{opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes flamePulse{0%,100%{filter:drop-shadow(0 0 8px #ff6b00) drop-shadow(0 0 16px #ff9500)}50%{filter:drop-shadow(0 0 16px #ff4400) drop-shadow(0 0 32px #ff8800)}}
        textarea:focus,input:focus{outline:none}
        textarea::placeholder,input::placeholder{color:${t.muted}}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${t.border};border-radius:2px}
      `}</style>

      <div style={{display:'flex',height:'100vh',background:t.bg,fontFamily:"'IBM Plex Sans',sans-serif",overflow:'hidden'}}>
        <Sidebar conversations={convs} activeId={activeId} onSelect={setActiveId} onNew={newConv} onDelete={deleteConv} onRename={renameConv} isOpen={sidebarOpen} t={t}/>

        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>
          {/* HEADER */}
          <div style={{padding:'12px 18px',borderBottom:`1px solid ${t.border}`,display:'flex',alignItems:'center',gap:'10px',background:t.bg,flexShrink:0}}>
            <button onClick={()=>setSidebarOpen(v=>!v)} style={{background:'none',border:`1px solid ${t.border}`,color:t.accent,width:'32px',height:'32px',borderRadius:'8px',cursor:'pointer',fontSize:'12px',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.2s'}}>{sidebarOpen?'◀':'▶'}</button>
            <div style={{fontSize:'28px',animation:'flamePulse 2s infinite'}}>🔥</div>
            <div style={{flex:1,minWidth:0}}>
              <h1 style={{color:t.text,fontSize:'17px',fontWeight:800,fontFamily:"'Syne',sans-serif",letterSpacing:'-0.03em',background:t.grad,WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>MordelonIA</h1>
              <p style={{color:t.muted,fontSize:'11px',fontFamily:'monospace',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{activeConv?`${activeConv.title} · ${activeConv.messages.length} mensajes`:'Seleccioná o creá una conversación'}</p>
            </div>
            <div style={{display:'flex',gap:'6px',flexShrink:0}}>
              {[
                {icon:'🔍',title:'Buscar Ctrl+K',fn:()=>setModal('search')},
                {icon:'🧠',title:'Memoria',fn:()=>setModal('memory'),label:extractingMemory?'…':memories.length>0?`${memories.length}`:''},
                {icon:'⚙️',title:'Herramientas',fn:()=>setToolsPanelOpen(v=>!v),label:toolExecutions.length>0?`${toolExecutions.length}`:''},
                {icon:'🔬',title:'Analizar proyecto',fn:()=>setModal('analyzer'),label:activeConv?.projectContext?'activo':''},
                {icon:'📤',title:'Exportar Ctrl+E',fn:()=>activeConv&&exportConv(activeConv)},
                {icon:'🎨',title:'Tema Ctrl+D',fn:cycleTheme,label:t.name},
                {icon:'⌨️',title:'Atajos',fn:()=>setModal('shortcuts')},
              ].map((b,i)=>(
                <button key={i} onClick={b.fn} title={b.title} style={{background:'none',border:`1px solid ${t.border}`,color:t.accent,padding:'5px 10px',borderRadius:'8px',cursor:'pointer',fontSize:'12px',fontFamily:'monospace',display:'flex',alignItems:'center',gap:'4px',whiteSpace:'nowrap',transition:'border-color 0.2s'}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=`${t.accent}88`} onMouseLeave={e=>e.currentTarget.style.borderColor=t.border}>
                  {b.icon}{b.label?` ${b.label}`:''}
                </button>
              ))}
              <div style={{display:'flex',alignItems:'center',gap:'4px',padding:'4px 10px',background:fbOk?`${t.accent}12`:'#2a0d0d',border:`1px solid ${fbOk?`${t.accent}33`:'#ff555533'}`,borderRadius:'8px'}}>
                <div style={{width:'6px',height:'6px',borderRadius:'50%',background:fbOk?'#50fa7b':'#ff5555',animation:'pulse 2s infinite'}}/>
                <span style={{color:fbOk?'#50fa7b':'#ff5555',fontSize:'10px',fontFamily:'monospace'}}>Firebase</span>
              </div>
            </div>
          </div>

          {/* NOTIF */}
          {notif&&<div style={{position:'fixed',top:'68px',right:'16px',padding:'10px 16px',background:notif.type==='error'?'#2a0d0d':t.surface,border:`1px solid ${notif.type==='error'?'#ff5555':t.accent}`,borderRadius:'10px',color:notif.type==='error'?'#ff5555':t.accent,fontSize:'12px',zIndex:100,fontFamily:'monospace',animation:'fadeUp 0.2s ease'}}>{notif.msg}</div>}

          {/* MESSAGES */}
          <div style={{flex:1,overflowY:'auto',padding:'20px 18px',background:drag?`${t.accent}08`:'transparent',transition:'background 0.2s',border:drag?`2px dashed ${t.accent}44`:'2px dashed transparent'}}
            onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)}
            onDrop={e=>{e.preventDefault();setDrag(false);handleFiles(e.dataTransfer.files);}}>
            <div style={{maxWidth:'860px',margin:'0 auto'}}>
              {!activeConv&&(
                <div style={{textAlign:'center',paddingTop:'40px',animation:'fadeUp 0.4s ease'}}>
                  <div style={{fontSize:'60px',marginBottom:'16px',animation:'flamePulse 2s infinite'}}>🔥</div>
                  <h2 style={{fontSize:'32px',fontWeight:800,fontFamily:"'Syne',sans-serif",letterSpacing:'-0.04em',marginBottom:'8px',background:t.grad,WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>MordelonIA</h2>
                  <p style={{color:t.muted,fontSize:'14px',marginBottom:'10px'}}>Programación y redes sociales. Sin rodeos, sin límites.</p>
                  <div style={{display:'flex',gap:'6px',justifyContent:'center',flexWrap:'wrap',marginBottom:'36px'}}>
                    {['código','archivos','PDFs','imágenes','Instagram','sin límites'].map(tag=>(
                      <span key={tag} style={{padding:'3px 10px',background:`${t.accent}14`,border:`1px solid ${t.accent}33`,borderRadius:'20px',color:t.accent,fontSize:'11px',fontFamily:'monospace'}}>{tag}</span>
                    ))}
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',maxWidth:'580px',margin:'0 auto'}}>
                    {SUGGESTIONS.map((s,i)=>(
                      <button key={i} onClick={()=>{const id=newConv();setTimeout(()=>send(s.text),50);}} style={{background:t.surface,border:`1px solid ${t.border}`,color:t.text,padding:'12px 14px',borderRadius:'10px',cursor:'pointer',fontSize:'12px',textAlign:'left',transition:'all 0.2s',lineHeight:1.4,fontFamily:"'IBM Plex Sans',sans-serif"}}
                        onMouseEnter={e=>{e.currentTarget.style.borderColor=`${t.accent}55`;e.currentTarget.style.color=t.accent;}}
                        onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.color=t.text;}}>
                        <span style={{marginRight:'6px'}}>{s.icon}</span>{s.text}
                      </button>
                    ))}
                  </div>
                  <p style={{color:t.muted,fontSize:'11px',marginTop:'28px',fontFamily:'monospace'}}>💡 Arrastrá archivos · Doble click para renombrar · Ctrl+K para buscar</p>
                </div>
              )}
              {activeConv&&messages.length===0&&<div style={{textAlign:'center',paddingTop:'60px'}}><p style={{color:t.muted,fontSize:'14px'}}>Conversación nueva. ¿Arrancamos?</p></div>}
              {messages.map((m,i)=><Bubble key={i} message={m} t={t} onDiff={(o,n)=>{setDiffData({o,n});setModal('diff');}}/>)}
              {isThinking&&!streamText&&<Thinking t={t}/>}
              {streamText&&<StreamingBubble streamText={streamText} t={t}/>}
              <div ref={bottomRef}/>
            </div>
          </div>

          {/* INPUT */}
          <div style={{padding:'10px 18px 18px',borderTop:`1px solid ${t.border}`,background:t.bg,flexShrink:0}}>
            <div style={{maxWidth:'860px',margin:'0 auto'}}>
              {files.length>0&&(
                <div style={{display:'flex',flexWrap:'wrap',gap:'6px',marginBottom:'8px'}}>
                  {files.map((f,i)=><FileBadge key={i} file={f} t={t} onRemove={()=>setFiles(prev=>prev.filter((_,j)=>j!==i))}/>)}
                </div>
              )}
              <div style={{display:'flex',gap:'8px',alignItems:'flex-end',background:t.surface,border:`1px solid ${t.border}`,borderRadius:'14px',padding:'10px 12px',transition:'border-color 0.2s'}}
                onFocus={e=>e.currentTarget.style.borderColor=`${t.accent}55`}
                onBlur={e=>e.currentTarget.style.borderColor=t.border}>
                <button onClick={()=>fileRef.current?.click()} title='Subir archivo' style={{background:'none',border:`1px solid ${t.border}`,color:t.muted,width:'32px',height:'32px',borderRadius:'8px',cursor:'pointer',fontSize:'15px',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all 0.2s'}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=`${t.accent}55`;e.currentTarget.style.color=t.accent;}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.color=t.muted;}}>📎</button>
                <textarea ref={taRef} value={input} onChange={e=>setInput(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}}
                  placeholder='Preguntá sobre código, pedí que mejore un caption, o subí un archivo...'
                  disabled={loading} rows={1}
                  style={{flex:1,background:'none',border:'none',color:t.text,fontSize:'14px',fontFamily:"'IBM Plex Sans',sans-serif",resize:'none',lineHeight:'1.6',minHeight:'24px',maxHeight:'180px',overflowY:'auto'}}
                  onInput={e=>{e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,180)+'px';}}/>
                <button
                  onClick={loading ? stopStream : send}
                  disabled={!loading&&(!input.trim()&&!files.length)}
                  style={{width:'34px',height:'34px',borderRadius:'9px',border:'none',flexShrink:0,
                    background: loading ? '#ff444488' : (!input.trim()&&!files.length) ? t.border : t.grad,
                    cursor: (!loading&&!input.trim()&&!files.length) ? 'not-allowed' : 'pointer',
                    color:'#fff',fontSize:'15px',display:'flex',alignItems:'center',justifyContent:'center',
                    boxShadow: loading ? '0 0 14px #ff444466' : (!input.trim()&&!files.length) ? 'none' : `0 0 14px ${t.accent}66`,
                    transition:'all 0.2s',border: loading ? '1px solid #ff444466' : 'none'}}>
                  {loading
                    ? <span style={{fontSize:'12px',fontWeight:'bold'}}>⏹</span>
                    : '→'}
                </button>
              </div>
              <p style={{color:t.muted,fontSize:'10px',textAlign:'center',marginTop:'6px',fontFamily:'monospace'}}>Enter enviar · Shift+Enter nueva línea · Ctrl+K buscar · Ctrl+N nueva · Ctrl+E exportar · Ctrl+D tema</p>
            </div>
          </div>
        </div>

        <ToolsPanel executions={toolExecutions} isOpen={toolsPanelOpen} onClose={()=>setToolsPanelOpen(false)} t={t}/>
      </div>

      {modal==='search'&&<SearchModal conversations={convs} onSelect={setActiveId} onClose={()=>setModal(null)} t={t}/>}
      {modal==='shortcuts'&&<ShortcutsModal onClose={()=>setModal(null)} t={t}/>}
      {modal==='diff'&&diffData&&<DiffModal original={diffData.o} modified={diffData.n} onClose={()=>setModal(null)} t={t}/>}
      {modal==='memory'&&<MemoryPanel memories={memories} onDelete={handleDeleteMemory} onClose={()=>setModal(null)} t={t}/>}
      {modal==='analyzer'&&<ProjectAnalyzerModal onClose={()=>setModal(null)} onAnalyze={handleProjectAnalyze} t={t}/>}
      {modal==='analyzer'&&<ProjectAnalyzerModal onClose={()=>setModal(null)} onAnalyze={handleProjectAnalyze} t={t}/>}
      <input ref={fileRef} type='file' multiple accept='.py,.js,.ts,.jsx,.tsx,.html,.css,.java,.cpp,.c,.cs,.go,.rs,.rb,.php,.sh,.sql,.json,.yaml,.yml,.md,.txt,.vue,.svelte,.kt,.swift,.dart,.pdf,.png,.jpg,.jpeg,.gif,.webp' style={{display:'none'}} onChange={e=>handleFiles(e.target.files)}/>
    </>
  );
}
