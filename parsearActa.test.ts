import { describe, expect, it } from 'vitest';
import { leerActa } from './parsearActa';
import { validarActa } from './validaciones';
import { AZUL, NEGRO, crearRaster, escribirGlifos, lineaH, lineaV, rect } from '../test/sintetico';
import type { Zonas } from '../types/acta';

// Acta sintética: nOrg organizaciones + 4 filas de totales; dos columnas de 120 px; filas de 40 px.
const N_ORG = 6;
const FILAS = N_ORG + 4;
const PASO = 40;
const PROV = { x: 100, y: 100, w: 120, h: FILAS * PASO };
const DIST = { x: 220, y: 100, w: 120, h: FILAS * PASO };
const ZONAS: Zonas = {
  votos_provincial: PROV, votos_distrital: DIST,
  ciudadanos: { x: 520, y: 100, w: 120, h: 40 },
  observaciones: { x: 100, y: 600, w: 500, h: 60 },
  miembro_presidente: { x: 380, y: 200, w: 300, h: 120 },
  miembro_secretario: { x: 380, y: 330, w: 300, h: 120 },
  miembro_tercero: { x: 380, y: 460, w: 300, h: 120 },
};
const celda = (col: 'p' | 'd', fila: number) => ({ x: (col === 'p' ? PROV : DIST).x, y: 100 + fila * PASO, w: 120, h: PASO });

function acta() {
  const r = crearRaster(760, 720);
  for (let i = 0; i <= FILAS; i++) lineaH(r, 100, 100 + i * PASO - 1, 240, 2);
  for (const x of [100, 220, 340]) lineaV(r, x - 1, 100, FILAS * PASO, 2);
  return r;
}
const leer = (r: ReturnType<typeof acta>, n = N_ORG) => leerActa(r, ZONAS, n, { hash: 'h', nombre: 'sintetica.png' });

describe('leerActa (acta sintética)', () => {
  it('asocia cada número con SU fila y SU columna, sin pasarse a la vecina', () => {
    const r = acta();
    escribirGlifos(r, celda('p', 3), [null, null, 7]);
    escribirGlifos(r, celda('d', 1), [null, 5, 2]);
    const a = leer(r);
    expect(a.organizaciones[3].provincial.valor).toBe(7);
    expect(a.organizaciones[1].distrital.valor).toBe(52);
    for (const [i, e] of [[2, 'provincial'], [4, 'provincial'], [3, 'distrital'], [1, 'provincial'], [0, 'distrital']] as const) {
      expect(a.organizaciones[i][e].estado).toBe('VACIA');
    }
    expect(a.lectura_meta!.geometria.confiable).toBe(true);
  });

  it('una celda sin tinta es VACÍA con valor null (no un 0), pero un 0 escrito sí es 0', () => {
    const r = acta();
    escribirGlifos(r, celda('p', 2), [null, null, 0]);
    const a = leer(r);
    expect(a.organizaciones[0].provincial).toMatchObject({ estado: 'VACIA', valor: null, valor_ocr: null });
    expect(a.organizaciones[2].provincial).toMatchObject({ estado: 'MANUSCRITO', valor: 0 });
    expect(a.organizaciones[0].provincial.estado_ocr).toBe('VACIA');
  });

  it('celda tapada en negro → ANULADA sin valor', () => {
    const r = acta();
    const c = celda('d', 4);
    rect(r, c.x + 3, c.y + 3, c.w - 6, c.h - 6, NEGRO);
    const a = leer(r);
    expect(a.organizaciones[4].distrital).toMatchObject({ estado: 'ANULADA', valor: null });
  });

  it('hueco entre dígitos → AMBIGUA: no suma y la validación lo exige resolver', () => {
    const r = acta();
    escribirGlifos(r, celda('p', 1), [5, null, 7]);
    escribirGlifos(r, celda('p', 0), [null, null, 3]);
    const a = leer(r);
    const c = a.organizaciones[1].provincial;
    expect(c.estado).toBe('AMBIGUA');
    expect(c.valor).toBeNull();
    expect(c.texto_ocr).toBe('5·7');
    expect(c.motivos?.length).toBeGreaterThan(0);
    const v = validarActa(a);
    expect(v.celdas_ambiguas).toBe(1);
    expect(v.por_eleccion.provincial.validos).toBe(3); // la ambigua NO se inventa
    expect(v.errores.join(' ')).toMatch(/ambigua/i);
  });

  it('nº de organizaciones mal configurado → alineación NO verificada (error visible, no resultados «válidos»)', () => {
    const r = acta();
    escribirGlifos(r, celda('p', 0), [null, null, 3]);
    const a = leer(r, N_ORG + 1);
    expect(a.lectura_meta!.geometria.confiable).toBe(false);
    const v = validarActa(a);
    expect(v.alineacion_ok).toBe(false);
    expect(v.errores.join(' ')).toMatch(/ALINEACIÓN NO VERIFICADA/);
    expect(v.estado).toBe('ENVIADA_A_JURADO');
  });

  it('confirmar la alineación (acción humana) levanta ese error', () => {
    const a = leer(acta(), N_ORG + 1);
    const c = { ...a, lectura_meta: { ...a.lectura_meta!, alineacion_confirmada: true } };
    expect(validarActa(c).alineacion_ok).toBe(true);
  });

  it('acta escrita en azul: un dígito en tinta negra se marca para revisión', () => {
    const r = acta();
    for (let i = 0; i < 5; i++) escribirGlifos(r, celda('p', i), [null, null, 7], AZUL);
    escribirGlifos(r, celda('d', 0), [null, null, 7], NEGRO);
    const a = leer(r);
    expect(a.lectura_meta!.tinta_dominante).toBe('AZUL');
    expect(a.organizaciones[0].provincial.estado).toBe('MANUSCRITO');
    expect(a.organizaciones[0].distrital.estado).toBe('AMBIGUA');
    expect(a.organizaciones[0].distrital.motivos?.join(' ')).toMatch(/azul/);
  });
});

describe('validarActa · no corrige ni inventa', () => {
  it('un valor mayor que los ciudadanos solo genera advertencia; el valor leído no cambia', () => {
    const r = acta();
    escribirGlifos(r, celda('p', 0), [9, 0, 7]);
    escribirGlifos(r, ZONAS.ciudadanos, [null, 5, 7]);
    const a = leer(r);
    expect(a.ciudadanos_votaron).toBe(57);
    const v = validarActa(a);
    expect(v.celdas_sospechosas).toBe(1);
    expect(a.organizaciones[0].provincial.valor).toBe(907);
    expect(v.avisos.join(' ')).toMatch(/más votos que ciudadanos/);
  });

  it('las celdas vacías se cuentan aparte y suman 0 sin presentarse como ceros leídos', () => {
    const a = leer(acta());
    const v = validarActa(a);
    expect(v.celdas_vacias).toBe(N_ORG * 2);
    expect(v.por_eleccion.provincial.validos).toBe(0);
  });
});
