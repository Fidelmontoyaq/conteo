// Utilidades de píxeles (todo relativo al papel de cada escaneo, sin umbrales absolutos).

export interface Luma { L: Float32Array; w: number; h: number }

export function leerLuma(canvas: HTMLCanvasElement, x: number, y: number, w: number, h: number): Luma {
  const X = Math.max(0, Math.floor(x));
  const Y = Math.max(0, Math.floor(y));
  const W = Math.min(canvas.width - X, Math.floor(w));
  const H = Math.min(canvas.height - Y, Math.floor(h));
  if (W <= 0 || H <= 0) return { L: new Float32Array(0), w: 0, h: 0 };
  const d = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(X, Y, W, H).data;
  const L = new Float32Array(W * H);
  for (let i = 0; i < L.length; i++) L[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2];
  return { L, w: W, h: H };
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
export function densidadTinta(canvas: HTMLCanvasElement, x: number, y: number, w: number, h: number): number {
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
export function papelRef(canvas: HTMLCanvasElement, x: number, y: number, w: number, h: number): number {
  const r = leerLuma(canvas, x, y, w, h);
  const muestra: number[] = [];
  for (let i = 0; i < r.L.length; i += 3) muestra.push(r.L[i]);
  return percentil(muestra, 75) || 200;
}

// Celda "tapada en negro": su brillo mediano es mucho menor que el del papel.
export function celdaNegra(canvas: HTMLCanvasElement, x: number, y: number, w: number, h: number, papel: number) {
  const r = leerLuma(canvas, x + w * 0.1, y + h * 0.1, w * 0.8, h * 0.8);
  if (!r.w) return { negra: false, oscuro: 0 };
  const med = percentil(r.L, 50);
  let osc = 0;
  for (let i = 0; i < r.L.length; i++) if (r.L[i] < 0.62 * papel) osc++;
  return { negra: med < 0.62 * papel, oscuro: osc / r.L.length };
}
