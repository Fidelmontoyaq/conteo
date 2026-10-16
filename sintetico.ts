// Generador de imágenes sintéticas para pruebas (sin DOM): rasters RGBA en memoria.
// Los dígitos se reconstruyen a partir de vectores 8x8 reales (SEMILLAS), no de fuentes inventadas.
import type { RasterRGBA } from '../utils/analizarCelda';
import { SEMILLAS } from '../utils/modeloDigitos';
import type { BoundingBox } from '../types/acta';

export type RGB = [number, number, number];
export const ROSADO: RGB = [250, 222, 228];
export const BLANCO: RGB = [255, 255, 255];
export const AZUL: RGB = [28, 48, 150];
export const NEGRO: RGB = [20, 20, 22];

export function crearRaster(width: number, height: number, fondo: RGB = ROSADO): RasterRGBA {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) { data[4 * i] = fondo[0]; data[4 * i + 1] = fondo[1]; data[4 * i + 2] = fondo[2]; data[4 * i + 3] = 255; }
  return { width, height, data };
}

export function pixel(r: RasterRGBA, x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= r.width || y >= r.height) return;
  const o = (Math.floor(y) * r.width + Math.floor(x)) * 4;
  r.data[o] = c[0]; r.data[o + 1] = c[1]; r.data[o + 2] = c[2];
}

export function rect(r: RasterRGBA, x: number, y: number, w: number, h: number, c: RGB): void {
  for (let yy = Math.floor(y); yy < Math.floor(y + h); yy++) for (let xx = Math.floor(x); xx < Math.floor(x + w); xx++) pixel(r, xx, yy, c);
}

export function lineaH(r: RasterRGBA, x: number, y: number, w: number, grosor: number, c: RGB = NEGRO): void { rect(r, x, y, w, grosor, c); }
export function lineaV(r: RasterRGBA, x: number, y: number, h: number, grosor: number, c: RGB = NEGRO): void { rect(r, x, y, grosor, h, c); }

// Una semilla real por dígito (la primera con esa etiqueta).
export function semillaDe(d: number, n = 0): number[] {
  const idx = SEMILLAS.Y.map((y, i) => (y === d ? i : -1)).filter((i) => i >= 0);
  return SEMILLAS.X[idx[n % idx.length]];
}

// Dibuja un vector 8x8 como glifo cuadrado de lado `lado` centrado en `cx, cy`.
export function dibujarVector(r: RasterRGBA, v: number[], cx: number, cy: number, lado: number, c: RGB = AZUL): void {
  const x0 = cx - lado / 2;
  const y0 = cy - lado / 2;
  for (let yy = 0; yy < lado; yy++) for (let xx = 0; xx < lado; xx++) {
    const i = Math.min(7, Math.floor((yy / lado) * 8));
    const j = Math.min(7, Math.floor((xx / lado) * 8));
    if (v[i * 8 + j] >= 0.45) pixel(r, x0 + xx, y0 + yy, c);
  }
}

// Escribe un número en una celda de 3 casilleros alineado a la derecha (o en los casilleros indicados).
export function escribirNumero(r: RasterRGBA, box: BoundingBox, digitos: (number | null)[], c: RGB = AZUL, variante = 0): void {
  const bw = box.w / 3;
  const lado = Math.floor(Math.min(bw * 0.6, box.h * 0.6));
  digitos.forEach((d, k) => {
    if (d === null) return;
    dibujarVector(r, semillaDe(d, variante), box.x + k * bw + bw / 2, box.y + box.h / 2, lado, c);
  });
}

// Guías impresas de una celda: caja y divisiones punteadas de los casilleros.
export function guiasCelda(r: RasterRGBA, box: BoundingBox): void {
  lineaH(r, box.x, box.y, box.w, 2);
  lineaH(r, box.x, box.y + box.h - 2, box.w, 2);
  lineaV(r, box.x, box.y, box.h, 2);
  lineaV(r, box.x + box.w - 2, box.y, box.h, 2);
  for (const k of [1, 2]) for (let y = box.y + 2; y < box.y + box.h - 2; y += 6) rect(r, box.x + (k * box.w) / 3, y, 1, 2, NEGRO);
}

// Ruido de escaneo reproducible (generador congruencial), ±amplitud en cada canal.
export function ruido(r: RasterRGBA, amplitud: number, semilla = 12345): void {
  let s = semilla;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < r.width * r.height; i++) {
    const n = Math.round((rnd() - 0.5) * 2 * amplitud);
    for (let k = 0; k < 3; k++) r.data[4 * i + k] = Math.max(0, Math.min(255, r.data[4 * i + k] + n));
  }
}

// ---- Glifos por trazos (polilíneas en un cuadrado unitario, y hacia abajo) ----
// No son «manuscritos reales»: sirven para comprobar que el recorrido de imagen no estropea una forma conocida.
const arco = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 14): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => { const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as [number, number]; });

export const GLIFOS: Record<number, [number, number][][]> = {
  0: [arco(0.5, 0.5, 0.3, 0.46, 0, 360, 28)],
  1: [[[0.3, 0.25], [0.52, 0.04], [0.52, 0.96]]],
  2: [[...arco(0.5, 0.3, 0.3, 0.24, 180, 380, 10), [0.2, 0.96], [0.84, 0.96]]],
  3: [[...arco(0.46, 0.27, 0.3, 0.22, 200, 450, 10), ...arco(0.46, 0.72, 0.34, 0.24, -90, 160, 10)]],
  4: [[[0.66, 0.96], [0.66, 0.04], [0.12, 0.68], [0.92, 0.68]]],
  5: [[[0.8, 0.05], [0.26, 0.05], [0.22, 0.46], ...arco(0.46, 0.68, 0.34, 0.27, -110, 150, 10)]],
  6: [[[0.74, 0.06], [0.4, 0.28], [0.22, 0.68]], arco(0.5, 0.7, 0.28, 0.26, 0, 360, 20)],
  7: [[[0.14, 0.08], [0.86, 0.08], [0.4, 0.96]]],
  8: [arco(0.5, 0.27, 0.25, 0.22, 0, 360, 20), arco(0.5, 0.72, 0.3, 0.25, 0, 360, 20)],
  9: [arco(0.5, 0.32, 0.27, 0.26, 0, 360, 20), [[0.77, 0.32], [0.6, 0.96]]],
};

function segmento(r: RasterRGBA, x0: number, y0: number, x1: number, y1: number, grosor: number, c: RGB): void {
  const pasos = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1;
  for (let i = 0; i <= pasos; i++) {
    const t = i / pasos;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    for (let dy = -grosor / 2; dy <= grosor / 2; dy++) for (let dx = -grosor / 2; dx <= grosor / 2; dx++) if (dx * dx + dy * dy <= (grosor / 2) ** 2 + 0.25) pixel(r, x + dx, y + dy, c);
  }
}

// Dibuja un glifo en un cuadrado de lado `lado` centrado en (cx, cy). Devuelve su máscara binaria (para comparar).
export function dibujarGlifo(r: RasterRGBA, d: number, cx: number, cy: number, lado: number, c: RGB = AZUL, grosorRel = 0.11): void {
  const x0 = cx - lado / 2;
  const y0 = cy - lado / 2;
  const g = Math.max(2, Math.round(lado * grosorRel));
  for (const poli of GLIFOS[d]) for (let i = 0; i + 1 < poli.length; i++) {
    segmento(r, x0 + poli[i][0] * lado, y0 + poli[i][1] * lado, x0 + poli[i + 1][0] * lado, y0 + poli[i + 1][1] * lado, g, c);
  }
}

export function escribirGlifos(r: RasterRGBA, box: BoundingBox, digitos: (number | null)[], c: RGB = AZUL, lado?: number): void {
  const bw = box.w / 3;
  const L = lado ?? Math.floor(Math.min(bw * 0.6, box.h * 0.62));
  digitos.forEach((d, k) => { if (d !== null) dibujarGlifo(r, d, box.x + k * bw + bw / 2, box.y + box.h / 2, L, c); });
}
