import { describe, expect, it } from 'vitest';
import { cer, compararDigitos, emparejar, evaluarActa, resumen, sumar, wer, type ActaEtiquetada } from './metricas';
import type { ActaElectoral, CeldaVoto } from '../types/acta';

const celda = (p: Partial<CeldaVoto>): CeldaVoto => ({ estado: 'VACIA', valor: null, valor_ocr: null, confianza: 0.95, tinta: 0, oscuro: 0, verificada: false, ...p });
const acta = (filas: [CeldaVoto, CeldaVoto][]): ActaElectoral => ({
  organizaciones: filas.map(([p, d], i) => ({ id: String(i), codigo: String(i), nombre_partido: '', provincial: p, distrital: d })),
  hash_sha256: 'h', nombre_archivo: 'a.png', mesa: '1',
} as unknown as ActaElectoral);
const num = (v: number, confianza = 0.95) => celda({ estado: 'MANUSCRITO', estado_ocr: 'MANUSCRITO', valor: v, valor_ocr: v, confianza });
const vacia = () => celda({ estado_ocr: 'VACIA' });
const et = (celdas: ActaEtiquetada['celdas']): ActaEtiquetada => ({ id: 'a.png', celdas });

describe('compararDigitos', () => {
  it('alinea a la derecha y penaliza dígitos de más o de menos', () => {
    expect(compararDigitos(147, 147)).toEqual({ total: 3, correctos: 3 });
    expect(compararDigitos(147, 142)).toEqual({ total: 3, correctos: 2 });
    expect(compararDigitos(47, 147)).toEqual({ total: 3, correctos: 2 });
    expect(compararDigitos(7, null)).toEqual({ total: 1, correctos: 0 });
  });
});

describe('evaluarActa', () => {
  it('cuenta aciertos, errores silenciosos y errores marcados para revisión', () => {
    const a = acta([[num(12), vacia()], [num(5), num(9, 0.5)], [vacia(), num(3)]]);
    const e = et([
      { fila: 0, eleccion: 'provincial', estado: 'MANUSCRITO', valor: 12 }, // ok
      { fila: 0, eleccion: 'distrital', estado: 'VACIA' }, // ok
      { fila: 1, eleccion: 'provincial', estado: 'MANUSCRITO', valor: 6 }, // error SILENCIOSO (conf alta)
      { fila: 1, eleccion: 'distrital', estado: 'MANUSCRITO', valor: 8 }, // error pero marcado (conf 0.5)
      { fila: 2, eleccion: 'provincial', estado: 'MANUSCRITO', valor: 4 }, // falsa vacía
      { fila: 2, eleccion: 'distrital', estado: 'MANUSCRITO', valor: 3 }, // ok
    ]);
    const m = evaluarActa(e, a);
    expect(m).toMatchObject({ celdas: 6, correctas: 3, incorrectas: 3, errores_silenciosos: 2, falsas_vacias: 1, marcadas_revision: 1 });
    expect(resumen(m).exactitud_por_casilla).toBeCloseTo(0.5);
  });

  it('una lectura AMBIGUA es abstención: no cuenta como acierto ni como error', () => {
    const a = acta([[celda({ estado: 'AMBIGUA', estado_ocr: 'AMBIGUA', valor: null, confianza: 0.5 }), vacia()]]);
    const m = evaluarActa(et([{ fila: 0, eleccion: 'provincial', estado: 'MANUSCRITO', valor: 57 }, { fila: 0, eleccion: 'distrital', estado: 'VACIA' }]), a);
    expect(m).toMatchObject({ abstenciones: 1, correctas: 1, incorrectas: 0, marcadas_revision: 1 });
  });

  it('distingue 0 escrito de vacío', () => {
    const a = acta([[vacia(), num(0)]]);
    const m = evaluarActa(et([{ fila: 0, eleccion: 'provincial', estado: 'MANUSCRITO', valor: 0 }, { fila: 0, eleccion: 'distrital', estado: 'VACIA' }]), a);
    expect(m.confusiones_cero_vacio).toBe(2);
  });

  it('detecta sospecha de error de asociación (lee el valor de la fila vecina)', () => {
    const a = acta([[num(12), vacia()], [num(12), vacia()]]); // la fila 1 leyó el 12 de la fila 0
    const m = evaluarActa(et([
      { fila: 0, eleccion: 'provincial', estado: 'MANUSCRITO', valor: 12 }, { fila: 0, eleccion: 'distrital', estado: 'VACIA' },
      { fila: 1, eleccion: 'provincial', estado: 'MANUSCRITO', valor: 30 }, { fila: 1, eleccion: 'distrital', estado: 'VACIA' },
    ]), a);
    expect(m.errores_asociacion).toBe(1);
  });

  it('usa la lectura automática original, no la corrección humana', () => {
    const corregida = celda({ estado: 'MANUSCRITO', estado_ocr: 'MANUSCRITO', valor: 30, valor_ocr: 12, verificada: true });
    const m = evaluarActa(et([{ fila: 0, eleccion: 'provincial', estado: 'MANUSCRITO', valor: 30 }]), acta([[corregida, vacia()]]));
    expect(m.incorrectas).toBe(1);
  });

  it('sumar y resumen agregan varias actas', () => {
    const m1 = evaluarActa(et([{ fila: 0, eleccion: 'provincial', estado: 'MANUSCRITO', valor: 1 }]), acta([[num(1), vacia()]]));
    const m = sumar(m1, m1);
    expect(m.celdas).toBe(2);
    expect(resumen(m).exactitud_por_digito).toBe(1);
  });
});

describe('CER / WER', () => {
  it('calcula distancia de edición por carácter y por palabra', () => {
    expect(cer('LIMA', 'LIMA')).toBe(0);
    expect(cer('LIMA', 'LIMO')).toBeCloseTo(0.25);
    expect(wer('SAN JUAN DE LURIGANCHO', 'SAN JUAN LURIGANCHO')).toBeCloseTo(0.25);
    expect(cer('', '')).toBe(0);
  });
});

describe('emparejar', () => {
  it('por hash, luego mesa, luego nombre de archivo', () => {
    const a = acta([]);
    expect(emparejar([{ id: 'x', hash_sha256: 'h', celdas: [] }], a)?.id).toBe('x');
    expect(emparejar([{ id: 'y', mesa: '1', celdas: [] }], a)?.id).toBe('y');
    expect(emparejar([{ id: 'a.png', celdas: [] }], a)?.id).toBe('a.png');
  });
});
