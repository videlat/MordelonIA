// src/Mascota.jsx
// Mascota de MordelonIA — personaje llama turquesa con campera negra
// 9 poses: idle, hablando, pensando, escribiendo, ok, sorprendido, feliz, cansado, duerme
import { useState, useEffect, useRef, useCallback } from 'react';

const C = {
  skin:      '#3DBFB8',
  skinDark:  '#2A9E98',
  skinLight: '#6DE8E0',
  jacket:    '#1c1c1c',
  jacketL:   '#2e2e2e',
  shoe:      '#e8e8e8',
  shoeSole:  '#aaaaaa',
  eye:       '#ffffff',
  pupil:     '#111111',
  mouth:     '#cc3333',
  ol:        '#111111',
};

// ── Cabeza (llama/gota con punta de fuego) ────────────────────────────────────
function Head({ cx=0, cy=0, children }) {
  return (
    <g transform={`translate(${cx},${cy})`}>
      {/* Llama izq */}
      <path d="M-14,-32 C-20,-46 -22,-54 -14,-64 C-7,-54 -10,-46 -14,-32Z"
        fill={C.skin} stroke={C.ol} strokeWidth="1.3" strokeLinejoin="round"/>
      {/* Llama central */}
      <path d="M0,-36 C-5,-52 -6,-62 0,-72 C6,-62 5,-52 0,-36Z"
        fill={C.skinLight} stroke={C.ol} strokeWidth="1.3" strokeLinejoin="round"/>
      {/* Llama der */}
      <path d="M14,-32 C20,-46 22,-54 14,-64 C7,-54 10,-46 14,-32Z"
        fill={C.skin} stroke={C.ol} strokeWidth="1.3" strokeLinejoin="round"/>
      {/* Cabeza */}
      <ellipse cx="0" cy="-8" rx="28" ry="32"
        fill={C.skin} stroke={C.ol} strokeWidth="1.5"/>
      {/* Brillo */}
      <ellipse cx="-9" cy="-20" rx="7" ry="5" fill={C.skinLight} opacity="0.45" transform="rotate(-25,-9,-20)"/>
      {children}
    </g>
  );
}

// Ojos normales
function EN({ dy=0 }) {
  return (<>
    <circle cx="-11" cy={-10+dy} r="7.5" fill={C.eye} stroke={C.ol} strokeWidth="1"/>
    <circle cx="11"  cy={-10+dy} r="7.5" fill={C.eye} stroke={C.ol} strokeWidth="1"/>
    <circle cx="-10" cy={-9+dy}  r="4"   fill={C.pupil}/>
    <circle cx="12"  cy={-9+dy}  r="4"   fill={C.pupil}/>
    <circle cx="-8"  cy={-12+dy} r="1.4" fill="#fff"/>
    <circle cx="14"  cy={-12+dy} r="1.4" fill="#fff"/>
  </>);
}
// Entrecerrados
function EE() {
  return (<>
    <ellipse cx="-11" cy="-10" rx="7.5" ry="4.5" fill={C.eye} stroke={C.ol} strokeWidth="1"/>
    <ellipse cx="11"  cy="-10" rx="7.5" ry="4.5" fill={C.eye} stroke={C.ol} strokeWidth="1"/>
    <ellipse cx="-11" cy="-10" rx="4"   ry="2.2" fill={C.pupil}/>
    <ellipse cx="11"  cy="-10" rx="4"   ry="2.2" fill={C.pupil}/>
    <path d="M-18,-17 C-13,-21 -5,-20 -2,-17" stroke={C.ol} strokeWidth="1.8" fill="none" strokeLinecap="round"/>
    <path d="M2,-17 C5,-20 13,-21 18,-17"     stroke={C.ol} strokeWidth="1.8" fill="none" strokeLinecap="round"/>
  </>);
}
// Grandes/sorprendidos
function EG() {
  return (<>
    <circle cx="-11" cy="-10" r="9"   fill={C.eye} stroke={C.ol} strokeWidth="1.2"/>
    <circle cx="11"  cy="-10" r="9"   fill={C.eye} stroke={C.ol} strokeWidth="1.2"/>
    <circle cx="-11" cy="-10" r="5"   fill={C.pupil}/>
    <circle cx="11"  cy="-10" r="5"   fill={C.pupil}/>
    <circle cx="-8"  cy="-14" r="1.8" fill="#fff"/>
    <circle cx="14"  cy="-14" r="1.8" fill="#fff"/>
  </>);
}
// Felices (curvados)
function EF() {
  return (<>
    <path d="M-19,-15 Q-11,-7 -3,-15" stroke={C.ol} strokeWidth="2.5" fill="none" strokeLinecap="round"/>
    <path d="M3,-15 Q11,-7 19,-15"    stroke={C.ol} strokeWidth="2.5" fill="none" strokeLinecap="round"/>
  </>);
}
// Cerrados
function EC() {
  return (<>
    <path d="M-18,-10 Q-11,-5 -4,-10" stroke={C.ol} strokeWidth="2.2" fill="none" strokeLinecap="round"/>
    <path d="M4,-10 Q11,-5 18,-10"    stroke={C.ol} strokeWidth="2.2" fill="none" strokeLinecap="round"/>
  </>);
}

// Boca sonrisa
function MS() { return <path d="M-8,0 Q0,8 8,0" stroke={C.mouth} strokeWidth="2.2" fill="none" strokeLinecap="round"/>; }
// Boca abierta
function MO() { return (<>
  <path d="M-9,0 Q0,11 9,0" stroke={C.ol} strokeWidth="1" fill={C.mouth}/>
  <ellipse cx="0" cy="4" rx="7" ry="5" fill={C.mouth}/>
</>); }
// Boca O sorpresa
function MQ() { return <ellipse cx="0" cy="2" rx="5" ry="6.5" fill={C.mouth} stroke={C.ol} strokeWidth="1"/>; }
// Sonrisa grande
function MB() { return (<>
  <path d="M-13,0 Q0,14 13,0" stroke={C.ol} strokeWidth="1" fill={C.mouth}/>
</>); }
// Línea recta
function ML() { return <path d="M-7,1 Q0,3 7,1" stroke={C.mouth} strokeWidth="2" fill="none" strokeLinecap="round"/>; }

// ── Torso ────────────────────────────────────────────────────────────────────
function Torso({ cx=0, cy=0 }) {
  return (
    <g transform={`translate(${cx},${cy})`}>
      <rect x="-24" y="0" width="48" height="44" rx="10" fill={C.jacket} stroke={C.ol} strokeWidth="1.5"/>
      {/* Zipper */}
      <line x1="0" y1="0" x2="0" y2="44" stroke={C.jacketL} strokeWidth="3"/>
      <rect x="-2" y="0" width="4" height="44" fill={C.jacketL} opacity="0.4"/>
      {/* Bolsillos */}
      <rect x="-22" y="24" width="15" height="12" rx="4" fill={C.jacketL} stroke={C.ol} strokeWidth="1"/>
      <rect x="7"   y="24" width="15" height="12" rx="4" fill={C.jacketL} stroke={C.ol} strokeWidth="1"/>
    </g>
  );
}

// ── Piernas ───────────────────────────────────────────────────────────────────
function Piernas({ cx=0, cy=0, spread=0 }) {
  const lx = -12 - spread, rx = 12 + spread;
  return (
    <g transform={`translate(${cx},${cy})`}>
      {/* Pantalón */}
      <rect x={lx-7} y="0" width="15" height="20" rx="5" fill={C.skin} stroke={C.ol} strokeWidth="1.2"/>
      <rect x={rx-8} y="0" width="15" height="20" rx="5" fill={C.skin} stroke={C.ol} strokeWidth="1.2"/>
      {/* Zapatillas */}
      <rect x={lx-10} y="18" width="20" height="8"  rx="4" fill={C.shoe} stroke={C.ol} strokeWidth="1.2"/>
      <rect x={lx-10} y="24" width="20" height="4"  rx="2" fill={C.shoeSole}/>
      <rect x={rx-10} y="18" width="20" height="8"  rx="4" fill={C.shoe} stroke={C.ol} strokeWidth="1.2"/>
      <rect x={rx-10} y="24" width="20" height="4"  rx="2" fill={C.shoeSole}/>
      {/* Cordones */}
      <line x1={lx-7} y1="21" x2={lx+7}  y2="21" stroke="#ccc" strokeWidth="1"/>
      <line x1={rx-7} y1="21" x2={rx+7}  y2="21" stroke="#ccc" strokeWidth="1"/>
    </g>
  );
}

// ── Brazo ─────────────────────────────────────────────────────────────────────
function Brazo({ cx=0, cy=0, rot=0, flip=false }) {
  return (
    <g transform={`translate(${cx},${cy}) rotate(${rot}) scale(${flip?-1:1},1)`}>
      <rect x="-7" y="0" width="14" height="28" rx="7" fill={C.jacket} stroke={C.ol} strokeWidth="1.2"/>
      <ellipse cx="0" cy="30" rx="8" ry="7" fill={C.skin} stroke={C.ol} strokeWidth="1.2"/>
    </g>
  );
}

// ── POSES ─────────────────────────────────────────────────────────────────────

function PoseIdle() {
  return <svg viewBox="0 0 120 185" width="95" height="148">
    <Brazo cx={34} cy={108} rot={8}/>
    <Brazo cx={86} cy={108} rot={-8} flip/>
    <Torso cx={60} cy={108}/>
    <Piernas cx={60} cy={152}/>
    <Head cx={60} cy={66}><EN/><MS/></Head>
  </svg>;
}

function PoseHablando() {
  return <svg viewBox="0 0 150 185" width="115" height="148">
    {/* Burbuja habla */}
    <ellipse cx="118" cy="30" rx="24" ry="14" fill="white" stroke="#ccc" strokeWidth="1.5"/>
    <circle cx="98"  cy="42" r="5"  fill="white" stroke="#ccc" strokeWidth="1"/>
    <circle cx="90"  cy="50" r="3"  fill="white" stroke="#ccc" strokeWidth="1"/>
    <circle cx="108" cy="30" r="3"  fill="#999"/>
    <circle cx="118" cy="30" r="3"  fill="#999"/>
    <circle cx="128" cy="30" r="3"  fill="#999"/>
    {/* Brazo levantado con gesto */}
    <g transform="translate(90,100) rotate(-50)">
      <rect x="-7" y="0" width="14" height="28" rx="7" fill={C.jacket} stroke={C.ol} strokeWidth="1.2"/>
      <ellipse cx="0" cy="30" rx="8" ry="7" fill={C.skin} stroke={C.ol} strokeWidth="1.2"/>
      <circle cx="8" cy="28" r="4" fill={C.skin} stroke={C.ol} strokeWidth="1"/>
      <circle cx="12" cy="22" r="3" fill={C.skin} stroke={C.ol} strokeWidth="1"/>
    </g>
    <Brazo cx={34} cy={108} rot={5}/>
    <Torso cx={60} cy={108}/>
    <Piernas cx={60} cy={152}/>
    <Head cx={60} cy={66}><EN/><MO/></Head>
  </svg>;
}

function PosePensando() {
  return <svg viewBox="0 0 150 185" width="115" height="148">
    {/* Burbuja pensamiento */}
    <ellipse cx="112" cy="28" rx="22" ry="13" fill="white" stroke="#ccc" strokeWidth="1.5"/>
    <circle cx="93"  cy="40" r="5"  fill="white" stroke="#ccc" strokeWidth="1"/>
    <circle cx="85"  cy="49" r="3.5" fill="white" stroke="#ccc" strokeWidth="1"/>
    <circle cx="80"  cy="56" r="2"  fill="white" stroke="#ccc" strokeWidth="0.8"/>
    <circle cx="103" cy="28" r="2.5" fill="#aaa"/>
    <circle cx="112" cy="28" r="2.5" fill="#aaa"/>
    <circle cx="121" cy="28" r="2.5" fill="#aaa"/>
    {/* Mano en barbilla */}
    <g transform="translate(88,118) rotate(-25)">
      <rect x="-7" y="0" width="14" height="22" rx="7" fill={C.jacket} stroke={C.ol} strokeWidth="1.2"/>
      <ellipse cx="0" cy="24" rx="8" ry="7" fill={C.skin} stroke={C.ol} strokeWidth="1.2"/>
    </g>
    <Brazo cx={34} cy={108} rot={10}/>
    <Torso cx={60} cy={108}/>
    <Piernas cx={60} cy={152}/>
    <Head cx={60} cy={68}><EE/><ML/></Head>
  </svg>;
}

function PoseEscribiendo() {
  return <svg viewBox="0 0 160 185" width="120" height="148">
    {/* Laptop */}
    <g transform="translate(98,132)">
      <rect x="-28" y="-36" width="56" height="34" rx="5" fill="#0a0a1e" stroke="#333" strokeWidth="2"/>
      <rect x="-24" y="-32" width="48" height="26" rx="2" fill="#0d1b4b"/>
      <ellipse cx="-4" cy="-20" rx="10" ry="7" fill="#1a3a8a" opacity="0.7"/>
      <rect x="-31" y="-2" width="62" height="6" rx="3" fill="#333" stroke="#222" strokeWidth="1"/>
    </g>
    {/* Brazos sobre teclado */}
    <g transform="translate(44,120) rotate(35)">
      <rect x="-6" y="-4" width="13" height="20" rx="6" fill={C.jacket} stroke={C.ol} strokeWidth="1.2"/>
      <ellipse cx="0" cy="19" rx="7" ry="5" fill={C.skin} stroke={C.ol} strokeWidth="1.2"/>
    </g>
    <g transform="translate(76,122) rotate(-25)">
      <rect x="-6" y="-4" width="13" height="20" rx="6" fill={C.jacket} stroke={C.ol} strokeWidth="1.2"/>
      <ellipse cx="0" cy="19" rx="7" ry="5" fill={C.skin} stroke={C.ol} strokeWidth="1.2"/>
    </g>
    <Torso cx={60} cy={108}/>
    <Piernas cx={60} cy={152}/>
    <Head cx={58} cy={66}><EN dy={2}/><MS/></Head>
  </svg>;
}

function PoseOk() {
  return <svg viewBox="0 0 148 185" width="112" height="148">
    {/* Tilde en círculo verde */}
    <circle cx="115" cy="28" r="18" fill="#2DC653" stroke="#1a9e3a" strokeWidth="1.5"/>
    <path d="M106,28 L113,36 L126,18" stroke="white" strokeWidth="3.5" fill="none"
      strokeLinecap="round" strokeLinejoin="round"/>
    {/* Pulgar arriba */}
    <g transform="translate(88,102) rotate(-35)">
      <rect x="-7" y="0" width="14" height="26" rx="7" fill={C.jacket} stroke={C.ol} strokeWidth="1.2"/>
      <ellipse cx="0" cy="28" rx="8" ry="7" fill={C.skin} stroke={C.ol} strokeWidth="1.2"/>
      {/* Pulgar */}
      <ellipse cx="11" cy="16" rx="5" ry="7" fill={C.skin} stroke={C.ol} strokeWidth="1.2" transform="rotate(25,11,16)"/>
    </g>
    <Brazo cx={34} cy={108} rot={5}/>
    <Torso cx={60} cy={108}/>
    <Piernas cx={60} cy={152}/>
    <Head cx={60} cy={66}><EN/><MS/></Head>
  </svg>;
}

function PoseSorprendido() {
  return <svg viewBox="0 0 130 185" width="100" height="148">
    {/* Exclamación */}
    <circle cx="20" cy="38" r="20" fill="#cc2222" stroke="#aa0000" strokeWidth="1.5"/>
    <rect x="17" y="22" width="6" height="12" rx="3" fill="white"/>
    <circle cx="20" cy="40" r="3.5" fill="white"/>
    <Brazo cx={34} cy={108} rot={18}/>
    <Brazo cx={86} cy={108} rot={-18} flip/>
    <Torso cx={60} cy={108}/>
    <Piernas cx={60} cy={152} spread={4}/>
    <Head cx={62} cy={64}><EG/><MQ/></Head>
  </svg>;
}

function PoseFeliz() {
  return <svg viewBox="0 0 148 200" width="112" height="155">
    {/* Confetti */}
    {[[82,12,'#FF4D4D',15],[98,28,'#FFD700',-20],[68,8,'#4CAF50',10],
      [112,42,'#2196F3',25],[50,18,'#FF9500',5],[118,18,'#E91E63',-15],
      [76,35,'#9C27B0',30],[105,10,'#FF5722',-10]].map(([x,y,c,r],i)=>(
      <rect key={i} x={x} y={y} width="7" height="11" rx="2" fill={c}
        transform={`rotate(${r},${x+3},${y+5})`}/>
    ))}
    {/* Brazo derecho levantado */}
    <g transform="translate(87,98) rotate(-75)">
      <rect x="-7" y="0" width="14" height="30" rx="7" fill={C.jacket} stroke={C.ol} strokeWidth="1.2"/>
      <ellipse cx="0" cy="32" rx="8" ry="7" fill={C.skin} stroke={C.ol} strokeWidth="1.2"/>
    </g>
    <Brazo cx={34} cy={110} rot={5}/>
    <Torso cx={60} cy={110}/>
    <Piernas cx={60} cy={154} spread={3}/>
    <Head cx={60} cy={66}><EF/><MB/></Head>
  </svg>;
}

function PoseCansado() {
  return <svg viewBox="0 0 120 185" width="95" height="148">
    {/* Vapor */}
    <path d="M50,98 Q46,88 50,78" stroke="#bbb" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.8"/>
    <path d="M57,96 Q53,84 57,72" stroke="#bbb" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.55"/>
    <path d="M44,100 Q40,92 44,84" stroke="#bbb" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.4"/>
    {/* Taza */}
    <rect x="33" y="126" width="30" height="24" rx="6" fill="#777" stroke="#555" strokeWidth="1.5"/>
    <path d="M63,132 Q74,132 74,143 Q74,154 63,154" stroke="#555" strokeWidth="2.5" fill="none"/>
    <rect x="35" y="128" width="26" height="6" rx="3" fill="#999"/>
    {/* Brazos */}
    <g transform="translate(36,118) rotate(45)">
      <rect x="-6" y="-4" width="13" height="22" rx="6" fill={C.jacket} stroke={C.ol} strokeWidth="1.2"/>
    </g>
    <g transform="translate(78,120) rotate(-35)">
      <rect x="-6" y="-4" width="13" height="22" rx="6" fill={C.jacket} stroke={C.ol} strokeWidth="1.2"/>
    </g>
    <Torso cx={60} cy={108}/>
    <Piernas cx={60} cy={152}/>
    <Head cx={60} cy={66}><EE/><ML/></Head>
  </svg>;
}

function PoseDuerme() {
  return <svg viewBox="0 0 150 150" width="120" height="115">
    {/* Zzz */}
    <text x="96"  y="30" fill={C.skinLight} fontSize="14" fontWeight="bold" fontFamily="Arial" opacity="0.9">z</text>
    <text x="110" y="18" fill={C.skinLight} fontSize="18" fontWeight="bold" fontFamily="Arial" opacity="0.7">z</text>
    <text x="126" y="6"  fill={C.skinLight} fontSize="22" fontWeight="bold" fontFamily="Arial" opacity="0.5">Z</text>
    {/* Cuerpo acurrucado */}
    <g transform="translate(16,48)">
      <ellipse cx="40" cy="72" rx="42" ry="30" fill={C.jacket} stroke={C.ol} strokeWidth="1.5"/>
      <ellipse cx="14" cy="62" rx="11" ry="18" fill={C.jacket} stroke={C.ol} strokeWidth="1.2"/>
      <ellipse cx="66" cy="74" rx="11" ry="16" fill={C.jacket} stroke={C.ol} strokeWidth="1.2"/>
      <ellipse cx="22" cy="90" rx="16" ry="11" fill={C.skin} stroke={C.ol} strokeWidth="1.2"/>
      <ellipse cx="56" cy="94" rx="16" ry="10" fill={C.skin} stroke={C.ol} strokeWidth="1.2"/>
      <ellipse cx="8"  cy="97" rx="11" ry="5"  fill={C.shoe} stroke={C.ol} strokeWidth="1"/>
      <ellipse cx="68" cy="100" rx="11" ry="5" fill={C.shoe} stroke={C.ol} strokeWidth="1"/>
      {/* Cabeza apoyada */}
      <circle cx="40" cy="40" r="28" fill={C.skin} stroke={C.ol} strokeWidth="1.5"/>
      <ellipse cx="30" cy="26" rx="7" ry="5" fill={C.skinLight} opacity="0.4" transform="rotate(-20,30,26)"/>
      {/* Llamas acostadas */}
      <path d="M26,14 C22,4 19,0 26,-8 C32,0 30,4 26,14Z"  fill={C.skin}      stroke={C.ol} strokeWidth="1"/>
      <path d="M40,10 C40,-1 37,-7 40,-14 C43,-7 40,-1 40,10Z" fill={C.skinLight} stroke={C.ol} strokeWidth="1"/>
      <path d="M54,14 C58,4 61,0 54,-8 C48,0 50,4 54,14Z"  fill={C.skin}      stroke={C.ol} strokeWidth="1"/>
      <EC/>
      <path d="M30,54 Q40,60 50,54" stroke={C.mouth} strokeWidth="1.8" fill="none" strokeLinecap="round"/>
    </g>
  </svg>;
}

// ─── MAPA ────────────────────────────────────────────────────────────────────
const POSES = { idle:PoseIdle, hablando:PoseHablando, pensando:PosePensando,
  escribiendo:PoseEscribiendo, ok:PoseOk, sorprendido:PoseSorprendido,
  feliz:PoseFeliz, cansado:PoseCansado, duerme:PoseDuerme };

const STATE_POSE = { idle:'idle', thinking:'pensando', talking:'hablando', reacting:'sorprendido' };

const BUBBLES = {
  idle:        ['👾','...','¿Todo bien?','Acá estoy.','¿Qué hacemos?'],
  pensando:    ['Hmm...','Déjame pensar.','Analizando...','🧠','Un momento...'],
  hablando:    ['Mirá esto:','Acá va:','¿Ves?','Dale...'],
  sorprendido: ['¡Uh!','¿En serio?','Ya veo.','👀','¡Recibido!'],
};

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────
export default function Mascota({ state='idle', surface='#0a1929', border='#1e2d3d' }) {
  const [pos, setPos]       = useState({ x: window.innerWidth - 130, y: window.innerHeight - 210 });
  const [dragging, setDragging] = useState(false);
  const [bubble, setBubble] = useState('');
  const [showBubble, setShowBubble] = useState(false);
  const dragOff   = useRef({ x:0, y:0 });
  const bTimer    = useRef(null);
  const prevPose  = useRef('idle');

  const pose = STATE_POSE[state] || 'idle';
  const PoseComp = POSES[pose] || PoseIdle;

  // Burbuja al cambiar estado
  useEffect(() => {
    if (prevPose.current === pose) return;
    prevPose.current = pose;
    const opts = BUBBLES[pose] || BUBBLES.idle;
    setBubble(opts[Math.floor(Math.random() * opts.length)]);
    setShowBubble(true);
    clearTimeout(bTimer.current);
    bTimer.current = setTimeout(() => setShowBubble(false), 2500);
  }, [pose]);

  // Burbuja idle periódica
  useEffect(() => {
    const iv = setInterval(() => {
      if (state !== 'idle') return;
      const opts = BUBBLES.idle;
      setBubble(opts[Math.floor(Math.random() * opts.length)]);
      setShowBubble(true);
      clearTimeout(bTimer.current);
      bTimer.current = setTimeout(() => setShowBubble(false), 2200);
    }, 14000);
    return () => clearInterval(iv);
  }, [state]);

  // Drag mouse
  const onMD = useCallback((e) => {
    e.preventDefault();
    setDragging(true);
    dragOff.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  }, [pos]);

  // Drag touch
  const onTS = useCallback((e) => {
    const t = e.touches[0];
    setDragging(true);
    dragOff.current = { x: t.clientX - pos.x, y: t.clientY - pos.y };
  }, [pos]);

  useEffect(() => {
    if (!dragging) return;
    const mv = (e) => {
      const { clientX, clientY } = e.touches ? e.touches[0] : e;
      setPos({
        x: Math.min(Math.max(0, clientX - dragOff.current.x), window.innerWidth  - 140),
        y: Math.min(Math.max(0, clientY - dragOff.current.y), window.innerHeight - 180),
      });
    };
    const up = () => setDragging(false);
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup',   up);
    window.addEventListener('touchmove', mv, { passive:true });
    window.addEventListener('touchend',  up);
    return () => {
      window.removeEventListener('mousemove', mv);
      window.removeEventListener('mouseup',   up);
      window.removeEventListener('touchmove', mv);
      window.removeEventListener('touchend',  up);
    };
  }, [dragging]);

  const animMap = {
    idle:        'msc-float 3.5s ease-in-out infinite',
    pensando:    'msc-think 2s ease-in-out infinite',
    hablando:    'msc-talk 0.9s ease-in-out infinite',
    sorprendido: 'msc-react 0.6s ease-out 1',
    escribiendo: 'msc-write 1.5s ease-in-out infinite',
    ok:          'msc-float 3.5s ease-in-out infinite',
    feliz:       'msc-bounce 0.7s ease-in-out infinite',
    cansado:     'msc-float 6s ease-in-out infinite',
    duerme:      'none',
  };

  return (<>
    <style>{`
      @keyframes msc-float  {0%,100%{transform:translateY(0)}         50%{transform:translateY(-9px)}}
      @keyframes msc-think  {0%,100%{transform:translateY(0) rotate(-2.5deg)} 50%{transform:translateY(-5px) rotate(2.5deg)}}
      @keyframes msc-talk   {0%,100%{transform:translateY(0) scale(1)}  50%{transform:translateY(-6px) scale(1.04)}}
      @keyframes msc-react  {0%{transform:scale(1) rotate(0)} 25%{transform:scale(1.18) rotate(-6deg)} 60%{transform:scale(0.94) rotate(4deg)} 100%{transform:scale(1) rotate(0)}}
      @keyframes msc-write  {0%,100%{transform:translateX(0)} 50%{transform:translateX(4px)}}
      @keyframes msc-bounce {0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-14px) scale(1.06)}}
      @keyframes msc-bbl    {from{opacity:0;transform:scale(0.75)} to{opacity:1;transform:scale(1)}}
    `}</style>
    <div
      onMouseDown={onMD}
      onTouchStart={onTS}
      style={{
        position:'fixed', left:pos.x, top:pos.y, zIndex:9999,
        cursor: dragging ? 'grabbing' : 'grab',
        userSelect:'none', touchAction:'none',
        display:'flex', flexDirection:'column', alignItems:'center', gap:'4px',
      }}
    >
      {showBubble && bubble && (
        <div style={{
          background:surface, border:`1px solid ${border}`,
          borderRadius:'10px 10px 10px 4px', padding:'5px 11px',
          fontSize:'11px', color:'#ccc', fontFamily:"'IBM Plex Mono',monospace",
          whiteSpace:'nowrap', boxShadow:'0 4px 18px rgba(0,0,0,0.45)',
          pointerEvents:'none', animation:'msc-bbl 0.22s ease',
        }}>
          {bubble}
        </div>
      )}
      <div style={{
        animation: animMap[pose] || animMap.idle,
        filter:'drop-shadow(0 8px 18px rgba(61,191,184,0.28))',
      }}>
        <PoseComp/>
      </div>
    </div>
  </>);
}
