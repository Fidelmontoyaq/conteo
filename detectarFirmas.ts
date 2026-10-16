import type { BoundingBox } from '../types/acta';

export interface ResultadoFirma {
  densidad: number;
  detectada: boolean;
  confianza: number;
}

// Análisis forense simple: proporción de píxeles oscuros dentro de la ROI.
// - Una línea impresa vacía aporta < 0.4 % de tinta.
// - Una firma manuscrita típica aporta entre 1 % y 8 %.
// Zona gris (0.4 %–1.2 %): trazo dudoso → no se da por firmada, confianza media.
export function detectarFirmas(canvas: HTMLCanvasElement, roi: BoundingBox): ResultadoFirma {
  const x = Math.max(0, Math.floor(roi.x));
  const y = Math.max(0, Math.floor(roi.y));
  const w = Math.min(canvas.width - x, Math.floor(roi.w));
  const h = Math.min(canvas.height - y, Math.floor(roi.h));
  if (w <= 0 || h <= 0) return { densidad: 0, detectada: false, confianza: 0 };

  const { data } = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(x, y, w, h);
  let oscuros = 0;
  const total = w * h;
  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (luma < 120) oscuros++;
  }
  const densidad = oscuros / total;

  if (densidad < 0.004) return { densidad, detectada: false, confianza: 0.9 };
  if (densidad < 0.012) return { densidad, detectada: false, confianza: 0.5 };
  return { densidad, detectada: true, confianza: Math.min(0.95, 0.6 + densidad * 15) };
}
