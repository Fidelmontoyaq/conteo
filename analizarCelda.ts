// Utilidades de píxeles (todo relativo al papel de cada escaneo, sin umbrales absolutos).

// Las funciones aceptan un <canvas> (navegador) o un raster RGBA en memoria (pruebas, evaluación, workers):
// así la lógica de imagen se puede probar sin DOM.
export interface RasterRGBA { width: number; height: number; data: Uint8ClampedArray | Uint8Array }
export type Fuente = HTMLCanvasElement | RasterRGBA;
const esCanvas = (f: Fuente): f is HTMLCanvasElement => typeof (f as HTMLCanvasElement).getContext === 'function';

export interface Luma { L: Float32Array; w: number; h: number }
// C = B − R: positivo para tinta azul, ≈0 para tinta negra/gris, negativo para el fondo rosado.
export interface Canales extends Luma { C: Float32Array }

function leer(f: Fuente, x: number, y: number, w: number, h: number, conC: boolean): Canales {
  const X = Math.max(0, Math.floor(x));
  const Y = Math.max(0, Math.floor(y));
  const W = Math.min(f.width - X, Math.floor(w));
  const H = Math.min(f.height - Y, Math.floor(h));
  if (W <= 0 || H <= 0) return { L: new Float32Array(0), C: new Float32Array(0), w: 0, h: 0 };
  const L = new Float32Array(W * H);
  const C = conC ? new Float32Array(W * H) : new Float32Array(0);
  if (esCanvas(f)) {
    const d = f.getContext('2d', { willReadFrequently: true })!.getImageData(X, Y, W, H).data;
    for (let i = 0; i < L.length; i++) {
      L[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2];
      if (conC) C[i] = d[4 * i + 2] - d[4 * i];
    }
  } else {
    const d = f.data;
    for (let yy = 0; yy < H; yy++) {
      for (let xx = 0; xx < W; xx++) {
        const o = ((Y + yy) * f.width + X + xx) * 4;
        const i = yy * W + xx;
        L[i] = 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
        if (conC) C[i] = d[o + 2] - d[o];
      }
    }
  }
  return { L, C, w: W, h: H };
}

export function leerLuma(f: Fuente, x: number, y: number, w: number, h: number): Luma {
  const r = leer(f, x, y, w, h, false);
  return { L: r.L, w: r.w, h: r.h };
}

export function leerCanales(f: Fuente, x: number, y: number, w: number, h: number): Canales {
  return leer(f, x, y, w, h, true);
}

// Ampliación bilineal (para casilleros pequeños: el umbral y el contorno salen menos escalonados).
export function ampliar(canal: Float32Array, w: number, h: number, f: number): { d: Float32Array; w: number; h: number } {
  if (f <= 1 || !w || !h) return { d: canal, w, h };
  const W = w * f;
  const H = h * f;
  const d = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const sy = Math.min(h - 1, Math.max(0, (y + 0.5) / f - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(h - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < W; x++) {
      const sx = Math.min(w - 1, Math.max(0, (x + 0.5) / f - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(w - 1, x0 + 1);
      const fx = sx - x0;
      const a = canal[y0 * w + x0] * (1 - fx) + canal[y0 * w + x1] * fx;
      const b = canal[y1 * w + x0] * (1 - fx) + canal[y1 * w + x1] * fx;
      d[y * W + x] = a * (1 - fy) + b * fy;
    }
  }
  return { d, w: W, h: H };
}

// Máscara por luminancia: tinta de cualquier color (y también líneas negras impresas).
export function mascaraLuma(L: Float32Array, fondo: number, fraccion = 0.66): Uint8Array {
  const m = new Uint8Array(L.length);
  for (let i = 0; i < m.length; i++) m[i] = L[i] < fraccion * fondo ? 1 : 0;
  return m;
}

// Máscara de tinta AZUL: croma (B−R) claramente por encima del de la zona y píxel más oscuro que el papel.
// No responde a líneas/puntos negros impresos ni al fondo rosado.
export function mascaraAzul(L: Float32Array, C: Float32Array, fondo: number, medianaC: number, delta: number, lumaMax: number): Uint8Array {
  const m = new Uint8Array(L.length);
  for (let i = 0; i < m.length; i++) m[i] = C[i] - medianaC > delta && L[i] < lumaMax * fondo ? 1 : 0;
  return m;
}

export function percentil(arr: ArrayLike<number>, p: number): number {
  const a = Array.from(arr).sort((x, y) => x - y);
  if (!a.length) return 0;
  const pos = (p / 100) * (a.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(a.length - 1, lo + 1);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

// Quita líneas impresas largas (filas/columnas casi completas de "tinta").
export function quitarLineas(m: Uint8Array, w: number, h: number, umbral: number): void {
  for (let y = 0; y < h; y++) {
    let c = 0;
    for (let x = 0; x < w; x++) c += m[y * w + x];
    if (c / w > umbral) for (let x = 0; x < w; x++) m[y * w + x] = 0;
  }
  for (let x = 0; x < w; x++) {
    let c = 0;
    for (let y = 0; y < h; y++) c += m[y * w + x];
    if (c / h > umbral) for (let y = 0; y < h; y++) m[y * w + x] = 0;
  }
}

// Componentes conexas (8 vecinos). lab[i] = 0 fondo, 1..n = componente.
export function componentes(m: Uint8Array, w: number, h: number) {
  const lab = new Int32Array(w * h);
  const sizes: number[] = [];
  const pila: number[] = [];
  for (let s = 0; s < m.length; s++) {
    if (!m[s] || lab[s]) continue;
    const id = sizes.length + 1;
    let n = 0;
    lab[s] = id;
    pila.push(s);
    while (pila.length) {
      const p = pila.pop()!;
      n++;
      const px = p % w;
      const py = (p - px) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (m[q] && !lab[q]) { lab[q] = id; pila.push(q); }
        }
      }
    }
    sizes.push(n);
  }
  return { lab, n: sizes.length, sizes };
}

// Tinta de escritura en una región (firma, nombres, DNI, observaciones):
// fracción de píxeles notablemente más oscuros que el fondo, sin líneas impresas ni motas.
export function densidadTinta(canvas: Fuente, x: number, y: number, w: number, h: number): number {
  const r = leerLuma(canvas, x, y, w, h);
  if (!r.w || !r.h) return 0;
  const fondo = percentil(r.L, 70);
  const m = new Uint8Array(r.w * r.h);
  for (let i = 0; i < m.length; i++) m[i] = r.L[i] < 0.66 * fondo ? 1 : 0;
  quitarLineas(m, r.w, r.h, 0.6);
  const c = componentes(m, r.w, r.h);
  let n = 0;
  for (let i = 0; i < m.length; i++) if (m[i] && c.sizes[c.lab[i] - 1] >= 12) n++;
  return n / (r.w * r.h);
}

// Referencia de "papel" de una zona (percentil 75: robusto aunque haya muchas celdas negras).
export function papelRef(canvas: Fuente, x: number, y: number, w: number, h: number): number {
  const r = leerLuma(canvas, x, y, w, h);
  const muestra: number[] = [];
  for (let i = 0; i < r.L.length; i += 3) muestra.push(r.L[i]);
  return percentil(muestra, 75) || 200;
}

// Celda "tapada en negro": su brillo mediano es mucho menor que el del papel.
export function celdaNegra(canvas: Fuente, x: number, y: number, w: number, h: number, papel: number) {
  const r = leerLuma(canvas, x + w * 0.1, y + h * 0.1, w * 0.8, h * 0.8);
  if (!r.w) return { negra: false, oscuro: 0 };
  const med = percentil(r.L, 50);
  let osc = 0;
  for (let i = 0; i < r.L.length; i++) if (r.L[i] < 0.62 * papel) osc++;
  return { negra: med < 0.62 * papel, oscuro: osc / r.L.length };
}
