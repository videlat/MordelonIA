import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { saveConversation, loadConversations, deleteConversation as fbDelete } from './firebase';

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
- Cuando el usuario te corrija algo, respondés tipo: "Razón tenés, lo corrijo" o "Ah sí, se me fue. Gracias."`;

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
          {!isUser&&codes.length>0&&message.originalCode&&(
            <button onClick={()=>onDiff(message.originalCode,codes[0].content)} style={{background:'none',border:`1px solid ${t.border}`,color:t.accent,fontSize:'10px',padding:'1px 8px',borderRadius:'4px',cursor:'pointer',fontFamily:'monospace'}}>ver diff</button>
          )}
        </div>
      </div>
      {isUser&&<div style={{width:'36px',height:'36px',borderRadius:'10px',background:t.ub,border:`1px solid ${t.ubr}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px',flexShrink:0}}>👤</div>}
    </div>
  );
}

// ─── TYPING ───────────────────────────────────────────────────────────────────
function Typing({t}) {
  return (
    <div style={{display:'flex',gap:'10px',marginBottom:'18px',alignItems:'flex-start'}}>
      <div style={{width:'36px',height:'36px',borderRadius:'10px',background:t.grad,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'18px'}}>🔥</div>
      <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:'16px 16px 16px 4px',padding:'14px 18px',display:'flex',gap:'5px',alignItems:'center'}}>
        {[0,1,2].map(i=><div key={i} style={{width:'7px',height:'7px',borderRadius:'50%',background:t.accent,animation:'bounce 1.2s infinite',animationDelay:`${i*0.2}s`}}/>)}
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

  const t=THEMES[themeKey];
  const activeConv=convs.find(c=>c.id===activeId);
  const messages=activeConv?.messages||[];
  const bottomRef=useRef(null);
  const fileRef=useRef(null);
  const taRef=useRef(null);
  const saveTimer=useRef({});

  // LOAD FROM FIREBASE
  useEffect(()=>{
    loadConversations().then(loaded=>{
      setFbOk(true);
      if(loaded.length>0){ setConvs(loaded); setActiveId(loaded[0].id); }
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
    const h=history.map(m=>({role:m.role,content:typeof m.content==='string'?m.content:m.content}));
    if(!fls.length) return [...h,{role:'user',content:text}];
    const blocks=[];
    for(const f of fls){
      if(isImg(f)){ const b=await readB64(f); blocks.push({type:'image',source:{type:'base64',media_type:getMT(f),data:b}}); }
      else if(isPdf(f)){ const b=await readB64(f); blocks.push({type:'document',source:{type:'base64',media_type:'application/pdf',data:b}}); }
      else if(isCode(f)){ const tx=await readTxt(f); blocks.push({type:'text',text:`**Archivo: ${f.name}**\n\`\`\`${getExt(f.name)}\n${tx}\n\`\`\``}); }
    }
    if(text) blocks.push({type:'text',text});
    return [...h,{role:'user',content:blocks}];
  };

  const send=async(override)=>{
    const text=override??input.trim();
    if((!text&&!files.length)||loading) return;
    let cid=activeId||newConv();
    const fls=[...files];
    const origCode=fls.length>0&&isCode(fls[0])?await readTxt(fls[0]).catch(()=>null):null;
    const userMsg={role:'user',content:text,timestamp:Date.now(),attachments:fls.map(f=>({name:f.name,type:f.type,size:f.size}))};
    setInput(''); setFiles([]); setLoading(true);
    updateConv(cid,c=>({...c,messages:[...c.messages,userMsg],title:c.messages.length===0?(text?.slice(0,48)||fls[0]?.name||'Conversación'):c.title}));
    try {
      const current=convs.find(c=>c.id===cid)||{messages:[]};
      const apiMsgs=await buildMsgs(current.messages,text,fls);
      const apiKey=process.env.REACT_APP_ANTHROPIC_KEY;
      const res=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:8192,system:SYSTEM_PROMPT,messages:apiMsgs}),
      });
      const data=await res.json();
      if(data.error) throw new Error(data.error.message);
      const replyTxt=data.content?.map(b=>b.text||'').join('')||'Sin respuesta.';
      updateConv(cid,c=>({...c,messages:[...c.messages,{role:'assistant',content:replyTxt,timestamp:Date.now(),...(origCode?{originalCode:origCode}:{})}]}));
    } catch(err){
      updateConv(cid,c=>({...c,messages:[...c.messages,{role:'assistant',content:`Error: ${err.message}`,timestamp:Date.now()}]}));
      showNotif('Error al conectar','error');
    } finally { setLoading(false); }
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
              {loading&&<Typing t={t}/>}
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
                <button onClick={()=>send()} disabled={loading||(!input.trim()&&!files.length)} style={{width:'34px',height:'34px',borderRadius:'9px',border:'none',flexShrink:0,background:loading||(!input.trim()&&!files.length)?t.border:t.grad,cursor:loading||(!input.trim()&&!files.length)?'not-allowed':'pointer',color:'#fff',fontSize:'15px',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:loading||(!input.trim()&&!files.length)?'none':`0 0 14px ${t.accent}66`,transition:'all 0.2s'}}>
                  {loading?<div style={{width:'14px',height:'14px',border:'2px solid #ffffff44',borderTopColor:'#fff',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>:'→'}
                </button>
              </div>
              <p style={{color:t.muted,fontSize:'10px',textAlign:'center',marginTop:'6px',fontFamily:'monospace'}}>Enter enviar · Shift+Enter nueva línea · Ctrl+K buscar · Ctrl+N nueva · Ctrl+E exportar · Ctrl+D tema</p>
            </div>
          </div>
        </div>
      </div>

      {modal==='search'&&<SearchModal conversations={convs} onSelect={setActiveId} onClose={()=>setModal(null)} t={t}/>}
      {modal==='shortcuts'&&<ShortcutsModal onClose={()=>setModal(null)} t={t}/>}
      {modal==='diff'&&diffData&&<DiffModal original={diffData.o} modified={diffData.n} onClose={()=>setModal(null)} t={t}/>}
      <input ref={fileRef} type='file' multiple accept='.py,.js,.ts,.jsx,.tsx,.html,.css,.java,.cpp,.c,.cs,.go,.rs,.rb,.php,.sh,.sql,.json,.yaml,.yml,.md,.txt,.vue,.svelte,.kt,.swift,.dart,.pdf,.png,.jpg,.jpeg,.gif,.webp' style={{display:'none'}} onChange={e=>handleFiles(e.target.files)}/>
    </>
  );
}
