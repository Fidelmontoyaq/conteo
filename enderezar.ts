import type { PaginaActa } from '../types/acta';
import { leerLuma, percentil, type Fuente, type RasterRGBA } from './analizarCelda';
import { cargarCanvas } from './cropImage';
import * as U from './umbrales';

// Corrección de ROTACIÓN (inclinación de la hoja). NO corrige perspectiva: sin imágenes reales
// para validarla sería arriesgado (ver README).
//
// Convención: α > 0 = las líneas «horizontales» bajan hacia la derecha (y crece con x).
// Para corregirlo se gira la imagen ρ = −α (mismo sentido que ctx.rotate: positivo = horario).

export interface Inclinacion {
  grados: number; // α estimado
  nitidez: number; // nitidez de líneas con α dividida entre la nitidez con 0° (≥ 1)
  aplicar: boolean; // ¿conviene corregir? (giro mínimo y mejora clara, lejos del borde del rango)
}

// Reduce a ≤ `maxAncho` px por promedio de bloques y devuelve los píxeles oscuros (tinta/líneas).
function oscuros(f: Fuente, maxAncho: number): { xs: number[]; ys: number[] } {
  const full = leerLuma(f, 0, 0, f.width, f.height);
  const s = Math.max(1, Math.ceil(full.w / maxAncho));
  const w = Math.floor(full.w / s);
  const h = Math.floor(full.h / s);
  const L = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let t = 0;
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) t += full.L[(y * s + dy) * full.w + x * s + dx];
    L[y * w + x] = t / (s * s);
  }
  const ref = percentil(L, 75);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (L[y * w + x] < 0.6 * ref) { xs.push(x); ys.push(y); }
  return { xs, ys };
}

// Nitidez del perfil de proyección: si las líneas quedan horizontales, los píxeles se concentran en pocas filas.
function nitidez(xs: number[], ys: number[], grados: number, paso: number): number {
  const a = (grados * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  let minV = Infinity, maxV = -Infinity;
  const v = new Float32Array(xs.length);
  for (let i = 0; i < xs.length; i++) { v[i] = (ys[i] * c - xs[i] * s) / paso; if (v[i] < minV) minV = v[i]; if (v[i] > maxV) maxV = v[i]; }
  const h = new Int32Array(Math.ceil(maxV - minV) + 2);
  for (let i = 0; i < v.length; i++) h[Math.floor(v[i] - minV)]++;
  let sc = 0;
  for (let i = 0; i < h.length; i++) sc += h[i] * h[i];
  return sc;
}

export function estimarInclinacion(f: Fuente): Inclinacion {
  const { xs, ys } = oscuros(f, 700);
  if (xs.length < 200) return { grados: 0, nitidez: 1, aplicar: false };
  // submuestreo para acotar el costo
  const salto = Math.max(1, Math.floor(xs.length / 60000));
  const X = xs.filter((_, i) => i % salto === 0);
  const Y = ys.filter((_, i) => i % salto === 0);
  let mejor = 0, mejorS = -1;
  for (let g = -U.ANGULO_MAX; g <= U.ANGULO_MAX + 1e-9; g += 0.25) {
    const sc = nitidez(X, Y, g, 1);
    if (sc > mejorS) { mejorS = sc; mejor = g; }
  }
  const centro = mejor;
  for (let g = centro - 0.25; g <= centro + 0.25 + 1e-9; g += 0.05) {
    const sc = nitidez(X, Y, g, 1);
    if (sc > mejorS) { mejorS = sc; mejor = g; }
  }
  const s0 = nitidez(X, Y, 0, 1);
  const n = s0 > 0 ? mejorS / s0 : 1;
  const aplicar = Math.abs(mejor) >= U.ANGULO_MIN_APLICAR && Math.abs(mejor) < U.ANGULO_MAX - 0.1 && n >= U.NITIDEZ_MIN_APLICAR;
  return { grados: Math.round(mejor * 100) / 100, nitidez: Math.round(n * 1000) / 1000, aplicar };
}

// Gira un raster ρ grados (positivo = horario) en un lienzo ampliado, con fondo `fondo`. Interpolación bilineal.
export function rotarRaster(r: RasterRGBA, rho: number, fondo: [number, number, number] = [255, 255, 255]): RasterRGBA {
  const rad = (rho * Math.PI) / 180;
  const c = Math.cos(rad), s = Math.sin(rad);
  const W = Math.ceil(r.width * Math.abs(c) + r.height * Math.abs(s));
  const H = Math.ceil(r.width * Math.abs(s) + r.height * Math.abs(c));
  const out = new Uint8ClampedArray(W * H * 4);
  const cx = r.width / 2, cy = r.height / 2;
  for (let yo = 0; yo < H; yo++) for (let xo = 0; xo < W; xo++) {
    const qx = xo + 0.5 - W / 2, qy = yo + 0.5 - H / 2;
    // inverso: p = R(−ρ)·q
    const px = qx * c + qy * s + cx - 0.5;
    const py = -qx * s + qy * c + cy - 0.5;
    const o = (yo * W + xo) * 4;
    const x0 = Math.floor(px), y0 = Math.floor(py);
    if (x0 < -1 || y0 < -1 || x0 >= r.width || y0 >= r.height) { out[o] = fondo[0]; out[o + 1] = fondo[1]; out[o + 2] = fondo[2]; out[o + 3] = 255; continue; }
    const fx = px - x0, fy = py - y0;
    for (let k = 0; k < 3; k++) {
      const g = (x: number, y: number) => (x < 0 || y < 0 || x >= r.width || y >= r.height ? fondo[k] : r.data[(y * r.width + x) * 4 + k]);
      out[o + k] = g(x0, y0) * (1 - fx) * (1 - fy) + g(x0 + 1, y0) * fx * (1 - fy) + g(x0, y0 + 1) * (1 - fx) * fy + g(x0 + 1, y0 + 1) * fx * fy;
    }
    out[o + 3] = 255;
  }
  return { width: W, height: H, data: out };
}

// Versión para <canvas> (navegador): mismo sentido de giro que rotarRaster. Fondo blanco: queda fuera del marco del acta.
export function rotarCanvas(src: HTMLCanvasElement, rho: number): HTMLCanvasElement {
  const rad = (rho * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad));
  const out = document.createElement('canvas');
  out.width = Math.ceil(src.width * c + src.height * s);
  out.height = Math.ceil(src.width * s + src.height * c);
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(rad);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

// Endereza una página si hace falta. La imagen original se conserva intacta; las coordenadas de zonas y celdas
// serán sobre la imagen de trabajo (la enderezada, salvo que la persona pida usar la original).
export async function enderezarPagina(p: PaginaActa): Promise<PaginaActa> {
  const canvas = await cargarCanvas(p.url);
  const est = estimarInclinacion(canvas);
  if (!est.aplicar) return { ...p, rotacion_grados: 0, nitidez_rotacion: est.nitidez };
  const rot = rotarCanvas(canvas, -est.grados);
  const blob = await new Promise<Blob>((res, rej) => rot.toBlob((b) => (b ? res(b) : rej(new Error('toBlob falló'))), 'image/png'));
  const enderezada = { url: URL.createObjectURL(blob), width: rot.width, height: rot.height };
  return {
    ...enderezada, original: { url: p.url, width: p.width, height: p.height }, enderezada,
    rotacion_grados: -est.grados, nitidez_rotacion: est.nitidez, usando_original: false,
  };
}
