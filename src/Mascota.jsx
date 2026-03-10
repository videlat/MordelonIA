// src/Mascota.jsx
// Mascota de MordelonIA — draggable, con expresiones reactivas al estado del chat
import { useState, useEffect, useRef, useCallback } from 'react';

// ── Estados posibles ──────────────────────────────────────────────────────────
// 'idle'      → flotando tranquila
// 'thinking'  → la IA está procesando
// 'talking'   → la IA está respondiendo (streaming)
// 'reacting'  → el usuario acaba de mandar un mensaje

// ── SVG del personaje por estado ─────────────────────────────────────────────
function MascotaSVG({ state, accent }) {
  // Ojos
  const eyeIdle    = <><circle cx="38" cy="44" r="5" fill="#fff"/><circle cx="38" cy="45" r="2.5" fill="#111"/><circle cx="62" cy="44" r="5" fill="#fff"/><circle cx="62" cy="45" r="2.5" fill="#111"/></>;
  const eyeThink   = <><ellipse cx="38" cy="45" rx="5" ry="3.5" fill="#fff"/><circle cx="38" cy="45" r="2" fill="#111"/><ellipse cx="62" cy="45" rx="5" ry="3.5" fill="#fff"/><circle cx="62" cy="45" r="2" fill="#111"/></>; // ojos entrecerrados
  const eyeTalk    = <><circle cx="38" cy="44" r="5.5" fill="#fff"/><circle cx="38.5" cy="43.5" r="2.8" fill="#111"/><circle cx="62" cy="44" r="5.5" fill="#fff"/><circle cx="62.5" cy="43.5" r="2.8" fill="#111"/></>; // ojos animados arriba
  const eyeReact   = <><circle cx="38" cy="42" r="6" fill="#fff"/><circle cx="38" cy="42" r="3" fill="#111"/><circle cx="62" cy="42" r="6" fill="#fff"/><circle cx="62" cy="42" r="3" fill="#111"/></>; // ojos grandes sorprendidos

  // Boca
  const mouthIdle  = <path d="M 40 58 Q 50 65 60 58" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round"/>;
  const mouthThink = <path d="M 42 60 Q 50 58 58 60" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round"/>; // línea recta
  const mouthTalk  = <ellipse cx="50" cy="60" rx="8" ry="5" fill="#fff" opacity="0.9"/>; // boca abierta
  const mouthReact = <path d="M 40 56 Q 50 68 60 56" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round"/>; // sonrisa grande

  // Cejas
  const browsIdle  = null;
  const browsThink = <><path d="M 33 36 Q 38 33 43 36" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round"/><path d="M 57 36 Q 62 33 67 36" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round"/></>;
  const browsReact = <><path d="M 33 35 Q 38 30 43 35" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round"/><path d="M 57 35 Q 62 30 67 35" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round"/></>;

  // Detalles extra por estado
  const thinkDots = state === 'thinking' ? (
    <>
      <circle cx="74" cy="32" r="3" fill={accent} opacity="0.9" className="think-dot-1"/>
      <circle cx="82" cy="24" r="2.5" fill={accent} opacity="0.7" className="think-dot-2"/>
      <circle cx="88" cy="16" r="2" fill={accent} opacity="0.5" className="think-dot-3"/>
    </>
  ) : null;

  const eyes  = state==='thinking' ? eyeThink  : state==='talking' ? eyeTalk  : state==='reacting' ? eyeReact  : eyeIdle;
  const mouth = state==='thinking' ? mouthThink : state==='talking' ? mouthTalk : state==='reacting' ? mouthReact : mouthIdle;
  const brows = state==='thinking' ? browsThink : state==='reacting' ? browsReact : browsIdle;

  // Brillo en modo talking
  const glow = state === 'talking' ? (
    <circle cx="50" cy="50" r="46" fill="none" stroke={accent} strokeWidth="2" opacity="0.4"/>
  ) : null;

  return (
    <svg viewBox="0 0 100 100" width="80" height="80" style={{display:'block',overflow:'visible'}}>
      {/* Sombra */}
      <ellipse cx="50" cy="96" rx="22" ry="4" fill="rgba(0,0,0,0.25)"/>
      {/* Cuerpo principal */}
      <circle cx="50" cy="50" r="42" fill={accent} opacity="0.15"/>
      <circle cx="50" cy="50" r="38" fill={`url(#bodyGrad)`}/>
      {glow}
      {/* Gradiente del cuerpo */}
      <defs>
        <radialGradient id="bodyGrad" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor={accent} stopOpacity="1"/>
          <stop offset="100%" stopColor={accent} stopOpacity="0.6"/>
        </radialGradient>
      </defs>
      {/* Brillo superior */}
      <ellipse cx="40" cy="34" rx="12" ry="7" fill="rgba(255,255,255,0.18)" transform="rotate(-20 40 34)"/>
      {/* Expresiones */}
      {brows}
      {eyes}
      {mouth}
      {/* Puntos de pensar */}
      {thinkDots}
      {/* Orejitas */}
      <circle cx="14" cy="38" r="8" fill={accent} opacity="0.8"/>
      <circle cx="14" cy="38" r="4.5" fill={accent}/>
      <circle cx="86" cy="38" r="8" fill={accent} opacity="0.8"/>
      <circle cx="86" cy="38" r="4.5" fill={accent}/>
    </svg>
  );
}

// ── Burbuja de texto que aparece al lado ──────────────────────────────────────
const BUBBLES = {
  idle:     ['👾', '...', '¿Todo bien?', 'Acá estoy.'],
  thinking: ['Hmm...', 'Déjame pensar.', 'Analizando...', '🧠'],
  talking:  ['Mirá esto:', 'Acá va:', '¿Ves?', '↓'],
  reacting: ['¡Dale!', 'Recibido.', 'Ya veo.', '👀'],
};

export default function Mascota({ state = 'idle', accent = '#ff6b00', border = '#1e2d3d', surface = '#0a1929' }) {
  // ── Posición draggable ─────────────────────────────────────────────────────
  const [pos, setPos]       = useState({ x: window.innerWidth - 110, y: window.innerHeight - 160 });
  const [dragging, setDragging] = useState(false);
  const [bubble, setBubble] = useState('');
  const [showBubble, setShowBubble] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const bubbleTimer = useRef(null);
  const prevState = useRef(state);

  // Cambiar burbuja cuando cambia el estado
  useEffect(() => {
    if (prevState.current === state) return;
    prevState.current = state;
    const options = BUBBLES[state] || [];
    const text = options[Math.floor(Math.random() * options.length)];
    setBubble(text);
    setShowBubble(true);
    clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setShowBubble(false), 2500);
  }, [state]);

  // Burbuja idle aleatoria cada 12s
  useEffect(() => {
    const interval = setInterval(() => {
      if (state !== 'idle') return;
      const options = BUBBLES.idle;
      setBubble(options[Math.floor(Math.random() * options.length)]);
      setShowBubble(true);
      clearTimeout(bubbleTimer.current);
      bubbleTimer.current = setTimeout(() => setShowBubble(false), 2200);
    }, 12000);
    return () => clearInterval(interval);
  }, [state]);

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    setDragging(true);
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  }, [pos]);

  const onTouchStart = useCallback((e) => {
    const t = e.touches[0];
    setDragging(true);
    dragOffset.current = { x: t.clientX - pos.x, y: t.clientY - pos.y };
  }, [pos]);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e) => {
      const { clientX, clientY } = e.touches ? e.touches[0] : e;
      setPos({
        x: Math.min(Math.max(0, clientX - dragOffset.current.x), window.innerWidth  - 90),
        y: Math.min(Math.max(0, clientY - dragOffset.current.y), window.innerHeight - 100),
      });
    };
    const onUp = () => setDragging(false);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend',  onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend',  onUp);
    };
  }, [dragging]);

  // ── Animación por estado ───────────────────────────────────────────────────
  const animName = {
    idle:     'mascota-float',
    thinking: 'mascota-think',
    talking:  'mascota-talk',
    reacting: 'mascota-react',
  }[state] || 'mascota-float';

  return (
    <>
      <style>{`
        @keyframes mascota-float {
          0%,100% { transform: translateY(0px) rotate(0deg); }
          50%      { transform: translateY(-8px) rotate(1.5deg); }
        }
        @keyframes mascota-think {
          0%,100% { transform: translateY(0px) rotate(-3deg); }
          50%      { transform: translateY(-4px) rotate(3deg); }
        }
        @keyframes mascota-talk {
          0%,100% { transform: translateY(0px) scale(1); }
          25%      { transform: translateY(-5px) scale(1.04); }
          75%      { transform: translateY(-3px) scale(1.02); }
        }
        @keyframes mascota-react {
          0%   { transform: scale(1) rotate(0deg); }
          20%  { transform: scale(1.15) rotate(-5deg); }
          40%  { transform: scale(0.95) rotate(4deg); }
          60%  { transform: scale(1.08) rotate(-2deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        @keyframes think-pulse {
          0%,100% { opacity: 0.2; transform: scale(0.8); }
          50%      { opacity: 1;   transform: scale(1.2); }
        }
        .think-dot-1 { animation: think-pulse 1s ease-in-out infinite 0s; }
        .think-dot-2 { animation: think-pulse 1s ease-in-out infinite 0.3s; }
        .think-dot-3 { animation: think-pulse 1s ease-in-out infinite 0.6s; }
        @keyframes bubble-in {
          from { opacity:0; transform: scale(0.7) translateY(6px); }
          to   { opacity:1; transform: scale(1) translateY(0); }
        }
        @keyframes bubble-out {
          from { opacity:1; }
          to   { opacity:0; transform: scale(0.85) translateY(4px); }
        }
      `}</style>

      <div
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        style={{
          position:  'fixed',
          left:      pos.x,
          top:       pos.y,
          zIndex:    9999,
          cursor:    dragging ? 'grabbing' : 'grab',
          userSelect:'none',
          touchAction:'none',
          display:   'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        {/* Burbuja de texto */}
        {showBubble && bubble && (
          <div style={{
            background: surface,
            border: `1px solid ${border}`,
            borderRadius: '12px 12px 12px 4px',
            padding: '5px 10px',
            fontSize: '11px',
            color: '#ccc',
            fontFamily: "'IBM Plex Mono', monospace",
            whiteSpace: 'nowrap',
            boxShadow: `0 4px 16px rgba(0,0,0,0.4)`,
            animation: 'bubble-in 0.25s ease',
            pointerEvents: 'none',
            maxWidth: '140px',
            textAlign: 'center',
          }}>
            {bubble}
          </div>
        )}

        {/* Personaje */}
        <div style={{
          animation: `${animName} ${state==='reacting'?'0.6s':state==='thinking'?'2s':'3s'} ease-in-out ${state==='reacting'?'1':'infinite'}`,
          filter: `drop-shadow(0 4px 12px ${accent}55)`,
          transition: 'filter 0.3s ease',
        }}>
          <MascotaSVG state={state} accent={accent}/>
        </div>
      </div>
    </>
  );
}
