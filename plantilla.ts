import type { BoundingBox, NombreZona, Zonas } from '../types/acta';
import { leerLuma } from './analizarCelda';

// Organizaciones de la cédula ONPE 4b (Lima). Editables en la tabla.
export const ORGANIZACIONES_4B: string[] = [
  'ALIANZA PARA EL PROGRESO', 'PARTIDO POLÍTICO NACIONAL PERÚ LIBRE', 'JUNTOS POR EL PERÚ',
  'PARTIDO FRENTE DE LA ESPERANZA 2021', 'ACCIÓN POPULAR', 'PARTIDO CÍVICO OBRAS',
  'COALICIÓN TRANSFORMADORA TIERRA VERDE', 'RENOVACIÓN POPULAR PERÚ', 'FE EN EL PERÚ',
  'PARTIDO DEMÓCRATA VERDE', 'ALIANZA REGIONAL POR EL PERÚ', 'PARTIDO POLÍTICO PRIN',
  'PARTIDO POPULAR CRISTIANO - PPC', 'VISIÓN PERÚ', 'FRENTE POPULAR AGRÍCOLA FIA DEL PERÚ',
  'FUERZA POPULAR', 'AVANZA PAÍS - PARTIDO DE INTEGRACIÓN SOCIAL', 'PARTIDO DEMÓCRATA UNIDO PERÚ',
  'PARTIDO PATRIÓTICO DEL PERÚ', 'FUERZA CIUDADANA', 'BATALLA PERÚ', 'PARTIDO PAÍS PARA TODOS',
  'AHORA NACIÓN - AN', 'PROGRESEMOS', 'PARTIDO DEL BUEN GOBIERNO', 'PARTIDO POLÍTICO PUEBLO CONSCIENTE',
  'PARTIDO DEMOCRÁTICO SOMOS PERÚ', 'PARTIDO APRISTA PERUANO', 'PODEMOS PERÚ',
  'ALIANZA ELECTORAL VENCEREMOS', 'PARTIDO MORADO', 'PARTIDO SICREO',
];

export const ETIQUETA_ZONA: Record<NombreZona, string> = {
  votos_provincial: 'Votos · Provincial',
  votos_distrital: 'Votos · Distrital',
  ciudadanos: 'Ciudadanos que votaron',
  observaciones: 'Observaciones',
  miembro_presidente: 'Presidente',
  miembro_secretario: 'Secretario',
  miembro_tercero: '3.er Miembro',
};
export const COLOR_ZONA: Record<NombreZona, string> = {
  votos_provincial: '#2563eb', votos_distrital: '#7c3aed', ciudadanos: '#059669', observaciones: '#6b7280',
  miembro_presidente: '#db2777', miembro_secretario: '#db2777', miembro_tercero: '#db2777',
};
export const ZONAS: NombreZona[] = [
  'votos_provincial', 'votos_distrital', 'ciudadanos', 'miembro_presidente', 'miembro_secretario', 'miembro_tercero', 'observaciones',
];

// Referencia: coordenadas medidas sobre el acta de ejemplo (mesa 057110) rasterizada a 2382×3369 px,
// expresadas respecto del marco del formulario (papel rosado) x=486 y=605 w=1394 h=2164.
const MARCO_REF = { x: 486, y: 605, w: 1394, h: 2164 };
const REF: Record<NombreZona, [number, number, number, number]> = {
  votos_provincial: [1099, 1101, 1221, 2425],
  votos_distrital: [1221, 1101, 1343, 2425],
  miembro_presidente: [1489, 1023, 1811, 1242],
  miembro_secretario: [1489, 1242, 1811, 1436],
  miembro_tercero: [1489, 1436, 1811, 1629],
  ciudadanos: [864, 2551, 957, 2592], // recuadro impreso (3 casilleros)
  observaciones: [583, 2608, 1780, 2711],
};

export function zonasPorDefecto(marco: BoundingBox): Zonas {
  const z = {} as Zonas;
  for (const n of ZONAS) {
    const r = REF[n];
    z[n] = {
      x: marco.x + ((r[0] - MARCO_REF.x) / MARCO_REF.w) * marco.w,
      y: marco.y + ((r[1] - MARCO_REF.y) / MARCO_REF.h) * marco.h,
      w: ((r[2] - r[0]) / MARCO_REF.w) * marco.w,
      h: ((r[3] - r[1]) / MARCO_REF.h) * marco.h,
    };
  }
  return z;
}

// Marco del formulario = recuadro de todo lo que no es fondo blanco (si el escaneo llena la hoja, es la hoja).
export function detectarMarco(canvas: HTMLCanvasElement): BoundingBox {
  const esc = Math.min(1, 500 / canvas.width);
  const s = document.createElement('canvas');
  s.width = Math.max(1, Math.round(canvas.width * esc));
  s.height = Math.max(1, Math.round(canvas.height * esc));
  s.getContext('2d', { willReadFrequently: true })!.drawImage(canvas, 0, 0, s.width, s.height);
  const { L, w, h } = leerLuma(s, 0, 0, s.width, s.height);
  const cols = new Float32Array(w);
  const rows = new Float32Array(h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (L[y * w + x] < 235) { cols[x]++; rows[y]++; }
  const x0 = cols.findIndex((c) => c / h > 0.25);
  const y0 = rows.findIndex((r) => r / w > 0.25);
  let x1 = -1, y1 = -1;
  cols.forEach((c, i) => { if (c / h > 0.25) x1 = i; });
  rows.forEach((r, i) => { if (r / w > 0.25) y1 = i; });
  if (x0 < 0 || y0 < 0 || x1 - x0 < 0.3 * w || y1 - y0 < 0.3 * h) return { x: 0, y: 0, w: canvas.width, h: canvas.height };
  return { x: x0 / esc, y: y0 / esc, w: (x1 - x0 + 1) / esc, h: (y1 - y0 + 1) / esc };
}

// Cajas de la cabecera impresa, relativas a la zona de votos (escala = ancho de las 2 columnas / 244).
export function cajasEncabezado(z: Zonas) {
  const u = (z.votos_distrital.x + z.votos_distrital.w - z.votos_provincial.x) / 244;
  const A = z.votos_provincial;
  const r = (x0: number, y0: number, x1: number, y1: number): BoundingBox =>
    ({ x: A.x + x0 * u, y: A.y + y0 * u, w: (x1 - x0) * u, h: (y1 - y0) * u });
  return {
    mesa: r(-549, -303, -364, -259), electores: r(601, -287, 696, -259),
    departamento: r(-549, -231, -304, -193), provincia: r(-297, -231, 113, -193), distrito: r(123, -231, 696, -193),
  };
}

// Sub-zonas dentro del recuadro de cada miembro de mesa (fracciones del recuadro).
export function subzonasMiembro(b: BoundingBox) {
  const f = (a: number, c: number, d: number, e: number): BoundingBox =>
    ({ x: b.x + b.w * a, y: b.y + b.h * c, w: b.w * (d - a), h: b.h * (e - c) });
  return {
    firma: f(0.08, 0.13, 0.88, 0.4), nombres: f(0.26, 0.52, 0.96, 0.64),
    apellidos: f(0.26, 0.66, 0.96, 0.78), dni: f(0.24, 0.79, 0.96, 0.91),
  };
}
