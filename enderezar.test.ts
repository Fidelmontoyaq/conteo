import { describe, expect, it } from 'vitest';
import { estimarInclinacion, rotarRaster } from './enderezar';
import { BLANCO, ROSADO, crearRaster, lineaH, lineaV, rect, AZUL } from '../test/sintetico';

// Hoja sintética: margen blanco, formulario rosado con tabla de líneas negras y texto.
function hoja() {
  const r = crearRaster(900, 1200, BLANCO);
  rect(r, 100, 120, 700, 960, ROSADO);
  for (let i = 0; i <= 24; i++) lineaH(r, 130, 150 + i * 36, 640, 2);
  for (const x of [130, 330, 450, 570, 770]) lineaV(r, x, 150, 864, 2);
  for (let i = 0; i < 24; i += 2) rect(r, 350, 160 + i * 36, 12, 18, AZUL);
  return r;
}

describe('estimarInclinacion', () => {
  it('hoja recta → sin corrección', () => {
    const e = estimarInclinacion(hoja());
    expect(Math.abs(e.grados)).toBeLessThan(0.25);
    expect(e.aplicar).toBe(false);
  });

  for (const g of [-3, -1.5, 0.8, 2, 4]) {
    it(`detecta ${g}° con error ≤ 0.2° y aplica la corrección`, () => {
      const e = estimarInclinacion(rotarRaster(hoja(), g));
      expect(Math.abs(e.grados - g)).toBeLessThanOrEqual(0.2);
      expect(e.aplicar).toBe(true);
    });
  }

  it('al girar ρ = −α la hoja queda recta (convención de signo coherente)', () => {
    const torcida = rotarRaster(hoja(), 2.5);
    const e = estimarInclinacion(torcida);
    const recta = rotarRaster(torcida, -e.grados);
    expect(Math.abs(estimarInclinacion(recta).grados)).toBeLessThan(0.2);
  });

  it('inclinaciones diminutas (<0.35°) no se tocan', () => {
    expect(estimarInclinacion(rotarRaster(hoja(), 0.2)).aplicar).toBe(false);
  });

  it('una imagen casi vacía no inventa un ángulo', () => {
    expect(estimarInclinacion(crearRaster(400, 400, BLANCO)).aplicar).toBe(false);
  });
});
