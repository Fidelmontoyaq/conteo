import type { BoundingBox, CandidatoDigito, DigitoLeido } from '../types/acta';
import { MODELO, SEMILLAS } from './modeloDigitos';
import { ampliar, componentes, leerCanales, mascaraAzul, mascaraLuma, percentil, quitarLineas, type Fuente } from './analizarCelda';
import * as U from './umbrales';

// Cada celda de votos tiene 3 casilleros punteados: [centena][decena][unidad].
// Cada dígito está escrito en SU casillero, así que se lee casillero por casillero.
//
// Distinciones que este módulo hace explícitas (antes todo lo no leído era «0»):
//   · casillero VACÍO  → ninguna tinta
//   · casillero DÉBIL  → hay algo de tinta pero no alcanza para un dígito (NO se trata como vacío)
//   · dígito 0         → un cero realmente reconocido
//   · lectura AMBIGUA  → candidatos muy cercanos, variantes de tinta que discrepan, huecos, trazo cortado…

const NOMBRE_CASILLERO = ['centena', 'decena', 'unidad'];

function reg(box: BoundingBox, k: number, ih: number, iv: number) {
  const bw = box.w / 3;
  return {
    x0: Math.floor(box.x + k * bw + bw * ih), x1: Math.floor(box.x + k * bw + bw * (1 - ih)),
    y0: Math.floor(box.y + box.h * iv), y1: Math.floor(box.y + box.h - box.h * iv),
  };
}

// Recorta el dígito, lo centra en un cuadrado (sin deformarlo) y lo reduce a 8x8 promediando áreas.
export function normalizar8(m: Uint8Array, w: number, h: number): number[] {
  let minX = w, maxX = -1, minY = h, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const F = Math.max(cw, ch);
  const oy = Math.floor((F - ch) / 2);
  const ox = Math.floor((F - cw) / 2);
  const out: number[] = [];
  for (let i = 0; i < 8; i++) {
    const a0 = Math.floor((i * F) / 8);
    const a1 = Math.max(Math.ceil(((i + 1) * F) / 8), a0 + 1);
    for (let j = 0; j < 8; j++) {
      const b0 = Math.floor((j * F) / 8);
      const b1 = Math.max(Math.ceil(((j + 1) * F) / 8), b0 + 1);
      let s = 0;
      for (let yy = a0; yy < a1; yy++) for (let xx = b0; xx < b1; xx++) {
        const sx = xx - ox;
        const sy = yy - oy;
        if (sx >= 0 && sy >= 0 && sx < cw && sy < ch && m[(minY + sy) * w + minX + sx]) s++;
      }
      out.push(s / ((a1 - a0) * (b1 - b0)));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Análisis de un casillero
// ---------------------------------------------------------------------------------------------

export type EstadoCasillero = 'VACIO' | 'TRAZO' | 'DEBIL' | 'FUERA';

interface Variante {
  estado: Exclude<EstadoCasillero, 'FUERA'>;
  vector: number[] | null;
  tocaBorde: boolean;
  tinta: number; // fracción de la zona central cubierta por trazos
}

export interface Casillero {
  k: number;
  estado: EstadoCasillero;
  luma: number[] | null; // vector 8x8 de la variante por luminancia (cualquier tinta oscura)
  azul: number[] | null; // vector 8x8 de la variante de tinta azul (croma B−R)
  tocaBorde: boolean;
  tinta: number;
}

type Modo = 'luma' | 'azul';

function extraerVariante(
  L: Float32Array, C: Float32Array, W: number, H: number,
  A: { x: number; y: number; w: number; h: number }, factor: number, fondo: number, medianaC: number, modo: Modo,
): Variante {
  const bruta = modo === 'luma'
    ? mascaraLuma(L, fondo, U.MASCARA_FRAC_FONDO)
    : mascaraAzul(L, C, fondo, medianaC, U.AZUL_DELTA, U.AZUL_LUMA_MAX);

  // 1) Zona central: decide si hay escritura (evita puntos y bordes).
  const mA = new Uint8Array(A.w * A.h);
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) mA[y * A.w + x] = bruta[(A.y + y) * W + A.x + x];
  // Solo la variante de luminancia quita «líneas»: borra también el trazo de un 1 (cubre >70 % del alto).
  // La variante azul no lo necesita: las líneas negras impresas no responden al croma azul.
  if (modo === 'luma') quitarLineas(mA, A.w, A.h, U.LINEAS_UMBRAL_DIGITO);
  const cA = componentes(mA, A.w, A.h);
  if (!cA.n) return { estado: 'VACIO', vector: null, tocaBorde: false, tinta: 0 };

  const maxS = Math.max(...cA.sizes);
  const minPx = Math.max(U.SEMILLA_MIN_PX * factor * factor, U.SEMILLA_FRAC_MAX * maxS);
  const semilla = new Uint8Array(A.w * A.h);
  let tot = 0, minY = A.h, maxY = -1;
  for (let p = 0; p < semilla.length; p++) {
    const id = cA.lab[p];
    if (id && cA.sizes[id - 1] >= minPx) {
      semilla[p] = 1; tot++;
      const y = Math.floor(p / A.w);
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const area = A.w * A.h;
  const tinta = tot / area;
  if (tot === 0) return { estado: 'VACIO', vector: null, tocaBorde: false, tinta: 0 };
  if (tot < U.TINTA_MIN_FRAC * area || maxY - minY + 1 < U.ALTURA_MIN_FRAC * A.h) {
    // Hay trazos, pero no bastan para un dígito. Antes se descartaban en silencio como «vacío»:
    // si superan el mínimo de tinta se marcan como DÉBIL para que una persona los mire.
    return { estado: tot >= U.DEBIL_MIN_FRAC * area ? 'DEBIL' : 'VACIO', vector: null, tocaBorde: false, tinta };
  }

  // 2) Zona amplia: recupera el trazo completo (solo lo conectado a lo detectado).
  const mB = new Uint8Array(bruta);
  if (modo === 'luma') quitarLineas(mB, W, H, U.LINEAS_UMBRAL_DIGITO);
  const cB = componentes(mB, W, H);
  const ids = new Set<number>();
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) if (semilla[y * A.w + x]) {
    const lb = cB.lab[(A.y + y) * W + (A.x + x)];
    if (lb > 0) ids.add(lb);
  }
  const fin = new Uint8Array(W * H);
  let n = 0;
  let toca = false;
  for (let p = 0; p < fin.length; p++) if (ids.has(cB.lab[p])) {
    fin[p] = 1; n++;
    const x = p % W;
    const y = (p - x) / W;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) toca = true;
  }
  return n ? { estado: 'TRAZO', vector: normalizar8(fin, W, H), tocaBorde: toca, tinta } : { estado: 'VACIO', vector: null, tocaBorde: false, tinta };
}

// Analiza un casillero con las dos variantes de tinta. Casilleros pequeños se amplían antes de reconocer.
export function analizarCasillero(f: Fuente, box: BoundingBox, k: number): Casillero {
  const fuera: Casillero = { k, estado: 'FUERA', luma: null, azul: null, tocaBorde: false, tinta: 0 };
  const A0 = reg(box, k, U.ZONA_CENTRAL.ih, U.ZONA_CENTRAL.iv);
  const B0 = reg(box, k, U.ZONA_AMPLIA.ih, U.ZONA_AMPLIA.iv);
  const bx0 = Math.max(0, B0.x0);
  const by0 = Math.max(0, B0.y0);
  const raw = leerCanales(f, B0.x0, B0.y0, B0.x1 - B0.x0, B0.y1 - B0.y0);
  if (raw.w < 4 || raw.h < 4) return fuera;

  const factor = raw.h < U.ALTO_MIN_PX ? Math.min(U.FACTOR_AMPLIACION_MAX, Math.ceil(U.ALTO_OBJETIVO_PX / raw.h)) : 1;
  const Lg = ampliar(raw.L, raw.w, raw.h, factor);
  const Cg = ampliar(raw.C, raw.w, raw.h, factor);
  const ax = Math.max(0, Math.round((A0.x0 - bx0) * factor));
  const ay = Math.max(0, Math.round((A0.y0 - by0) * factor));
  const aw = Math.min(Lg.w - ax, Math.round((A0.x1 - A0.x0) * factor));
  const ah = Math.min(Lg.h - ay, Math.round((A0.y1 - A0.y0) * factor));
  if (aw < 4 || ah < 4) return fuera;
  const A = { x: ax, y: ay, w: aw, h: ah };

  const subL = new Float32Array(aw * ah);
  const subC = new Float32Array(aw * ah);
  for (let y = 0; y < ah; y++) for (let x = 0; x < aw; x++) {
    subL[y * aw + x] = Lg.d[(ay + y) * Lg.w + ax + x];
    subC[y * aw + x] = Cg.d[(ay + y) * Lg.w + ax + x];
  }
  const fondo = percentil(subL, 50);
  const medianaC = percentil(subC, 50);

  const vl = extraerVariante(Lg.d, Cg.d, Lg.w, Lg.h, A, factor, fondo, medianaC, 'luma');
  const va = extraerVariante(Lg.d, Cg.d, Lg.w, Lg.h, A, factor, fondo, medianaC, 'azul');
  const estado: EstadoCasillero = vl.estado === 'TRAZO' || va.estado === 'TRAZO' ? 'TRAZO'
    : vl.estado === 'DEBIL' || va.estado === 'DEBIL' ? 'DEBIL' : 'VACIO';
  return {
    k, estado, luma: vl.vector, azul: va.vector,
    tocaBorde: (vl.vector !== null && vl.tocaBorde) || (va.vector !== null && va.tocaBorde),
    tinta: Math.max(vl.tinta, va.tinta),
  };
}

// ---------------------------------------------------------------------------------------------
// Clasificador: MLP + vecinos de correcciones reales
// ---------------------------------------------------------------------------------------------
function mlp(x: number[]): number[] {
  let h = x;
  for (let l = 0; l < MODELO.W.length; l++) {
    const W = MODELO.W[l];
    const B = MODELO.B[l];
    const o = B.map((b, j) => { let s = b; for (let i = 0; i < h.length; i++) s += h[i] * W[i][j]; return s; });
    h = l < MODELO.W.length - 1 ? o.map((v) => Math.max(0, v)) : o;
  }
  const mx = Math.max(...h);
  const e = h.map((v) => Math.exp(v - mx));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

// `acta` = hash del documento del que salió la muestra (para poder excluirla al evaluar).
export interface Muestra { x: number[]; y: number; acta?: string }

// Las 46 semillas del modelo salen del acta de la mesa 057110 (la misma que calibró la plantilla).
export const ACTA_SEMILLAS = 'semillas-mesa-057110';
let muestras: Muestra[] = SEMILLAS.X.map((x, i) => ({ x, y: SEMILLAS.Y[i], acta: ACTA_SEMILLAS }));
export const agregarMuestras = (m: Muestra[]) => { muestras = muestras.concat(m); };
export const totalMuestras = () => muestras.length;

// Para EVALUAR sin contaminar: no se debe entrenar y medir con la misma acta.
//   sinAprendizaje  → ignora las correcciones aprendidas (solo quedan las semillas)
//   excluirActas    → ignora las muestras de esos documentos (use ACTA_SEMILLAS para quitar también las semillas)
export const opcionesClasificador: { sinAprendizaje: boolean; excluirActas: Set<string> } = {
  sinAprendizaje: false, excluirActas: new Set<string>(),
};

export interface Clasificacion {
  digito: number;
  confianza: number; // proporción del 1.er candidato tras el refuerzo por vecinos. NO es una probabilidad calibrada.
  margen: number; // 1.er − 2.º candidato (misma escala)
  candidatos: CandidatoDigito[];
  mlp: { digito: number; p: number }; // lo que dice la red sola, sin vecinos (diagnóstico)
}

export function clasificarDigito(x: number[]): Clasificacion {
  const pm = mlp(x);
  const p = pm.slice();
  const usables = muestras.filter((m) => {
    if (opcionesClasificador.sinAprendizaje && m.acta !== ACTA_SEMILLAS) return false;
    return !(m.acta && opcionesClasificador.excluirActas.has(m.acta));
  });
  const cercanas = usables
    .map((m) => ({ y: m.y, d: m.x.reduce((s, v, i) => s + (v - x[i]) ** 2, 0) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3);
  for (const c of cercanas) if (c.d < 8) p[c.y] += 1.5 * Math.exp(-c.d / 2.5);
  const tot = p.reduce((a, b) => a + b, 0);
  const orden = p.map((v, i) => ({ digito: i, p: v / tot })).sort((a, b) => b.p - a.p);
  let bm = 0;
  for (let i = 1; i < 10; i++) if (pm[i] > pm[bm]) bm = i;
  return {
    digito: orden[0].digito, confianza: orden[0].p, margen: orden[0].p - orden[1].p,
    candidatos: orden.slice(0, 3), mlp: { digito: bm, p: pm[bm] },
  };
}

// Combina las variantes de un casillero SIN mezclar predicciones contradictorias:
//   · coinciden            → lectura con la confianza más baja de las dos
//   · discrepan            → se queda la de luminancia (la variante histórica) pero se marca desacuerdo (→ AMBIGUA)
//   · solo una la detecta  → se usa esa variante y se anota
function combinar(c: Casillero): { lectura: DigitoLeido; motivos: string[] } | null {
  const rl = c.luma ? clasificarDigito(c.luma) : null;
  const ra = c.azul ? clasificarDigito(c.azul) : null;
  const nombre = NOMBRE_CASILLERO[c.k];
  if (rl && ra) {
    if (rl.digito === ra.digito) {
      return { lectura: { k: c.k, digito: rl.digito, confianza: Math.min(rl.confianza, ra.confianza), margen: Math.min(rl.margen, ra.margen), candidatos: rl.candidatos, variante: 'AMBAS', acuerdo: true }, motivos: [] };
    }
    return {
      lectura: { k: c.k, digito: rl.digito, confianza: Math.min(rl.confianza, ra.confianza), margen: 0, candidatos: rl.candidatos, variante: 'AMBAS', acuerdo: false, alternativa: { variante: 'AZUL', digito: ra.digito } },
      motivos: [`${nombre}: luminancia lee ${rl.digito} y tinta azul lee ${ra.digito}`],
    };
  }
  if (rl) return { lectura: { k: c.k, digito: rl.digito, confianza: rl.confianza, margen: rl.margen, candidatos: rl.candidatos, variante: 'LUMINANCIA', acuerdo: null }, motivos: [] };
  if (ra) return { lectura: { k: c.k, digito: ra.digito, confianza: ra.confianza, margen: ra.margen, candidatos: ra.candidatos, variante: 'AZUL', acuerdo: null }, motivos: [`${nombre}: solo la separación de tinta azul detectó el trazo`] };
  return null;
}

export interface NumeroLeido {
  valor: number | null; // null si hay hueco o no hay ningún dígito legible (no se inventa un número)
  confianza: number;
  vectores: (number[] | null)[]; // 8x8 por casillero (variante principal) para aprender de las correcciones
  texto: string; // p. ej. "507", "5·7" (· = sin dígito), "?" (trazo débil)
  digitos: DigitoLeido[];
  motivos: string[];
  ambiguo: boolean;
  casilleros_trazo: number; // casilleros con un dígito detectado
  casilleros_azul: number; // de ésos, los que tienen evidencia de tinta azul
  tinta: number; // mayor densidad de trazo entre los casilleros
}

// Lee un número de hasta 3 dígitos (derecha = unidad). null SOLO si los tres casilleros están realmente vacíos.
export function leerNumeroCelda(f: Fuente, box: BoundingBox): NumeroLeido | null {
  const cas = [0, 1, 2].map((k) => analizarCasillero(f, box, k));
  const trazo = cas.filter((c) => c.estado === 'TRAZO');
  const debiles = cas.filter((c) => c.estado === 'DEBIL');
  const fuera = cas.filter((c) => c.estado === 'FUERA');
  if (!trazo.length && !debiles.length && !fuera.length) return null;

  const motivos: string[] = [];
  let ambiguo = false;
  if (fuera.length) { ambiguo = true; motivos.push('el recorte de un casillero queda fuera de la imagen o es demasiado pequeño'); }
  if (debiles.length) { ambiguo = true; motivos.push(`trazo débil (¿número tenue o mancha?) en: ${debiles.map((c) => NOMBRE_CASILLERO[c.k]).join(', ')}`); }

  const digitos: DigitoLeido[] = [];
  let conf = 1;
  for (const c of trazo) {
    const r = combinar(c);
    if (!r) continue; // TRAZO siempre trae un vector; protección
    digitos.push(r.lectura);
    motivos.push(...r.motivos);
    conf = Math.min(conf, r.lectura.confianza);
    if (r.lectura.acuerdo === false) ambiguo = true;
    if (r.lectura.margen < U.MARGEN_AMBIGUO && r.lectura.acuerdo !== false) {
      ambiguo = true;
      const [a, b] = r.lectura.candidatos;
      motivos.push(`${NOMBRE_CASILLERO[c.k]}: candidatos muy cercanos ${a.digito} (${a.p.toFixed(2)}) y ${b.digito} (${b.p.toFixed(2)})`);
    }
    if (c.tocaBorde) {
      conf = Math.min(conf, U.CONF_MAX_BORDE);
      motivos.push(`${NOMBRE_CASILLERO[c.k]}: el trazo toca el borde del recorte (puede estar cortado o unido a otro dígito)`);
    }
  }

  const idx = digitos.map((d) => d.k);
  const hueco = idx.length > 0 && idx[idx.length - 1] - idx[0] + 1 !== idx.length;
  if (hueco) {
    ambiguo = true;
    conf = Math.min(conf, U.CONF_MAX_HUECO);
    motivos.push('casillero sin dígito entre dígitos escritos (¿cero sin escribir, espacio o dígito omitido?)');
  }

  // Los números se escriben alineados a la derecha (la unidad en el último casillero). Dígitos en centena/decena con la
  // unidad vacía son ambiguos de magnitud (¿57 o 570?): el código anterior los leía como 57 sin avisar.
  const sinUnidad = idx.length > 0 && idx[idx.length - 1] !== 2;
  if (sinUnidad && !hueco) {
    ambiguo = true;
    conf = Math.min(conf, U.CONF_MAX_HUECO);
    motivos.push('la unidad está vacía pero hay dígitos en casilleros de mayor valor (¿número corrido a la izquierda?)');
  }

  // Texto crudo: conserva huecos (·) y trazos débiles (?). Los · iniciales no aportan y se quitan.
  const texto = [0, 1, 2]
    .map((k) => { const d = digitos.find((x) => x.k === k); return d ? String(d.digito) : cas[k].estado === 'DEBIL' ? '?' : '·'; })
    .join('').replace(/^·+/, '');
  // El valor numérico solo se propone si la posición de los dígitos no deja dudas.
  const valor = idx.length && !hueco && !sinUnidad ? parseInt(digitos.map((d) => d.digito).join(''), 10) : null;
  const vectores = [0, 1, 2].map((k) => (cas[k].luma ?? cas[k].azul));
  const casilleros_azul = trazo.filter((c) => c.azul !== null).length;
  return {
    valor, confianza: Math.min(U.CONF_MAX_DIGITO, idx.length ? conf : 0), vectores, texto, digitos, motivos, ambiguo,
    casilleros_trazo: trazo.length, casilleros_azul, tinta: Math.max(...cas.map((c) => c.tinta)),
  };
}
