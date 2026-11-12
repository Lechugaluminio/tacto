'use strict';
// =====================================================================
//  MARTE · telemanipulación cooperativa
//  Varios teléfonos (por MQTT, vía tacto.js) mueven UN solo brazo robótico.
//  El brazo obedece al PROMEDIO de los operadores; el DESACUERDO entre ellos
//  es la "interferencia": los servos se pelean, la imagen se rompe, suena la fricción.
//
//  1. RECURSOS   sonidos e imagen (archivos de uso libre en assets/; si faltan, se sintetizan)
//  2. AUDIO      motor Web Audio: bucles continuos + golpes
//  3. OPERADORES lectura de cada teléfono → órdenes (alcance, giro, pinza, fuerza)
//  4. MUNDO      brazo, rocas, caja de muestras, reglas de agarre
//  5. CÁMARA     imagen de la cámara del brazo: pocos cuadros por segundo, ruido, cortes
//  6. HUD        retículas de cada operador, telemetría, polvo del lente (en tiempo real)
// =====================================================================
const $ = s => document.querySelector(s);
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const suave = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const DEG = Math.PI / 180;

// ============================ 1. RECURSOS =============================
// Cada sonido busca assets/sonidos/<archivo>.(mp3|wav|ogg). Si no existe, usa su versión sintetizada.
// "recorte": para golpes; busca el instante más fuerte del archivo y toma esos segundos.
// Fuentes y licencias: README.md, sección 3.3
const SONIDOS = [
  { id: 'viento',   archivo: 'viento-marte', loop: true,  synth: 'viento' },   // NASA · Perseverance, viento en Jezero
  { id: 'friccion', archivo: 'rover-ruedas', loop: true,  synth: 'friccion' }, // NASA · Perseverance, ruedas de metal sobre roca
  { id: 'hidraulico', archivo: 'brazo-hidraulico', loop: true, synth: 'hidraulico' }, // brazo: pistón hidráulico (presión, bombeo y fluido)
  { id: 'servo',    archivo: 'servo',        loop: true,  synth: 'servo' },      // garra: servo eléctrico al abrir y cerrar
  { id: 'estatica', archivo: 'estatica',     loop: true,  synth: 'estatica' },
  { id: 'grava',    archivo: 'grava',        loop: true,  synth: 'grava' },
  { id: 'arrastre', archivo: 'arrastre',     loop: true,  synth: 'arrastre' },
  { id: 'clack',    archivo: 'clack',    recorte: 0.6, synth: 'clack' },
  { id: 'metal',    archivo: 'metal',    recorte: 1.2, synth: 'metal' },
  { id: 'orugas',   archivo: 'rover-ruedas', loop: true, synth: 'orugas' },           // avanzar: la sonda rueda sobre la grava
  { id: 'canasto',  archivo: 'canasto',           recorte: 0.6, synth: 'canasto' },     // la roca cae dentro del canasto
  { id: 'suelo',    archivo: 'roca-suelo',        recorte: 1.2, synth: 'suelo' },       // roca pequeña que cae al suelo
  { id: 'sueloG',   archivo: 'roca-suelo-grande', recorte: 1.4, synth: 'sueloG' },      // roca grande que cae al suelo
  { id: 'alarma',   archivo: 'alarma',   recorte: 1.0, synth: 'alarma' },
  { id: 'aire',     archivo: 'aire',     recorte: 1.6, synth: 'aire' },
  { id: 'ping',     archivo: 'ping',     recorte: 1.0, synth: 'ping' },
];
const EXT = ['mp3', 'wav', 'ogg'];
const IMAGEN = 'assets/img/suelo.jpg'; // NASA/JPL-Caltech · Hazcam de Perseverance (dominio público)
// Rocas: PNG con fondo transparente que se superponen a la imagen de Marte.
// Reemplázalos por recortes propios (por ejemplo de fotos de la NASA) con los mismos nombres.
const ROCAS_PNG = { grande: ['grande-1', 'grande-2', 'grande-3'], pequena: ['pequena-1', 'pequena-2', 'pequena-3', 'pequena-4'] };
const SPRITES = { grande: [], pequena: [] };
for (const k in ROCAS_PNG) ROCAS_PNG[k].forEach((n, i) => { const im = new Image(); im.onload = () => { SPRITES[k][i] = im; }; im.src = `assets/img/rocas/${n}.png`; });

// ============================ 2. AUDIO ================================
const AU = { ctx: null, buf: {}, origen: {}, loops: {}, listo: false };

function mkBuf(c, seg, fn, bucle = false) { // genera un buffer mono muestra a muestra
  const sr = c.sampleRate, n = Math.floor(seg * sr), b = c.createBuffer(1, n, sr), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = fn(i / sr, i);
  if (bucle) { const x = Math.floor(0.04 * sr); for (let i = 0; i < x; i++) { const t = i / x; d[i] = d[i] * t + d[n - x + i] * (1 - t); } } // cruce suave para que el bucle no haga clic
  let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i]));
  if (pk > 0) for (let i = 0; i < n; i++) d[i] *= 0.9 / pk;
  return b;
}
const ruido = () => Math.random() * 2 - 1;
const SYNTH = { // respaldo: sonidos propios hechos con código, por si falta el archivo
  viento: c => { let b = 0, l = 0; return mkBuf(c, 6, t => { b = (b + 0.02 * ruido()) / 1.02; l += (b - l) * 0.04; return l * (0.55 + 0.45 * Math.sin(t * Math.PI / 3) * Math.sin(t * Math.PI)); }, true); },
  friccion: c => { let l = 0, sq = 0, sf = 2800, k = 0; return mkBuf(c, 4, t => {
    l += (ruido() - l) * 0.08; if (Math.random() < 0.0004) { sq = 1; sf = rnd(1900, 3600); } sq *= 0.99985;
    if (Math.random() < 0.002) k = 1; k *= 0.96;
    return l * 0.6 + Math.sin(2 * Math.PI * sf * t + Math.sin(t * 40) * 3) * sq * 0.35 + ruido() * k * 0.8; }, true); },
  servo: c => mkBuf(c, 2, t => { const s1 = 2 * ((t * 150) % 1) - 1, s2 = 2 * ((t * 300) % 1) - 1; return (0.4 * s1 + 0.2 * s2) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 45 * t)) + ruido() * 0.06; }, true),
  hidraulico: c => { let l = 0, h = 0, b = 0; return mkBuf(c, 3, t => { // bomba grave que late + silbido de fluido a presión + crujido de émbolo
    l += (ruido() - l) * 0.02; h += (ruido() - h) * 0.6; b = (b + 0.02 * ruido()) / 1.02;
    const pulso = 0.55 + 0.45 * Math.pow(Math.abs(Math.sin(Math.PI * 5 * t)), 3);
    return Math.sin(2 * Math.PI * 48 * t) * 0.35 * pulso + Math.sin(2 * Math.PI * 96 * t) * 0.12 * pulso + l * 1.6 * pulso + h * 0.18 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.6667 * t)) + b * 2; }, true); },
  estatica: c => mkBuf(c, 2, () => ruido() * 0.35 + (Math.random() < 0.0006 ? ruido() : 0), true),
  grava: c => { let e = 0, l = 0; return mkBuf(c, 2, () => { if (Math.random() < 0.004) e = rnd(0.4, 1); e *= 0.993; l += (ruido() - l) * 0.5; return l * e; }, true); },
  arrastre: c => { let l = 0, m = 0; return mkBuf(c, 2, t => { l += (ruido() - l) * 0.05; m += (Math.random() - m) * 0.002; return l * (0.4 + Math.abs(Math.sin(2 * Math.PI * 7 * t)) * 0.6) * (0.5 + m); }, true); },
  clack: c => mkBuf(c, 0.5, t => Math.sin(2 * Math.PI * (110 - 60 * t) * t) * Math.exp(-t * 16) + ruido() * Math.exp(-t * 90) * 0.7 + Math.sin(2 * Math.PI * 1830 * t) * Math.exp(-t * 28) * 0.25),
  metal: c => mkBuf(c, 1.2, t => [420, 1131, 1873, 2951].reduce((s, f, i) => s + Math.sin(2 * Math.PI * f * t) * Math.exp(-t * (3 + i * 2)) / (i + 1), 0) + ruido() * Math.exp(-t * 60) * 0.5),
  fractura: c => { let l = 0, k = 0; return mkBuf(c, 1.4, t => { l += (ruido() - l) * 0.3; if (t < 0.5 && Math.random() < 0.004) k = 1; k *= 0.97; return l * Math.exp(-t * 5) + ruido() * k * 0.9; }); },
  alarma: c => mkBuf(c, 0.6, t => ((t < 0.15 || (t > 0.25 && t < 0.4)) ? Math.sign(Math.sin(2 * Math.PI * 880 * t)) * 0.4 : 0)),
  aire: c => { let l = 0; return mkBuf(c, 1.4, t => { l += (ruido() - l) * 0.35; return l * Math.sin(Math.PI * t / 1.4); }); },
  orugas: c => { let l = 0, g = 0, k = 0; return mkBuf(c, 4, t => { // eslabones metálicos a ritmo constante + grava + motor
    l += (ruido() - l) * 0.1; if (Math.random() < 0.004) g = rnd(0.4, 1); g *= 0.992;
    const fase = (t * 9) % 1; if (fase < 0.004) k = 1; k *= 0.985;
    return Math.sin(2 * Math.PI * 1650 * t) * k * 0.25 + ruido() * k * 0.5 + l * g * 0.8 + Math.sin(2 * Math.PI * 62 * t) * 0.25 + l * 0.15; }, true); },
  canasto: c => { let l = 0, k = 0; return mkBuf(c, 0.6, t => { l += (ruido() - l) * 0.15; if (t > 0.03 && t < 0.35 && Math.random() < 0.003) k = 1; k *= 0.94; return Math.sin(2 * Math.PI * (95 - 40 * t) * t) * Math.exp(-t * 14) + l * Math.exp(-t * 9) * 0.6 + ruido() * k * 0.35; }); },
  suelo: c => { let l = 0, k = 0; return mkBuf(c, 0.9, t => { l += (ruido() - l) * 0.12; if (t < 0.4 && Math.random() < 0.0025) k = 1; k *= 0.95; return Math.sin(2 * Math.PI * (120 - 70 * t) * t) * Math.exp(-t * 18) * 0.8 + l * Math.exp(-t * 7) * 0.7 + ruido() * k * 0.4; }); },
  sueloG: c => { let l = 0, k = 0; return mkBuf(c, 1.3, t => { l += (ruido() - l) * 0.06; if (t < 0.6 && Math.random() < 0.003) k = 1; k *= 0.96; return Math.sin(2 * Math.PI * (70 - 35 * t) * t) * Math.exp(-t * 7) + l * Math.exp(-t * 4) * 0.8 + ruido() * k * 0.45; }); },
  ping: c => mkBuf(c, 1, t => Math.sin(2 * Math.PI * 1320 * t) * Math.exp(-t * 5) + Math.sin(2 * Math.PI * 2640 * t) * Math.exp(-t * 9) * 0.3),
};
function recortar(b, seg) { // toma `seg` segundos alrededor del golpe más fuerte del archivo
  const c = AU.ctx, sr = b.sampleRate, ch = b.getChannelData(0), w = Math.floor(sr * 0.01);
  let best = 0, at = 0;
  for (let i = 0; i + w < ch.length; i += w) { let e = 0; for (let j = i; j < i + w; j++) e += ch[j] * ch[j]; if (e > best) { best = e; at = i; } }
  const ini = Math.max(0, at - Math.floor(sr * 0.03)), n = Math.min(ch.length - ini, Math.floor(seg * sr));
  const out = c.createBuffer(b.numberOfChannels, n, sr);
  for (let k = 0; k < b.numberOfChannels; k++) {
    const src = b.getChannelData(k), dst = out.getChannelData(k), fo = Math.floor(n * 0.3);
    for (let i = 0; i < n; i++) dst[i] = src[ini + i] * Math.min(1, i / (sr * 0.004)) * (i > n - fo ? (n - i) / fo : 1);
  }
  return out;
}
async function cargarSonido(s) {
  for (const ext of EXT) {
    try {
      const r = await fetch(`assets/sonidos/${s.archivo}.${ext}`, { cache: 'force-cache' }); if (!r.ok) continue;
      const b = await AU.ctx.decodeAudioData(await r.arrayBuffer());
      AU.buf[s.id] = s.recorte ? recortar(b, s.recorte) : b; AU.origen[s.id] = `${s.archivo}.${ext}`; return;
    } catch {}
  }
  AU.buf[s.id] = SYNTH[s.synth](AU.ctx); AU.origen[s.id] = 'sintético';
}
async function iniciarAudio() {
  if (AU.ctx) return AU.ctx.resume();
  const c = (AU.ctx = new (window.AudioContext || window.webkitAudioContext)());
  AU.filtro = c.createBiquadFilter(); AU.filtro.type = 'lowpass'; AU.filtro.frequency.value = 14000; // la señal se degrada con la interferencia
  AU.master = c.createGain(); AU.master.gain.value = 0.9;
  const comp = c.createDynamicsCompressor();
  AU.filtro.connect(AU.master); AU.master.connect(comp); comp.connect(c.destination);
  await Promise.all(SONIDOS.map(cargarSonido));
  for (const s of SONIDOS) if (s.loop) { // bucles: suenan siempre, el volumen los "abre"
    const src = c.createBufferSource(), g = c.createGain(); src.buffer = AU.buf[s.id]; src.loop = true; g.gain.value = 0;
    src.connect(g); g.connect(AU.filtro); src.start(0, Math.random() * AU.buf[s.id].duration); AU.loops[s.id] = { src, g };
  }
  AU.listo = true;
  $('#sonidosInfo').innerHTML = 'Sonidos: ' + SONIDOS.map(s => `${s.id} <i>(${AU.origen[s.id]})</i>`).join(', ');
}
function bucle(id, vol, rate = 1) {
  const l = AU.loops[id]; if (!l) return; const t = AU.ctx.currentTime;
  l.g.gain.setTargetAtTime(vol, t, 0.06); l.src.playbackRate.setTargetAtTime(rate, t, 0.08);
}
function golpe(id, vol = 1, rate = 1) {
  if (!AU.listo || !AU.buf[id]) return; const c = AU.ctx, s = c.createBufferSource(), g = c.createGain();
  s.buffer = AU.buf[id]; s.playbackRate.value = rate; g.gain.value = vol; s.connect(g); g.connect(AU.filtro); s.start();
}

// ============================ 3. OPERADORES ===========================
const tacto = new Tacto();
const ROLES = ['A', 'B']; // máximo dos operadores: brazo y garra
const COLOR = { A: '#ff8a1f', B: '#5b86ff', C: '#c8ff3a', D: '#ffd23a' };
// Con dos o más operadores el robot se reparte: A (y C) mueven el BRAZO, B (y D) manejan la GARRA.
const PARTE_COLOR = { brazo: '#ff8a1f', garra: '#1d2f6f', todo: '' }; // franja naranja del brazo, franja azul marino de la garra
const parteDe = (op, n) => (n < 2 ? 'todo' : op.rol === 'A' ? 'brazo' : 'garra');
const OPS = {}; // id del teléfono -> operador
// los toques del tercer dedo se cuentan al llegar cada mensaje, para no perder toques más cortos que un cuadro
tacto.on('datos', (d, tipo, m) => {
  if (tipo === 'avanzar') { if (OPS[d.id]) avanzar(); return; } // botón AVANZAR del teléfono
  if (tipo === 'intercambiar') { if (OPS[d.id]) intercambiar(); return; } // botón ⇄ del teléfono
  if (tipo !== 'touch') return; const n = m.n || 0;
  if (n >= 3 && (d.nPrev || 0) < 3) d.toques3 = (d.toques3 || 0) + 1;
  d.nPrev = n;
});

function nuevoOp(id, rol) {
  const fijo = id === 'raton' || id === 'eco'; // los simulados no necesitan calibración
  return { id, rol, color: COLOR[rol], b0: fijo ? 0 : null, g0: fijo ? 0 : null, alc: 0.55, giro: 0, pinza: 1, bloq: false, toques: 0, soplo: false, tieneGiro: false, dMin: 1e9, dMax: 0, px: null, py: null, trazo: [] };
}
function enviarRol(op) {
  const c = tacto.client; if (!c || !c.connected || op.id === 'raton' || op.id === 'eco') return;
  c.publish(`tacto/${tacto.sala}/${op.id}/cmd`, JSON.stringify({ rol: op.rol, color: op.color, parte: op.parte || 'todo', colorParte: PARTE_COLOR[op.parte || 'todo'] }));
}
setInterval(() => Object.values(OPS).forEach(enviarRol), 3000); // por si el teléfono se reconecta
// Vibración háptica por evento: cada momento tiene un pulso distinto en la mano (ms de vibración / pausa / vibración…)
const VIBRA = {
  contacto: [18, 45, 18],                 // la garra toca una roca: dos golpecitos leves, como rozar
  bloqueo: [70, 35, 140],                 // tercer dedo bloquea la garra: apriete firme que se sostiene
  libera: [35],                           // la garra se libera: un toque corto
  canasto: [40, 70, 40, 70, 220],         // la roca cae en el canasto: rebote y golpe sordo final
};
function vibrar(ops, patron) {
  const c = tacto.client; if (!c || !c.connected) return;
  for (const o of ops) if (o.id !== 'raton' && o.id !== 'eco') c.publish(`tacto/${tacto.sala}/${o.id}/cmd`, JSON.stringify({ vibrar: patron }));
}

function revisarOps(now) {
  let cambio = false;
  for (const d of Object.values(tacto.devices)) {
    const vivo = d.online && now - d.last < 15000;
    if (vivo && !OPS[d.id]) {
      const rol = ROLES.find(r => !Object.values(OPS).some(o => o.rol === r));
      if (!rol) { if (!d.avisoLleno && tacto.client?.connected) { d.avisoLleno = true; tacto.client.publish(`tacto/${tacto.sala}/${d.id}/cmd`, JSON.stringify({ lleno: true })); } continue; } // sala llena
      d.avisoLleno = false;
      OPS[d.id] = nuevoOp(d.id, rol); OPS[d.id].toques = d.toques3 || 0; enviarRol(OPS[d.id]); golpe('ping', 0.4, 0.8); cambio = true;
      if (Object.keys(OPS).length >= 2) { M.guia = now + 12000; avisar(`OPERADOR ${rol} EN LÍNEA · EL ROBOT SE DIVIDE: BRAZO / GARRA`, COLOR[rol], 3500); }
      else avisar(`OPERADOR ${rol} EN LÍNEA`, COLOR[rol]);
    } else if (!vivo && OPS[d.id]) { avisar(`OPERADOR ${OPS[d.id].rol} PERDIDO`, '#ffb020'); delete OPS[d.id]; cambio = true; }
  }
  for (const id in OPS) if (!tacto.devices[id]) { delete OPS[id]; cambio = true; }
  if (cambio) pintarOps();
}
function pintarOps() {
  $('#ops').innerHTML = ROLES.slice(0, 2).concat(ROLES.slice(2).filter(r => Object.values(OPS).some(o => o.rol === r))).map(r => {
    const o = Object.values(OPS).find(x => x.rol === r), nom = o ? (tacto.devices[o.id]?.name || o.id) : 'vacante';
    return `<div class="op${o ? ' activo' : ''}" style="--col:${COLOR[r]}"><i></i><b>${r}</b> ${nom}</div>`;
  }).join('');
}

// lee el teléfono y lo convierte en órdenes para el brazo
function leerOp(op, dt) {
  const d = tacto.devices[op.id]; if (!d) return; const ch = d.ch, g = k => ch[k];
  const b = g('ang.b'), gm = g('ang.g');
  if (b != null && gm != null) {
    if (op.b0 == null || op.recal) { op.b0 = b; op.g0 = gm; op.recal = false; } // la postura inicial es el "cero"
    op.tieneGiro = true;
    op.alc = clamp(0.575 - 0.425 * clamp((b - op.b0) / 25, -1, 1), 0.15, 1); // inclinar hacia adelante extiende
    op.giro = clamp((gm - op.g0) / 30, -1, 1);                               // inclinar a los lados gira (±80°)
  }
  const n = g('touch.n') || 0;
  if (n >= 2) { // dos dedos: juntarlos cierra (las puntas se cruzan un poco), separarlos abre hasta 180°
    const dist = g('touch.dist'); if (dist != null) op.pinza = -0.15 + 1.15 * clamp((dist - 0.05) / 0.45);
  } // con menos dedos, la garra queda en la última apertura
  while ((d.toques3 || 0) > op.toques) { // cada toque con un tercer dedo bloquea / libera la garra
    op.toques++; op.bloq = !op.bloq; M.tAviso = 0; golpe('clack', 0.45, op.bloq ? 1.4 : 1.1);
  }
  if (op.bloq && !M.carga && op.pinza > 0.55) op.bloq = false; // abrir la garra sin muestra la libera
  const mic = g('mic.level'), graves = g('mic.low');
  op.soplo = !!((d.caps || {}).mic && mic != null && mic > 0.3 && (graves == null || graves > 0.2)); // soplar al micrófono
  if (op.soplo) M.polvo = Math.max(0, M.polvo - dt * 0.9 * clamp((mic - 0.3) / 0.4 + 0.2));
  if (n === 1) { // un dedo rápido limpia el lente
    const x = g('t1.x'), y = g('t1.y');
    if (op.px != null && x != null) {
      const v = Math.hypot(x - op.px, y - op.py) / Math.max(dt, 1 / 120);
      if (v > 1.1) { M.polvo = Math.max(0, M.polvo - (v - 1.1) * dt * 0.22); op.trazo.push({ x, y, t: performance.now() }); }
    }
    op.px = x; op.py = y;
  } else op.px = null;
  op.trazo = op.trazo.filter(p => performance.now() - p.t < 600);
}

// ============================ 4. MUNDO ================================
// Coordenadas del suelo: u lateral (−1..1), v profundidad (0 cerca … 1 lejos). P() las lleva a la imagen.
const FW = 640, FH = 360;
const P = (u, v) => { const s = 1 - 0.55 * v; return { x: FW / 2 + u * FW * 0.47 * s, y: FH * (0.93 - 0.6 * v), s }; };
const GIRO_MAX = 80; // grados a cada lado
const tipDe = (alc, giro) => ({ u: Math.sin(giro * GIRO_MAX * DEG) * alc * 1.05, v: Math.cos(giro * GIRO_MAX * DEG) * alc * 0.95 });
const CAJA = { u: 0.86, v: 0.15, r: 0.15 }; // canasto colgado del costado derecho de la sonda

const M = { // estado del mundo
  brazo: { alc: 0.55, giro: 0, pinza: 1, vel: 0 }, I: 0, Iobj: 0, dev: 0, fuerza: 0, polvo: 0.15,
  avance: null, rocas: [], carga: null, ok: 0, rotas: 0, frag: [], acoplado: false, tensado: false, tAlarma: 0, tSuelta: 0, tAviso: 0, sol: 1214,
  enCanasto: null, despejado: false, guia: 0, bloqueos: 0, balanceo: 0,
};
// Tipos de roca del cráter Jezero y su composición aproximada (estimación ilustrativa, no datos de una muestra real)
const TIPOS = [
  { nombre: 'Basalto', min: [['Piroxeno', 45], ['Plagioclasa', 35], ['Óxidos Fe-Ti', 12], ['Olivino', 8]] },
  { nombre: 'Olivinita (Séítah)', min: [['Olivino', 62], ['Piroxeno', 18], ['Carbonatos', 12], ['Cromita', 8]] },
  { nombre: 'Roca con carbonatos', min: [['Carbonato de Mg', 41], ['Sílice', 27], ['Arcillas', 20], ['Sulfatos', 12]] },
  { nombre: 'Arenisca con sulfatos', min: [['Sulfato de Mg', 38], ['Sílice', 30], ['Óxidos de Fe', 22], ['Percloratos', 10]] },
  { nombre: 'Lutita con hematita', min: [['Arcillas', 46], ['Hematita', 20], ['Fosfato de Fe', 18], ['Sílice', 16]] },
  { nombre: 'Brecha de impacto', min: [['Basalto', 40], ['Hematita', 26], ['Vidrio de impacto', 22], ['Sulfato de Ca', 12]] },
];
// grande: pesada, necesita la fuerza de dos · pequeña: un operador basta
function nuevaRoca(u, v, grande) {
  const r = grande ? rnd(0.1, 0.12) : rnd(0.03, 0.04), w = grande ? rnd(1.15, 1.35) : rnd(0.3, 0.5);
  const forma = Array.from({ length: grande ? 11 : 8 }, () => rnd(grande ? 0.78 : 0.7, grande ? 1.12 : 1.18));
  const t = TIPOS[(Math.random() * TIPOS.length) | 0];
  let comp = t.min.map(([n, p]) => [n, Math.max(2, p + rnd(-5, 5))]); const tot = comp.reduce((a, c) => a + c[1], 0);
  comp = comp.map(([n, p]) => [n, Math.round((p / tot) * 100)]);
  return { u, v, u0: u, v0: v, r, w, necesita: grande ? 2 : 1, pesada: grande, sprite: (Math.random() * 7) | 0, giroImg: rnd(-0.5, 0.5), espejo: Math.random() < 0.5, cierre: grande ? 0.45 : 0.25, forma, tono: grande ? rnd(55, 80) : rnd(85, 120), rot: rnd(0, 6.28),
    id: 'JZ-' + ((1000 + Math.random() * 9000) | 0), tipo: t.nombre, comp, masa: grande ? rnd(2.4, 3.6) : rnd(0.12, 0.45) };
}
function sembrar() {
  M.rocas = []; M.despejado = false;
  const plan = [true, true, true, false, false, false, false, false]; // 3 grandes, 5 pequeñas
  for (const grande of plan) for (let k = 0; k < 300; k++) {
    const a = rnd(-52, 52) * DEG, rr = rnd(0.4, 0.95), u = Math.sin(a) * rr * 1.05, v = Math.cos(a) * rr * 0.95;
    const r0 = grande ? 0.12 : 0.04;
    if (Math.hypot(u - CAJA.u, (v - CAJA.v) * 1.3) < CAJA.r + r0 + 0.08) continue;
    if (M.rocas.every(o => Math.hypot(o.u - u, (o.v - v) * 1.4) > o.r + r0 + 0.07)) { M.rocas.push(nuevaRoca(u, v, grande)); break; }
  }
}
sembrar();

// AVANZAR: la sonda rueda hacia otro punto del cráter. La imagen se oscurece (el HUD sigue), suenan las orugas y aparece un sector nuevo.
const AVANCE = { oscurece: 0.5, siembra: 1.6, aclara: 2.4, fin: 3.1 };
function avanzar() {
  if (M.avance) return;
  if (M.carga) { M.carga = null; } // la muestra que iba en la garra se queda atrás
  Object.values(OPS).forEach(o => { o.bloq = false; });
  M.avance = { t: 0, sembrado: false }; M.despejado = false; golpe('clack', 0.5, 0.7);
  // los dos teléfonos vibran al ritmo de las orugas mientras la sonda rueda (no solo el que apretó AVANZAR)
  const patron = Array.from({ length: 50 }, (_, i) => (i % 2 ? 45 : 70)); // ≈ 2,9 s de pulsos
  const c = tacto.client;
  if (c && c.connected) for (const o of Object.values(OPS)) if (o.id !== 'raton' && o.id !== 'eco') c.publish(`tacto/${tacto.sala}/${o.id}/cmd`, JSON.stringify({ vibrar: patron, avanzando: AVANCE.fin }));
}
// INTERCAMBIAR: los dos jugadores se pasan el brazo y la garra (A ⇄ B). Cada teléfono cambia de color y de instrucciones.
function intercambiar() {
  const ops = Object.values(OPS); if (ops.length < 2) return;
  if (M.carga) { avisar('SUELTEN LA ROCA PARA INTERCAMBIAR', '#ffb020'); return; }
  const [a, b] = ops; [a.rol, b.rol] = [b.rol, a.rol]; a.color = COLOR[a.rol]; b.color = COLOR[b.rol];
  ops.forEach(o => { o.bloq = false; o.parte = null; }); // la próxima vuelta reasigna partes y avisa a los teléfonos
  M.guia = performance.now() + 6000; pintarOps(); golpe('clack', 0.7, 0.9); vibrar(ops, [50, 50, 50, 50, 50]);
  avisar('ROLES INTERCAMBIADOS · BRAZO ⇄ GARRA', '#ffffff', 2200);
}
function avisar(txt, color = '#e9e4d8', ms = 1600) {
  const el = $('#aviso'); el.textContent = txt; el.style.color = color; el.classList.add('on');
  clearTimeout(avisar.t); avisar.t = setTimeout(() => el.classList.remove('on'), ms);
}
function avisoLento(txt, color) { const now = performance.now(); if (now - M.tAviso > 2200) { M.tAviso = now; avisar(txt, color, 1200); } }

function paso(dt, now) {
  revisarOps(now);
  const ops = Object.values(OPS);
  ops.forEach(o => leerOp(o, dt));
  for (const o of ops) { const pt = parteDe(o, ops.length); if (pt !== o.parte) { o.parte = pt; enviarRol(o); } } // el teléfono se pinta del color de su parte
  const dos = ops.length >= 2, deBrazo = ops.filter(o => o.parte !== 'garra'), deGarra = ops.filter(o => o.parte !== 'brazo');
  if (dos) ops.forEach(o => { if (o.parte === 'brazo') o.bloq = false; }); // el bloqueo es de quien maneja la garra

  // órdenes y desacuerdo: la mira del brazo y la mira de la garra deben coincidir
  const conGiro = ops.filter(o => o.tieneGiro), B = M.brazo, giroBrazo = deBrazo.filter(o => o.tieneGiro);
  const media = (l, k) => l.reduce((s, o) => s + o[k], 0) / l.length;
  const desv = (l, k, rango) => { if (l.length < 2) return 0; const m = media(l, k); return l.reduce((s, o) => s + Math.abs(o[k] - m), 0) / l.length / rango; };
  const T = {
    alc: giroBrazo.length ? media(giroBrazo, 'alc') : conGiro.length ? media(conGiro, 'alc') : B.alc,
    giro: giroBrazo.length ? media(giroBrazo, 'giro') : conGiro.length ? media(conGiro, 'giro') : B.giro,
    pinza: deGarra.length ? media(deGarra, 'pinza') : B.pinza,
  };
  M.dev = Math.max(desv(conGiro, 'alc', 0.85), desv(conGiro, 'giro', 2));
  M.Iobj = ops.length >= 2 ? suave(0.03, 0.2, M.dev) : 0;
  M.I += (M.Iobj - M.I) * Math.min(1, dt * (M.Iobj > M.I ? 8 : 3));
  M.bloqueos = deGarra.filter(o => o.bloq).length;
  for (const o of ops) { if (o.bloq !== !!o.bloqPrev) vibrar([o], o.bloq ? VIBRA.bloqueo : VIBRA.libera); o.bloqPrev = o.bloq; } // quien bloquea lo siente
  M.garraResponde = !dos || M.I < 0.45; // sin acople, la garra no obedece
  if (B.pinza < -0.08 && !M.cruzada && !M.carga) golpe('metal', 0.3, 1.3); M.cruzada = B.pinza < -0.08;

  // el brazo sigue la orden; con interferencia, los servos se pelean y avanza a tirones
  const k = Math.min(1, dt * 3.2 * (1 - 0.85 * M.I)), antes = { ...B };
  B.alc += (T.alc - B.alc) * k; B.giro += (T.giro - B.giro) * k; if (M.garraResponde) B.pinza += (T.pinza - B.pinza) * Math.min(1, dt * 5 * (1 - 0.7 * M.I));
  B.vel = (Math.abs(B.alc - antes.alc) + Math.abs(B.giro - antes.giro) * 0.7 + Math.abs(B.pinza - antes.pinza) * 0.5) / dt;
  B.velBrazo = (Math.abs(B.alc - antes.alc) + Math.abs(B.giro - antes.giro) * 0.7) / dt; // solo el brazo (hidráulico)
  B.velGarra = Math.abs(B.pinza - antes.pinza) / dt;                                      // solo la garra (servo)
  const pide = Math.abs(T.alc - B.alc) + Math.abs(T.giro - B.giro) * 0.7;

  // acople: el instante en que todos se ponen de acuerdo
  if (ops.length >= 2) {
    if (M.I > 0.35) M.tensado = true;
    if (M.I < 0.08 && M.tensado && !M.acoplado) { M.acoplado = true; M.tensado = false; golpe('clack', 0.9); golpe('ping', 0.5); avisar('ACOPLE · LA GARRA RESPONDE', '#ffffff'); }
    if (M.I > 0.4) M.tDesfase = (M.tDesfase || 0) + dt; else M.tDesfase = 0;
    if (M.I > 0.25) M.acoplado = false;
    if (M.I > 0.55 && now - M.tAlarma > 900) { M.tAlarma = now; golpe('alarma', 0.35); }
  } else { M.acoplado = false; M.tensado = false; }

  // polvo: se acumula solo, más rápido cuando el brazo se sacude
  M.polvo = clamp(M.polvo + dt * 0.005 * (1 + 3 * M.I));

  // agarre
  const tip = tipDe(B.alc, B.giro);
  let contacto = null, dmin = 1e9;
  if (!M.carga) for (const r of M.rocas) { const d = Math.hypot(r.u - tip.u, (r.v - tip.v) * 1.3); if (d < r.r * 1.4 && d < dmin) { dmin = d; contacto = r; } }
  M.contacto = contacto;
  if (contacto && contacto !== M.contactoPrev && now - (M.tVibraContacto || 0) > 500) { M.tVibraContacto = now; vibrar(deGarra, VIBRA.contacto); } // la garra toca una roca
  M.contactoPrev = contacto;
  let gGrava = 0, gArrastre = 0;
  if (contacto) {
    gGrava = 0.25 + 0.75 * clamp(B.vel * 2 + M.bloqueos * 0.3);
    if (B.pinza < contacto.cierre) { // la garra rodea la roca
      const lock = M.bloqueos > 0, grande = contacto.pesada;
      if (grande && !dos) { if (lock) avisoLento('FUERZA INSUFICIENTE · ROCA GRANDE: FALTA UN OPERADOR', '#ffb020'); else avisoLento('TOCA CON UN TERCER DEDO PARA BLOQUEAR LA GARRA', '#ffb020'); }
      else if (lock && M.I < (grande ? 0.25 : 0.45)) { M.carga = contacto; M.rocas = M.rocas.filter(r => r !== contacto); golpe('clack', 1, 0.85); avisar('MUESTRA SUJETA · LLÉVALA AL CANASTO'); }
      else if (lock) avisoLento(grande ? 'ROCA GRANDE · EL BRAZO Y LA GARRA DEBEN IR ACOPLADOS' : 'SIN ACOPLE · LA GARRA NO RESPONDE', '#ffb020');
      else avisoLento(dos ? 'GARRA: TOCA CON UN TERCER DEDO PARA BLOQUEAR' : 'TOCA CON UN TERCER DEDO PARA BLOQUEAR LA GARRA', '#ffb020');
    }
  }
  if (M.carga) {
    const r = M.carga; r.u = tip.u; r.v = tip.v;
    gArrastre = clamp(B.vel * 2.5) * 0.9;
    const soltar = () => { M.carga = null; ops.forEach(o => { o.bloq = false; }); };
    if (B.pinza > 0.55) { // separar los dedos abre la garra y suelta la roca
      soltar();
      if (Math.hypot(tip.u - CAJA.u, (tip.v - CAJA.v) * 1.2) < CAJA.r + r.r * 0.5) {
        M.ok++; M.enCanasto = { roca: r, t: 0 }; M.balanceo = 1; setTimeout(() => vibrar(Object.values(OPS), VIBRA.canasto), 180); setTimeout(() => golpe('canasto', 1, r.pesada ? 0.75 : 1.1), 180); setTimeout(() => golpe('aire', 0.6), 650); setTimeout(() => golpe('ping', 0.6, 1.2), 900); // los dos teléfonos sienten la roca caer
        setTimeout(() => mostrarFicha(r), 700); avisar('MUESTRA ASEGURADA', '#7dff9a', 2000);
      } else { r.u = r.u0; r.v = r.v0; M.rocas.push(r); golpe(r.pesada ? 'sueloG' : 'suelo', 1); avisar('ROCA SOLTADA FUERA DEL CANASTO · VUELVE A SU LUGAR', '#ffb020', 2200); } // abrir antes del canasto: vuelve a su sitio
    } else if (M.bloqueos < 1 || (r.pesada && !dos)) { // la garra se desbloqueó, o se fue el segundo operador con una roca grande
      M.tSuelta += dt; if (M.tSuelta > 0.3) { r.u = r.u0; r.v = r.v0; M.rocas.push(r); soltar(); M.tSuelta = 0; golpe(r.pesada ? 'sueloG' : 'suelo', 1); avisar('SE SOLTÓ · VUELVE A SU LUGAR', '#ffb020'); }
    } else M.tSuelta = 0;
  }
  if (M.avance) { // avance de la sonda
    const a = M.avance; a.t += dt;
    if (a.t > AVANCE.siembra && !a.sembrado) { a.sembrado = true; M.sol++; sembrar(); }
    if (a.t > AVANCE.fin) { M.avance = null; avisar(`NUEVO SECTOR · SOL ${M.sol}`, '#ffffff', 2000); }
  }
  if (!M.rocas.length && !M.carga && !M.despejado && !M.avance) { // campo vacío: invitar a avanzar
    M.despejado = true; const sol0 = M.sol;
    setTimeout(() => { if (M.despejado) avisar('SECTOR DESPEJADO · PULSEN AVANZAR EN EL TELÉFONO', '#7dff9a', 5000); }, 2500);
    setTimeout(() => { if (M.despejado && M.sol === sol0 && !M.rocas.length) avanzar(); }, 20000); // si nadie avanza, la sonda sigue sola
  }
  if (M.enCanasto && (M.enCanasto.t += dt) > 1.6) M.enCanasto = null; // la roca se hunde en el canasto y desaparece
  M.balanceo *= Math.pow(0.25, dt); // el canasto se mece al recibir la roca
  M.frag = M.frag.filter(f => (f.t -= dt) > 0);
  M.frag.forEach(f => { f.u += f.du * dt; f.v += f.dv * dt; f.du *= 0.9; f.dv *= 0.9; });

  // sonido
  if (AU.listo) {
    const hay = ops.length > 0;
    const os = oscuroAvance();
    bucle('viento', 0.32);
    bucle('orugas', os * 0.95, 1);
    bucle('hidraulico', clamp(B.velBrazo * 2.6) * 0.85, 0.88 + clamp(B.velBrazo * 2) * 0.22 - (M.carga ? 0.08 : 0)); // brazo: el pistón cambia poco de tono, empuja
    bucle('servo', clamp(B.velGarra * 1.4) * 0.6, 0.85 + clamp(B.velGarra) * 0.5);                                  // garra: zumbido eléctrico que sube al moverse rápido
    if (M.velPrev > 0.25 && B.velBrazo < 0.04 && now - (M.tPurga || 0) > 1200) { M.tPurga = now; golpe('aire', 0.22, 1.5); } // al detenerse el brazo, purga de presión
    M.velPrev = B.velBrazo * 0.3 + (M.velPrev || 0) * 0.7;
    bucle('friccion', hay ? M.I * (0.35 + 0.65 * clamp(pide * 4)) * 0.9 : 0, 0.9 + M.I * 0.2);
    bucle('estatica', 0.03 + 0.5 * M.I + 0.25 * M.polvo);
    bucle('grava', Math.max(gGrava * 0.8, os * 0.5), 0.8 + clamp(B.vel) * 0.4);
    bucle('arrastre', gArrastre, 0.9);
    AU.filtro.frequency.setTargetAtTime(lerp(14000, 1600, M.I * 0.85), AU.ctx.currentTime, 0.1);
  }
}

// ============================ 5. CÁMARA ===============================
const feed = $('#feed'); feed.width = FW; feed.height = FH; const fx = feed.getContext('2d');
const lienzo = document.createElement('canvas'); lienzo.width = FW; lienzo.height = FH; const lx = lienzo.getContext('2d', { willReadFrequently: true });
const fondo = document.createElement('canvas'); fondo.width = FW; fondo.height = FH; const bx = fondo.getContext('2d');
let fondoFoto = false;

function fondoGenerado() { // suelo marciano sintético, por si falta la foto
  const g = bx.createLinearGradient(0, 0, 0, FH); g.addColorStop(0, '#5a4f45'); g.addColorStop(0.2, '#6d5f52'); g.addColorStop(1, '#8a7a68');
  bx.fillStyle = g; bx.fillRect(0, 0, FW, FH);
  bx.fillStyle = '#a69888'; bx.fillRect(0, 0, FW, FH * 0.17); // cielo
  for (let i = 0; i < 2600; i++) {
    const y = FH * 0.17 + Math.pow(Math.random(), 0.7) * FH * 0.83, s = (y / FH) * 3.2 * rnd(0.3, 1);
    bx.fillStyle = `rgba(${rnd(20, 60) | 0},${rnd(18, 50) | 0},${rnd(15, 40) | 0},${rnd(0.15, 0.5)})`;
    bx.beginPath(); bx.ellipse(rnd(0, FW), y, s * 1.5, s * 0.8, 0, 0, 7); bx.fill();
  }
}
fondoGenerado();
const foto = new Image();
foto.onload = () => { const sa = foto.width / foto.height, wa = FW / FH; let w = FW, h = FH; if (sa > wa) w = FH * sa; else h = FW / sa; bx.drawImage(foto, (FW - w) / 2, (FH - h) / 2, w, h); fondoFoto = true; };
foto.src = IMAGEN;

function dibujarRoca(c, r, u, v, escala = 1, enPantalla = null) { // enPantalla: {x, y, s} para dibujarla en un punto de la imagen
  const p = enPantalla || P(u, v), R = r.r * FW * 0.47 * p.s * escala;
  c.fillStyle = 'rgba(0,0,0,.45)'; c.beginPath(); c.ellipse(p.x + R * 0.35, p.y + R * 0.28, R * 1.1, R * 0.5, 0, 0, 7); c.fill(); // sombra
  const lista = SPRITES[r.pesada ? 'grande' : 'pequena'], im = lista.length ? lista[r.sprite % lista.length] : null;
  if (im) { // PNG sobre la foto: algo aplastado por la perspectiva de la cámara
    c.save(); c.translate(p.x, p.y - R * 0.12); c.rotate(r.giroImg); c.scale(r.espejo ? -1 : 1, 0.72);
    c.drawImage(im, -R * 1.2, -R * 1.2, R * 2.4, R * 2.4); c.restore(); return;
  }
  c.beginPath();
  r.forma.forEach((f, i) => { const a = r.rot + (i / r.forma.length) * 6.283, x = p.x + Math.cos(a) * R * f, y = p.y + Math.sin(a) * R * f * 0.62; i ? c.lineTo(x, y) : c.moveTo(x, y); });
  c.closePath();
  const g = c.createLinearGradient(p.x - R, p.y - R, p.x + R, p.y + R); g.addColorStop(0, `rgb(${r.tono + 70},${r.tono + 60},${r.tono + 50})`); g.addColorStop(1, `rgb(${r.tono * 0.5},${r.tono * 0.45},${r.tono * 0.4})`);
  c.fillStyle = g; c.fill(); c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1; c.stroke();
}
function dibujarBrazo(c, tiembla) {
  const B = M.brazo, t = tipDe(B.alc, B.giro), T = P(t.u, t.v);
  T.x += rnd(-1, 1) * tiembla * 14; T.y += rnd(-1, 1) * tiembla * 9;
  const base = { x: FW * 0.5, y: FH * 1.12 }, dx = T.x - base.x, dy = T.y - base.y, L = Math.hypot(dx, dy);
  const E = { x: base.x + dx * 0.5 + (-dy / L) * L * 0.16, y: base.y + dy * 0.5 + (dx / L) * L * 0.16 }; // codo
  const seg = (a, b, w) => {
    c.lineCap = 'round'; c.strokeStyle = '#1a1a1a'; c.lineWidth = w + 4; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    c.strokeStyle = '#cfcac0'; c.lineWidth = w; c.stroke();
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(a.x + 3, a.y); c.lineTo(b.x + 3, b.y); c.stroke(); // cableado
  };
  seg(base, E, 22 * (0.6 + 0.4 * T.s)); seg(E, T, 14 * T.s + 4);
  for (const j of [E, T]) { c.fillStyle = '#2a2a2a'; c.beginPath(); c.arc(j.x, j.y, 9 * T.s + 3, 0, 7); c.fill(); c.fillStyle = '#9d988e'; c.beginPath(); c.arc(j.x, j.y, 5 * T.s + 2, 0, 7); c.fill(); }
  M.geo = { base, E, T: { ...T }, s: T.s, garras: [] };
  const ang = Math.atan2(T.y - E.y, T.x - E.x), largo = 26 * T.s + 8, abre = B.pinza * Math.PI / 2 * 0.97; // pinza: <0 se cruzan las puntas, 1 = 180°
  for (const sg of [-1, 1]) {
    const a = ang + sg * abre, m = { x: T.x + Math.cos(a) * largo * 0.6, y: T.y + Math.sin(a) * largo * 0.6 }, f = { x: m.x + Math.cos(ang - sg * 0.5) * largo * 0.5, y: m.y + Math.sin(ang - sg * 0.5) * largo * 0.5 };
    (M.geo.garras ||= []).push([{ ...T }, m, f]);
    c.lineCap = 'round'; c.strokeStyle = '#141414'; c.lineWidth = 8 * T.s + 3; c.beginPath(); c.moveTo(T.x, T.y); c.lineTo(m.x, m.y); c.lineTo(f.x, f.y); c.stroke();
    c.strokeStyle = '#d8d3c8'; c.lineWidth = 4 * T.s + 1.5; c.stroke();
  }
  if (M.carga) { // la muestra, sujeta entre las puntas de las garras (las pequeñas se agrandan un poco para que se vean)
    const r = M.carga, k = r.pesada ? 0.9 : 1.6, R = r.r * FW * 0.47 * T.s * k, d = largo * 0.55 + R * 0.4;
    dibujarRoca(c, r, 0, 0, k, { x: T.x + Math.cos(ang) * d, y: T.y + Math.sin(ang) * d, s: T.s });
  }
}
function dibujarCanasto(c) { // canasto colgado de un soporte que sale del costado derecho de la sonda
  const p = P(CAJA.u, CAJA.v), w = CAJA.r * FW * 0.47 * p.s, h = w * 0.62, osc = Math.sin(performance.now() / 160) * M.balanceo * 0.12;
  const piv = { x: p.x, y: p.y - w * 1.9 }; // punto de cuelgue
  c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(p.x + w * 0.3, p.y + w * 1.1, w * 0.8, w * 0.18, 0, 0, 7); c.fill(); // sombra lejana en el suelo
  c.fillStyle = '#2b2a27'; c.strokeStyle = '#cfcac0'; c.lineWidth = 2; // viga que sale del borde: el cuerpo de la sonda
  c.beginPath(); c.moveTo(FW + 4, piv.y - 10); c.lineTo(piv.x - 6, piv.y - 6); c.lineTo(piv.x - 6, piv.y + 4); c.lineTo(FW + 4, piv.y + 6); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(FW + 4, piv.y + 6); c.lineTo(FW - 40, piv.y + 34); c.stroke(); // tirante
  for (let k = 0; k < 4; k++) { c.fillStyle = '#9d988e'; c.beginPath(); c.arc(piv.x + 12 + k * 22, piv.y - 2, 1.6, 0, 7); c.fill(); } // remaches
  c.save(); c.translate(piv.x, piv.y); c.rotate(osc); c.translate(-piv.x, -piv.y);
  const top = p.y - h * 0.35;
  c.strokeStyle = '#bdb8ad'; c.lineWidth = 1.3; // cuerdas del canasto
  for (const sx of [-0.85, 0, 0.85]) { c.beginPath(); c.moveTo(piv.x, piv.y + 2); c.lineTo(p.x + sx * w, top + (sx ? 0 : -w * 0.28)); c.stroke(); }
  const borde = () => { c.beginPath(); c.ellipse(p.x, top, w, w * 0.32, 0, 0, 7); };
  borde(); c.fillStyle = '#0d0c0a'; c.fill();
  const e = M.enCanasto; // la roca recién guardada se hunde y desaparece
  if (e) { const k = clamp(e.t / 1.6); c.save(); borde(); c.clip(); c.globalAlpha = 1 - k * 0.8; dibujarRoca(c, e.roca, CAJA.u, CAJA.v + 0.02 - k * 0.06, 0.6 * (1 - k * 0.5)); c.restore(); }
  c.beginPath(); c.moveTo(p.x - w, top); c.lineTo(p.x - w * 0.78, top + h * 1.1); c.ellipse(p.x, top + h * 1.1, w * 0.78, w * 0.22, 0, Math.PI, 0, true); c.lineTo(p.x + w, top); c.ellipse(p.x, top, w, w * 0.32, 0, 0, Math.PI); c.closePath();
  c.fillStyle = '#5c5448'; c.fill(); c.strokeStyle = '#1a1814'; c.lineWidth = 1; c.stroke();
  c.strokeStyle = 'rgba(20,18,14,.7)'; // trenzado
  for (let i = -6; i <= 6; i++) { const x = p.x + (i / 6) * w * 0.9; c.beginPath(); c.moveTo(x, top + w * 0.3 * Math.sqrt(1 - (i / 6.6) ** 2)); c.lineTo(p.x + (i / 6) * w * 0.7, top + h * 1.1 + w * 0.2 * Math.sqrt(1 - (i / 6.6) ** 2)); c.stroke(); }
  for (let j = 1; j <= 3; j++) { const y = top + (h * 1.1 * j) / 4, ww = w * (1 - 0.22 * j / 4); c.beginPath(); c.ellipse(p.x, y, ww, ww * 0.3, 0, 0.05, Math.PI - 0.05); c.stroke(); }
  c.strokeStyle = '#cfcac0'; c.lineWidth = 2; borde(); c.stroke();
  c.restore();
}

let ultimoCuadro = 0, fpsReal = 0;
const oscuroAvance = () => { const a = M.avance; if (!a) return 0; const t = a.t; return t < AVANCE.oscurece ? t / AVANCE.oscurece : t < AVANCE.aclara ? 1 : clamp(1 - (t - AVANCE.aclara) / (AVANCE.fin - AVANCE.aclara)); };
function cuadroCamara(now) {
  const fps = lerp(9, 2, M.I);
  if (now - ultimoCuadro < 1000 / fps) return; // la cámara manda pocos cuadros: el sonido llega antes que la imagen
  fpsReal = 1000 / (now - ultimoCuadro || 1); ultimoCuadro = now;
  if (M.I > 0.6 && Math.random() < (M.I - 0.6) * 0.8) { sinSenal(); return; }
  lx.drawImage(fondo, 0, 0);
  dibujarCanasto(lx);
  [...M.rocas].sort((a, b) => b.v - a.v).forEach(r => dibujarRoca(lx, r, r.u, r.v));
  for (const f of M.frag) { const p = P(f.u, f.v), R = f.s * FW * 0.47 * p.s; lx.fillStyle = `rgb(${f.tono + 40},${f.tono + 30},${f.tono + 20})`; lx.fillRect(p.x - R, p.y - R * 0.6, R * 2, R * 1.2); }
  dibujarBrazo(lx, M.I);
  procesar();
  franjas();
  const os = oscuroAvance(); if (os > 0) { fx.fillStyle = `rgba(0,0,0,${0.88 * os})`; fx.fillRect(0, 0, FW, FH); }
}
function franjas() { // franja naranja en el brazo y azul marino en la garra (en color, sobre la imagen monocroma)
  const G = M.geo; if (!G) return; const k = Math.round(M.I * 7);
  fx.save(); fx.lineCap = 'round'; fx.globalAlpha = 0.92;
  const tramo = () => { fx.beginPath(); fx.moveTo(G.base.x + k, G.base.y); fx.lineTo(G.E.x + k, G.E.y); fx.lineTo(G.T.x + k, G.T.y); fx.stroke(); };
  fx.strokeStyle = '#1a0a02'; fx.lineWidth = 6.5 * (0.6 + 0.4 * G.s); tramo();
  fx.strokeStyle = PARTE_COLOR.brazo; fx.lineWidth = 4 * (0.6 + 0.4 * G.s); tramo();
  fx.strokeStyle = '#2a3f8f'; fx.lineWidth = 2.2 * G.s + 1.2;
  for (const [a, b, c] of G.garras) { fx.beginPath(); fx.moveTo(a.x - k, a.y); fx.lineTo(b.x - k, b.y); fx.lineTo(c.x - k, c.y); fx.stroke(); }
  fx.fillStyle = '#2a3f8f'; fx.beginPath(); fx.arc(G.T.x - k, G.T.y, 4 * G.s + 2, 0, 7); fx.fill(); // muñeca de la garra
  fx.restore();
}
// paleta marciana: sombras óxido oscuro → tierra rojiza → cielo ocre pálido (tabla de 256 tonos)
const MARTE = (() => {
  const paradas = [[0, [26, 8, 4]], [0.35, [112, 42, 18]], [0.62, [190, 98, 52]], [0.85, [232, 160, 108]], [1, [255, 222, 186]]];
  const t = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)];
  for (let v = 0; v < 256; v++) {
    const x = v / 255; let i = 0; while (i < paradas.length - 2 && x > paradas[i + 1][0]) i++;
    const [x0, c0] = paradas[i], [x1, c1] = paradas[i + 1], k = clamp((x - x0) / (x1 - x0));
    for (let c = 0; c < 3; c++) t[c][v] = c0[c] + (c1[c] - c0[c]) * k;
  }
  return t;
})();
function procesar() { // imagen virada al rojo marciano, grano, separación de color y cortes según la interferencia
  const img = lx.getImageData(0, 0, FW, FH), d = img.data, L = new Float32Array(FW * FH), I = M.I;
  const grano = 10 + 50 * I, k = Math.round(I * 7);
  for (let i = 0, j = 0; j < L.length; i += 4, j++) L[j] = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11 - 128) * 1.25 + 128 + (Math.random() - 0.5) * grano;
  const cortes = []; if (I > 0.15) for (let n = 0; n < 1 + I * 4; n++) cortes.push({ y: rnd(0, FH) | 0, h: rnd(3, 6 + 30 * I) | 0, o: (rnd(-1, 1) * I * 46) | 0 });
  for (let y = 0; y < FH; y++) {
    let o = 0; for (const c of cortes) if (y >= c.y && y < c.y + c.h) o = c.o;
    const lin = y % 2 ? 0.88 : 1, fila = y * FW;
    for (let x = 0; x < FW; x++) {
      const i = (fila + x) * 4, xs = clamp(x + o, 0, FW - 1) | 0;
      const r = L[fila + clamp(xs + k, 0, FW - 1)], g = L[fila + xs], b = L[fila + clamp(xs - k, 0, FW - 1)];
      d[i] = MARTE[0][clamp(r, 0, 255) | 0] * lin; d[i + 1] = MARTE[1][clamp(g, 0, 255) | 0] * lin; d[i + 2] = MARTE[2][clamp(b, 0, 255) | 0] * lin;
    }
  }
  fx.putImageData(img, 0, 0);
}
function sinSenal() {
  const img = fx.createImageData(FW, FH), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 90; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  fx.putImageData(img, 0, 0); fx.fillStyle = '#e9e4d8'; fx.font = '700 16px "IBM Plex Mono", monospace'; fx.textAlign = 'center'; fx.fillText('— SIN SEÑAL —', FW / 2, FH / 2);
}

// ============================ 6. HUD ==================================
const hud = $('#hud'), hx = hud.getContext('2d'), visor = $('#visor');
const MOTAS = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: rnd(0.004, 0.03), umbral: Math.random() }));
let esc = 1;
function ajustar() {
  const r = visor.getBoundingClientRect(); let w = r.width, h = w * 9 / 16; if (h > r.height) { h = r.height; w = h * 16 / 9; }
  for (const c of [feed, hud]) { c.style.width = w + 'px'; c.style.height = h + 'px'; }
  const dpr = Math.min(devicePixelRatio || 1, 2); hud.width = Math.round(w * dpr); hud.height = Math.round(h * dpr); esc = hud.width / FW;
}
addEventListener('resize', ajustar); new ResizeObserver(ajustar).observe(visor);

function reticula(x, y, col, tam, txt) {
  hx.strokeStyle = col; hx.lineWidth = 2 * (esc / 2 + 0.5); hx.beginPath();
  hx.moveTo(x - tam, y); hx.lineTo(x - tam * 0.35, y); hx.moveTo(x + tam * 0.35, y); hx.lineTo(x + tam, y);
  hx.moveTo(x, y - tam); hx.lineTo(x, y - tam * 0.35); hx.moveTo(x, y + tam * 0.35); hx.lineTo(x, y + tam); hx.stroke();
  hx.beginPath(); hx.arc(x, y, tam * 0.6, 0, 7); hx.stroke();
  if (txt) { hx.fillStyle = col; hx.font = `500 ${Math.round(11 * esc / 2 + 6)}px "IBM Plex Mono", monospace`; hx.textAlign = 'left'; hx.fillText(txt, x + tam + 4, y - tam * 0.5); }
}
function dibujarHud(now) {
  const W = hud.width, H = hud.height, ops = Object.values(OPS), f = esc;
  hx.clearRect(0, 0, W, H);
  // polvo en el lente (en vivo: está aquí, no en Marte)
  for (const m of MOTAS) if (M.polvo > m.umbral * 0.9) {
    const a = clamp((M.polvo - m.umbral * 0.9) * 3) * 0.55, R = m.r * W, g = hx.createRadialGradient(m.x * W, m.y * H, 0, m.x * W, m.y * H, R);
    g.addColorStop(0, `rgba(40,30,20,${a})`); g.addColorStop(1, 'rgba(40,30,20,0)'); hx.fillStyle = g; hx.fillRect(m.x * W - R, m.y * H - R, R * 2, R * 2);
  }
  // marco y escala
  hx.strokeStyle = 'rgba(233,228,216,.55)'; hx.lineWidth = 1.5; const m = 14 * f / 2 + 8, l = 30 * f / 2 + 10;
  for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) { hx.beginPath(); hx.moveTo(x, y + sy * l); hx.lineTo(x, y); hx.lineTo(x + sx * l, y); hx.stroke(); }
  // trazos de limpieza
  for (const o of ops) if (o.trazo.length > 1) { hx.strokeStyle = o.color + '66'; hx.lineWidth = 18 * f / 2; hx.lineCap = 'round'; hx.beginPath(); o.trazo.forEach((p, i) => (i ? hx.lineTo(p.x * W, p.y * H) : hx.moveTo(p.x * W, p.y * H))); hx.stroke(); }
  // marcas de peso sobre las rocas
  // la orden de cada operador: dónde quiere poner la pinza
  const ac = ops.length >= 2 && M.I < 0.1;
  if (ops.length >= 2 && !ac) { // línea entre las miras: lo que hay que cerrar
    const pts = ops.map(o => { const t = tipDe(o.alc, o.giro), p = P(t.u, t.v); return [p.x * f, p.y * f]; });
    hx.setLineDash([6 * f / 2, 5 * f / 2]); hx.lineWidth = 1.5 * f / 2 + 0.5; hx.strokeStyle = M.I > 0.22 ? 'rgba(255,90,46,.9)' : 'rgba(233,228,216,.6)';
    hx.beginPath(); pts.forEach(([x, y], i) => (i ? hx.lineTo(x, y) : hx.moveTo(x, y))); hx.stroke(); hx.setLineDash([]);
  }
  for (const o of ops) { const t = tipDe(o.alc, o.giro), p = P(t.u, t.v); if (!ac) reticula(p.x * f, p.y * f, o.color, 12 * f / 2 + 6, o.parte === 'todo' || !o.parte ? o.rol : `${o.rol} · ${o.parte.toUpperCase()}`); }
  const B = M.brazo, tb = tipDe(B.alc, B.giro), pb = P(tb.u, tb.v);
  if (ac) reticula(pb.x * f, pb.y * f, '#ffffff', 18 * f / 2 + 8, 'ACOPLE');
  // bloqueo de la garra: qué operadores la están apretando (tercer dedo)
  const r = M.contacto || M.carga;
  if (ops.length && (r || M.bloqueos)) {
    const bw3 = 170 * f / 2, xd = pb.x * f + 26 * f / 2, x = xd + bw3 > W - 12 ? pb.x * f - 26 * f / 2 - bw3 : xd, y = pb.y * f + 18 * f / 2, cu = 10 * f / 2 + 3, fs3 = Math.round(9 * f / 2 + 4);
    const garra = ops.filter(o => o.parte !== 'brazo'), grande = r && r.pesada, ok = M.bloqueos > 0 && (!grande || ops.length >= 2);
    hx.fillStyle = 'rgba(0,0,0,.65)'; hx.fillRect(x - 4, y - 4, bw3, cu + 22 * f / 2);
    garra.forEach((o, i) => { hx.strokeStyle = o.color; hx.lineWidth = 1.5; hx.strokeRect(x + i * (cu + 6), y, cu, cu); if (o.bloq) { hx.fillStyle = o.color; hx.fillRect(x + i * (cu + 6) + 2, y + 2, cu - 4, cu - 4); } });
    hx.font = `${fs3}px "IBM Plex Mono", monospace`; hx.textAlign = 'left'; hx.fillStyle = ok ? '#7dff9a' : '#ffb020';
    hx.fillText(`GARRA ${M.bloqueos ? 'BLOQUEADA' : 'LIBRE'}${grande ? ` · GRANDE ${Math.min(ops.length, 2)}/2` : ''}`, x + garra.length * (cu + 6) + 4, y + cu - 1);
    if (!M.garraResponde) { hx.fillStyle = '#ff6b4a'; hx.fillText('NO RESPONDE', x, y + cu + 14 * f / 2); }
  }
  // letrero "ASEGURADO" junto a la garra: verde mientras la roca va bloqueada, rojo si la garra está abierta
  if (ops.length && !M.avance) {
    const fs4 = Math.round(9 * f / 2 + 4), tw = 92 * f / 2, th = 16 * f / 2 + 4, on = !!M.carga;
    const tx = pb.x * f - tw / 2, ty = pb.y * f - 44 * f / 2 - th;
    hx.fillStyle = on ? 'rgba(10,40,18,.85)' : 'rgba(45,10,6,.85)'; hx.fillRect(tx, ty, tw, th);
    hx.strokeStyle = on ? '#7dff9a' : '#ff3b2e'; hx.lineWidth = 1.5; hx.strokeRect(tx, ty, tw, th);
    hx.fillStyle = on ? '#7dff9a' : '#ff3b2e'; hx.beginPath(); hx.arc(tx + 9 * f / 2, ty + th / 2, 3 * f / 2 + 1, 0, 7); hx.fill(); // piloto
    hx.font = `700 ${fs4}px "IBM Plex Mono", monospace`; hx.textAlign = 'center'; hx.fillText('ASEGURADO', tx + tw / 2 + 5 * f / 2, ty + th * 0.7);
  }
  // polvo en el lente: cómo limpiarlo
  if (M.polvo > 0.55 && ops.length) { hx.textAlign = 'center'; hx.fillStyle = '#ffb020'; hx.font = `${Math.round(9 * f / 2 + 4)}px "IBM Plex Mono", monospace`; hx.fillText(ops.some(o => o.soplo) ? 'LIMPIANDO LENTE…' : 'LENTE CON POLVO · SOPLA AL MICRÓFONO DEL TELÉFONO O ARRASTRA UN DEDO', W / 2, H * 0.2); }
  // cabecera del visor
  const fs1 = Math.round(10 * f / 2 + 5), bw = 160 * f / 2, cy = m + 18 * f / 2;
  hx.font = `500 ${fs1}px "IBM Plex Mono", monospace`; hx.textAlign = 'center'; hx.fillStyle = '#e9e4d8';
  hx.fillText(`INTERFERENCIA ${Math.round(M.I * 100)} %`, W / 2, cy);
  hx.fillStyle = 'rgba(255,255,255,.15)'; hx.fillRect(W / 2 - bw / 2, cy + 6, bw, 4); hx.fillStyle = M.I > 0.5 ? '#ff5a2e' : '#ffb020'; hx.fillRect(W / 2 - bw / 2, cy + 6, bw * M.I, 4);
  hx.fillStyle = 'rgba(233,228,216,.7)'; hx.font = `${Math.round(9 * f / 2 + 4)}px "IBM Plex Mono", monospace`; hx.fillText(`${fpsReal.toFixed(1)} CPS · OPERADORES ${ops.length}`, W / 2, cy + 26 * f / 2);
  // protocolo de acople: instrucción discreta, como una nota de la misión
  if (ops.length >= 2 && !ac) {
    const fsP = Math.round(8 * f / 2 + 4), yP = cy + 46 * f / 2, verNota = now < M.guia || (M.tDesfase || 0) > 4;
    hx.textAlign = 'center'; hx.font = `${fsP}px "IBM Plex Mono", monospace`;
    if (verNota) { hx.fillStyle = `rgba(233,228,216,${0.55 + 0.25 * Math.sin(now / 600)})`; hx.fillText('PROTOCOLO · la garra obedece cuando su mira descansa sobre la del brazo', W / 2, yP); }
    const g0 = ops.find(o => o.parte === 'garra'); // junto a la mira de la garra: cuánto falta
    if (g0) { const t = tipDe(g0.alc, g0.giro), pg = P(t.u, t.v); hx.textAlign = 'left'; hx.fillStyle = '#9db4ff'; hx.fillText(`ACOPLE ${Math.round((1 - M.I) * 100)}%`, pg.x * f + 18 * f / 2, pg.y * f + 16 * f / 2); }
  }
  if (M.avance) { // letrero AVANZANDO en el centro; el resto del HUD sigue encendido
    const os = oscuroAvance(), pts = '.'.repeat(1 + (Math.floor(now / 350) % 3)), fsA = Math.round(22 * f / 2 + 10);
    hx.globalAlpha = Math.max(os, 0.15); hx.textAlign = 'center'; hx.fillStyle = '#e9e4d8'; hx.font = `700 ${fsA}px "IBM Plex Mono", monospace`;
    const yA = H * 0.36; hx.fillText('AVANZANDO' + pts, W / 2, yA); hx.font = `${Math.round(9 * f / 2 + 4)}px "IBM Plex Mono", monospace`; hx.fillStyle = '#cfc9bb';
    hx.fillText('LA SONDA SE DESPLAZA A OTRO PUNTO DEL CRÁTER JEZERO', W / 2, yA + fsA * 0.9);
    const bw4 = 220 * f / 2; hx.fillStyle = 'rgba(255,255,255,.15)'; hx.fillRect(W / 2 - bw4 / 2, yA + fsA * 1.4, bw4, 3); hx.fillStyle = '#ff8a1f'; hx.fillRect(W / 2 - bw4 / 2, yA + fsA * 1.4, bw4 * clamp(M.avance.t / AVANCE.fin), 3);
    hx.globalAlpha = 1;
  }
  if (!ops.length) { hx.textAlign = 'center'; hx.fillStyle = '#ffb020'; hx.font = `500 ${fs1}px "IBM Plex Mono", monospace`; hx.fillText('ESPERANDO OPERADORES · ESCANEA EL QR DE LA ESQUINA', W / 2, H * 0.26); }
}

// ficha de la última muestra: consola inferior (como la barra de una estrategia en tiempo real); queda hasta la siguiente
function mostrarFicha(r) {
  const el = $('#consola'); el.hidden = false; el.classList.remove('nueva', 'fuera'); void el.offsetWidth; el.classList.add('nueva');
  clearTimeout(mostrarFicha.t1); clearTimeout(mostrarFicha.t2);
  mostrarFicha.t1 = setTimeout(() => el.classList.add('fuera'), 10000);        // a los 10 s se desvanece…
  mostrarFicha.t2 = setTimeout(() => { el.hidden = true; }, 11200);            // …y se oculta
  $('#fId').textContent = `${r.id} · ${r.masa.toFixed(2)} kg · ${r.pesada ? 'roca grande' : 'roca pequeña'}`;
  $('#fTipo').textContent = r.tipo; $('#fN').textContent = M.ok;
  $('#fComp').innerHTML = r.comp.map(([n, pc]) => `<div class="min"><span>${n}</span><i><b style="width:${pc}%"></b></i><em>${pc}%</em></div>`).join('');
  const cv = $('#fImg'), c = cv.getContext('2d'), lista = SPRITES[r.pesada ? 'grande' : 'pequena'], im = lista.length ? lista[r.sprite % lista.length] : null;
  c.clearRect(0, 0, cv.width, cv.height);
  if (im) { c.save(); c.filter = 'grayscale(1) sepia(.35) contrast(1.15)'; c.translate(cv.width / 2, cv.height / 2); c.rotate(r.giroImg); c.drawImage(im, -cv.width * 0.45, -cv.height * 0.45, cv.width * 0.9, cv.height * 0.9); c.restore(); }
}

// ============================ PANEL LATERAL ===========================
function panel() {
  const B = M.brazo, ops = Object.values(OPS);
  $('#mInt').style.width = M.I * 100 + '%'; $('#vInt').textContent = Math.round(M.I * 100) + ' %';
  $('#vAlc').textContent = (B.alc * 2.1).toFixed(2) + ' m'; $('#vGiro').textContent = Math.round(B.giro * GIRO_MAX) + '°';
  $('#vPinza').textContent = Math.round(B.pinza * 100) + ' %'; $('#vFuerza').textContent = `${M.bloqueos} ` + (ops.length ? `(${ops.map(o => o.rol + (o.bloq ? ' ■' : ' □')).join(' · ')})` : '');
  $('#vLente').textContent = M.polvo < 0.3 ? 'limpio' : M.polvo < 0.6 ? 'polvo' : 'cubierto';
  $('#vOk').textContent = M.ok; $('#sol').textContent = M.sol;
  const d = tacto.pick(); if (d && d.rtt.length) { const s = [...d.rtt].sort((a, b) => a - b); $('#rtt').textContent = `LATENCIA ${Math.round(s[s.length >> 1])} ms`; }
}

// ============================ PRUEBA SIN TELÉFONO =====================
// Ratón: posición = inclinación; rueda = abrir/cerrar garra; clic = tercer dedo (bloquear).  Fantasma: copia al ratón con retraso y error.
const SIM = { x: 0.5, y: 0.5, pinza: 0.8, toque: 0, hist: [] };
visor.addEventListener('pointermove', e => { const r = hud.getBoundingClientRect(); SIM.x = clamp((e.clientX - r.left) / r.width); SIM.y = clamp((e.clientY - r.top) / r.height); });
visor.addEventListener('pointerdown', e => { if (e.target.closest('button, #unir')) return; SIM.toque = performance.now() + 150; });
visor.addEventListener('wheel', e => { if (!$('#raton').checked) return; e.preventDefault(); SIM.pinza = clamp(SIM.pinza + Math.sign(e.deltaY) * 0.08, -0.15, 1); }, { passive: false });
function inyectar(id, nombre, b, g, pinza, n = 2) { // n = 3 simula el toque del tercer dedo
  const pre = `tacto/${tacto.sala}/${id}/`, dist = 0.05 + ((pinza + 0.15) / 1.15) * 0.45;
  if (!tacto.devices[id] || !tacto.devices[id].online) tacto._msg(pre + 'status', JSON.stringify({ online: true, name: nombre, caps: {} }));
  tacto._msg(pre + 'motion', JSON.stringify({ a: [0, b, g] }));
  const p = [{ i: 1, x: 0.5 - dist / 2, y: 0.5, f: 0, d: 30 }, { i: 2, x: 0.5 + dist / 2, y: 0.5, f: 0, d: 30 }];
  if (n >= 3) p.push({ i: 3, x: 0.5, y: 0.8, f: 0, d: 30 });
  tacto._msg(pre + 'touch', JSON.stringify({ n, ar: 1, p }));
}
function simular(dt, now) {
  const b = -(0.5 - SIM.y) * 50, g = (SIM.x - 0.5) * 60, n = now < SIM.toque ? 3 : 2;
  SIM.hist.push({ t: now, b, g, pinza: SIM.pinza, n }); while (SIM.hist.length && now - SIM.hist[0].t > 800) SIM.hist.shift();
  if ($('#raton').checked) inyectar('raton', 'ratón', b, g, SIM.pinza, n);
  else if (tacto.devices.raton?.online) tacto._msg(`tacto/${tacto.sala}/raton/status`, JSON.stringify({ online: false }));
  if ($('#eco').checked) {
    const h = SIM.hist[0] || { b, g, pinza: SIM.pinza, n }, s = now / 1000;
    inyectar('eco', 'fantasma', h.b + 9 * Math.sin(s * 0.7), h.g + 11 * Math.sin(s * 0.45 + 1), clamp(h.pinza + 0.15 * Math.sin(s * 0.9), -0.15, 1), h.n);
  } else if (tacto.devices.eco?.online) tacto._msg(`tacto/${tacto.sala}/eco/status`, JSON.stringify({ online: false }));
}

// ============================ SALA, QR, INICIO ========================
const qrLib = () => window.qrcode ? Promise.resolve() : new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
async function unir() { // dirección de la página del teléfono (index.html) con la sala y el broker
  const CFG = window.TACTO_CONFIG || {}, Q = new URLSearchParams(location.search); let base = CFG.phoneUrl || null, local = false;
  try { const i = await (await fetch('info', { cache: 'no-store' })).json(); if (i.baseUrl) { base = CFG.phoneUrl || i.baseUrl + '/control.html'; local = true; } } catch {}
  if (!base) base = new URL('control.html', location.href).href; // el QR lleva a la página de control del teléfono
  $('#salaCod').textContent = tacto.sala;
  let u = base + (base.includes('?') ? '&' : '?') + 'sala=' + tacto.sala;
  if (!local || Q.get('broker')) u += '&broker=' + encodeURIComponent(tacto.broker || CFG.broker || Tacto.PUBLIC_BROKER);
  $('#phoneUrl').textContent = $('#phoneUrl2').textContent = u;
  try {
    let src; if (local) src = 'qr.svg?u=' + encodeURIComponent(u);
    else { await qrLib(); const q = window.qrcode(0, 'M'); q.addData(u); q.make(); src = q.createDataURL(6, 4); }
    for (const id of ['#qr', '#qr2']) { $(id).src = src; $(id).hidden = false; }
  } catch { $('#qr').hidden = $('#qr2').hidden = true; }
}
$('#salaIn').value = tacto.sala;
$('#salaIn').onchange = e => { $('#salaIn').value = tacto.cambiarSala(e.target.value); unir(); };
$('#salaNueva').onclick = () => { $('#salaIn').value = tacto.cambiarSala(Tacto.nuevaSala()); unir(); };
tacto.on('estado', s => { const e = $('#enlace'); e.className = 'estado' + (s === 'conectado' ? ' on' : ''); e.textContent = 'ENLACE · ' + s; });
tacto.on('error', () => { $('#enlace').className = 'estado'; $('#enlace').textContent = 'ENLACE · error'; });
tacto.connect().then(unir).catch(() => { $('#enlace').textContent = 'ENLACE · sin broker'; });
unir();

const arrancar = async () => { if (AU.ctx) return; $('#arranque').hidden = true; await iniciarAudio(); golpe('ping', 0.5); avisar('ENLACE ABIERTO'); };
$('#iniciar').onclick = arrancar;
addEventListener('pointerdown', e => { if (!e.target.closest('#prueba')) arrancar(); }, { once: false }); // cualquier clic activa el sonido
const verQR = () => { $('#inicio').hidden = !$('#inicio').hidden; };
$('#unir').onclick = verQR; $('#cerrarQR').onclick = verQR;
const fs = () => (document.fullscreenElement ? document.exitFullscreen() : visor.requestFullscreen?.())?.catch?.(() => {});
$('#fsBtn').onclick = fs;
addEventListener('keydown', e => {
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.ctrlKey || e.metaKey) return;
  const k = e.key.toLowerCase();
  if (k === 'f') fs();
  if (k === 'c') { Object.values(OPS).forEach(o => { if (o.id !== 'raton' && o.id !== 'eco') o.recal = true; }); avisar('CALIBRADO · POSTURA ACTUAL = CERO'); }
  if (k === 'd') $('#prueba').hidden = !$('#prueba').hidden;
  if (k === 'q') verQR();
  if (k === 'a') avanzar();
  arrancar();
});
pintarOps(); ajustar();

let tPrev = performance.now(), n = 0;
function vaiven(now) { const os = oscuroAvance(); feed.style.transform = os > 0 ? `translate(${Math.sin(now / 90) * 3 * os}px, ${Math.sin(now / 61) * 4 * os}px)` : ''; }
(function loop(now) {
  const dt = clamp((now - tPrev) / 1000, 0.001, 0.05); tPrev = now;
  simular(dt, now); paso(dt, now); cuadroCamara(now); dibujarHud(now); vaiven(now);
  if (++n % 6 === 0) panel();
  requestAnimationFrame(loop);
})(tPrev);

window.__acople = { tacto, OPS, M, AU, SIM, inyectar, avanzar }; // para depurar desde la consola
