import { describe, expect, it } from 'vitest';
import { ajustarFilas, cajaValida, diagnosticarGeometria } from './geometria';
import { NEGRO, crearRaster, lineaH, lineaV, rect, AZUL } from '../test/sintetico';

// Tabla sintética: 2 columnas de 120 px, `filas` filas de 30 px, líneas de 2 px.
function tabla(filas: number, opciones: { sinLineas?: boolean; negra?: number } = {}) {
  const r = crearRaster(420, 60 + filas * 30 + 60);
  const z = { x: 100, y: 60, w: 120, h: filas * 30 };
  if (!opciones.sinLineas) {
    for (let i = 0; i <= filas; i++) lineaH(r, 80, z.y + i * 30 - 1, 280, 2);
    for (const x of [100, 220, 340]) lineaV(r, x - 1, z.y, filas * 30, 2);
  }
  if (opciones.negra !== undefined) rect(r, z.x + 2, z.y + opciones.negra * 30 + 2, 116, 26, NEGRO);
  rect(r, 130, z.y + 2 * 30 + 6, 6, 16, AZUL); // algo escrito
  return { r, z };
}

describe('ajustarFilas', () => {
  it('con las filas bien configuradas se ajusta a las líneas y es confiable', () => {
    const { r, z } = tabla(12);
    const d = ajustarFilas(r, z, 12);
    expect(d.metodo).toBe('LINEAS');
    expect(d.confiable).toBe(true);
    expect(d.paso_px).toBeCloseTo(30, 0);
    expect(d.bordes[0]).toBeCloseTo(60, 0);
    expect(d.bordes[12]).toBeCloseTo(420, 0);
  });

  it('una fila de más en la configuración (error de nº de organizaciones) se DETECTA, ya no pasa en silencio', () => {
    const { r, z } = tabla(12);
    const d = ajustarFilas(r, z, 13);
    expect(d.confiable).toBe(false);
    expect(d.motivos.join(' ')).toMatch(/filas/);
    expect(d.filas_estimadas).toBeCloseTo(12, 0);
  });

  it('una fila de menos también se detecta', () => {
    const { r, z } = tabla(12);
    expect(ajustarFilas(r, z, 11).confiable).toBe(false);
  });

  it('recuadro desplazado media fila: los bordes se corrigen hacia las líneas', () => {
    const { r, z } = tabla(12);
    const d = ajustarFilas(r, { ...z, y: z.y + 11 }, 12);
    expect(d.bordes[0]).toBeCloseTo(60, 0);
    expect(Math.abs(d.desplazamiento_filas!)).toBeGreaterThan(0.3);
  });

  it('un relleno negro de celda no se toma por línea', () => {
    const { r, z } = tabla(12, { negra: 5 });
    const d = ajustarFilas(r, z, 12);
    expect(d.confiable).toBe(true);
    expect(d.paso_px).toBeCloseTo(30, 0);
  });

  it('sin líneas detectables: reparto uniforme marcado como NO verificado (no se presenta como válido)', () => {
    const { r, z } = tabla(12, { sinLineas: true });
    const d = ajustarFilas(r, z, 12);
    expect(d.metodo).toBe('UNIFORME');
    expect(d.confiable).toBe(false);
    expect(d.bordes).toHaveLength(13);
  });
});

describe('diagnosticarGeometria', () => {
  it('tabla correcta → confiable', () => {
    const { r, z } = tabla(12);
    const g = diagnosticarGeometria(r, z, { ...z, x: z.x + z.w }, 12);
    expect(g.confiable).toBe(true);
    expect(g.problemas).toEqual([]);
  });

  it('columnas separadas → problema de contigüidad', () => {
    const { r, z } = tabla(12);
    const g = diagnosticarGeometria(r, z, { ...z, x: z.x + z.w + 40 }, 12);
    expect(g.confiable).toBe(false);
    expect(g.problemas.join(' ')).toMatch(/contiguas/);
  });
});

describe('cajaValida', () => {
  it('rechaza recortes fuera de la imagen o minúsculos', () => {
    expect(cajaValida({ x: 10, y: 10, w: 40, h: 30 }, 200, 200)).toBe(true);
    expect(cajaValida({ x: 190, y: 10, w: 40, h: 30 }, 200, 200)).toBe(false);
    expect(cajaValida({ x: 10, y: 10, w: 3, h: 30 }, 200, 200)).toBe(false);
  });
});
