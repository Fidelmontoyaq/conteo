import type { BoundingBox } from '../types/acta';
import { MODELO, SEMILLAS } from './modeloDigitos';
import { componentes, leerLuma, percentil, quitarLineas } from './analizarCelda';

// Cada celda de votos tiene 3 casilleros punteados: [centena][decena][unidad].
// Cada dígito está escrito en SU casillero, así que se lee casillero por casillero.

function reg(box: BoundingBox, k: number, ih: number, iv: number) {
  const bw = box.w / 3;
  return {
    x0: Math.floor(box.x + k * bw + bw * ih), x1: Math.floor(box.x + k * bw + bw * (1 - ih)),
    y0: Math.floor(box.y + box.h * iv), y1: Math.floor(box.y + box.h - box.h * iv),
  };
}

function mascara(L: Float32Array, w: number, h: number, fondo: number): Uint8Array {
  const m = new Uint8Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = L[i] < 0.66 * fondo ? 1 : 0;
  quitarLineas(m, w, h, 0.7);
  return m;
}

// Recorta el dígito, lo centra en un cuadrado y lo reduce a 8x8 promediando áreas.
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

// Vector 8x8 del dígito de un casillero, o null si el casillero está vacío.
export function cajaDigito(canvas: HTMLCanvasElement, box: BoundingBox, k: number): number[] | null {
  const A = reg(box, k, 0.2, 0.12); // zona central: decide si hay escritura (evita puntos y bordes)
  const a = leerLuma(canvas, A.x0, A.y0, A.x1 - A.x0, A.y1 - A.y0);
  if (a.w < 4 || a.h < 4) return null;
  const fondo = percentil(a.L, 50);
  const mA = mascara(a.L, a.w, a.h, fondo);
  const cA = componentes(mA, a.w, a.h);
  if (!cA.n) return null;
  const maxS = Math.max(...cA.sizes);
  const seed = new Uint8Array(a.w * a.h);
  let tot = 0, minY = a.h, maxY = -1;
  for (let p = 0; p < seed.length; p++) {
    const id = cA.lab[p];
    if (id && cA.sizes[id - 1] >= Math.max(8, 0.06 * maxS)) {
      seed[p] = 1; tot++;
      const y = Math.floor(p / a.w);
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (tot < 0.01 * a.w * a.h || maxY - minY + 1 < 0.28 * a.h) return null;

  // Zona amplia: recupera el trazo completo (solo lo conectado a lo detectado).
  const B = reg(box, k, 0.02, 0.08);
  const b = leerLuma(canvas, B.x0, B.y0, B.x1 - B.x0, B.y1 - B.y0);
  const mB = mascara(b.L, b.w, b.h, fondo);
  const cB = componentes(mB, b.w, b.h);
  const ids = new Set<number>();
  const ox = A.x0 - B.x0;
  const oy = A.y0 - B.y0;
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (seed[y * a.w + x]) {
    const lb = cB.lab[(y + oy) * b.w + (x + ox)];
    if (lb > 0) ids.add(lb);
  }
  const fin = new Uint8Array(b.w * b.h);
  let n = 0;
  for (let p = 0; p < fin.length; p++) if (ids.has(cB.lab[p])) { fin[p] = 1; n++; }
  return n ? normalizar8(fin, b.w, b.h) : null;
}

// ---- Clasificador: MLP + vecinos de correcciones reales ----
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

export interface Muestra { x: number[]; y: number }
let muestras: Muestra[] = SEMILLAS.X.map((x, i) => ({ x, y: SEMILLAS.Y[i] }));
export const agregarMuestras = (m: Muestra[]) => { muestras = muestras.concat(m); };

export function clasificarDigito(x: number[]): { digito: number; confianza: number } {
  const p = mlp(x);
  const cercanas = muestras
    .map((m) => ({ y: m.y, d: m.x.reduce((s, v, i) => s + (v - x[i]) ** 2, 0) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3);
  for (const c of cercanas) if (c.d < 8) p[c.y] += 1.5 * Math.exp(-c.d / 2.5);
  const tot = p.reduce((a, b) => a + b, 0);
  let best = 0;
  for (let i = 1; i < 10; i++) if (p[i] > p[best]) best = i;
  return { digito: best, confianza: p[best] / tot };
}

export interface NumeroLeido {
  valor: number;
  confianza: number;
  vectores: (number[] | null)[];
  texto: string;
}

// Lee un número de hasta 3 dígitos (derecha = unidad). null si no hay ninguna escritura.
export function leerNumeroCelda(canvas: HTMLCanvasElement, box: BoundingBox): NumeroLeido | null {
  const vectores = [0, 1, 2].map((k) => cajaDigito(canvas, box, k));
  const idx = vectores.map((v, k) => (v ? k : -1)).filter((k) => k >= 0);
  if (!idx.length) return null;
  let texto = '';
  let conf = 1;
  for (const k of idx) {
    const r = clasificarDigito(vectores[k]!);
    texto += String(r.digito);
    conf = Math.min(conf, r.confianza);
  }
  const hueco = idx[idx.length - 1] - idx[0] + 1 !== idx.length; // p. ej. centena y unidad sin decena
  if (hueco) conf = Math.min(conf, 0.5);
  return { valor: parseInt(texto, 10), confianza: Math.min(0.97, conf), vectores, texto };
}
