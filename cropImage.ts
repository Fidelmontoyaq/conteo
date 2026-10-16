import type { BoundingBox } from '../types/acta';

export function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
    img.src = url;
  });
}

export async function cargarCanvas(url: string): Promise<HTMLCanvasElement> {
  const img = await cargarImagen(url);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d', { willReadFrequently: true })!.drawImage(img, 0, 0);
  return canvas;
}

// Recorta una región (con margen) y la escala para que sea legible al comparar.
export async function recortar(
  url: string,
  box: BoundingBox,
  opts: { margenPx?: number; anchoMin?: number } = {},
): Promise<HTMLCanvasElement> {
  const img = await cargarImagen(url);
  const m = opts.margenPx ?? 20;
  const x = Math.max(0, Math.floor(box.x - m));
  const y = Math.max(0, Math.floor(box.y - m));
  const w = Math.min(img.naturalWidth - x, Math.ceil(box.w + 2 * m));
  const h = Math.min(img.naturalHeight - y, Math.ceil(box.h + 2 * m));
  const escala = Math.max(1, (opts.anchoMin ?? 320) / Math.max(1, w));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * escala));
  canvas.height = Math.max(1, Math.round(h * escala));
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, x, y, w, h, 0, 0, canvas.width, canvas.height);
  return canvas;
}
