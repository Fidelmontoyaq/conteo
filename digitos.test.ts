import { describe, expect, it } from 'vitest';
import { analizarCasillero, clasificarDigito, leerNumeroCelda, normalizar8, opcionesClasificador, ACTA_SEMILLAS } from './digitos';
import { AZUL, NEGRO, crearRaster, escribirGlifos, guiasCelda, rect, ruido, semillaDe } from '../test/sintetico';
import { SEMILLAS } from './modeloDigitos';

// Celda de 3 casilleros de ~40 px: la misma escala de un acta rasterizada a ~2400 px de ancho.
const BOX = { x: 40, y: 30, w: 120, h: 40 };
const lienzo = () => { const r = crearRaster(240, 110); guiasCelda(r, BOX); return r; };
const dist = (a: number[], b: number[]) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));

describe('normalizar8', () => {
  it('conserva la relación de aspecto: un trazo vertical fino no se ensancha', () => {
    const w = 30, h = 40;
    const m = new Uint8Array(w * h);
    for (let y = 5; y < 35; y++) for (let x = 14; x < 17; x++) m[y * w + x] = 1;
    const v = normalizar8(m, w, h);
    const cols = [0, 1, 2, 3, 4, 5, 6, 7].filter((j) => [0, 1, 2, 3, 4, 5, 6, 7].some((i) => v[i * 8 + j] > 0.3));
    expect(cols.length).toBeLessThanOrEqual(3);
  });
});

describe('leerNumeroCelda · estados', () => {
  it('casilla sin tinta → null (vacía), no un 0', () => {
    expect(leerNumeroCelda(lienzo(), BOX)).toBeNull();
  });

  it('un cero escrito es un 0 reconocido, distinto de vacío', () => {
    const r = lienzo();
    escribirGlifos(r, BOX, [null, null, 0]);
    const n = leerNumeroCelda(r, BOX)!;
    expect(n).not.toBeNull();
    expect(n.valor).toBe(0);
    expect(n.texto).toBe('0');
  });

  it('lee un número de tres dígitos alineado a la derecha', () => {
    const r = lienzo();
    escribirGlifos(r, BOX, [9, 0, 7]);
    const n = leerNumeroCelda(r, BOX)!;
    expect(n.texto).toBe('907');
    expect(n.valor).toBe(907);
    expect(n.digitos).toHaveLength(3);
  });

  it('hueco entre dígitos (5·7) → ambiguo y SIN valor numérico (antes se leía 57)', () => {
    const r = lienzo();
    escribirGlifos(r, BOX, [5, null, 7]);
    const n = leerNumeroCelda(r, BOX)!;
    expect(n.ambiguo).toBe(true);
    expect(n.valor).toBeNull();
    expect(n.texto).toBe('5·7');
    expect(n.confianza).toBeLessThanOrEqual(0.5);
  });

  it('dígitos en centena/decena con la unidad vacía → ambiguo (¿57 o 570?)', () => {
    const r = lienzo();
    escribirGlifos(r, BOX, [5, 7, null]);
    const n = leerNumeroCelda(r, BOX)!;
    expect(n.ambiguo).toBe(true);
    expect(n.valor).toBeNull();
  });

  it('un trazo diminuto pero real NO se descarta como vacío: queda como débil/ambiguo', () => {
    const r = lienzo();
    rect(r, BOX.x + 2 * 40 + 18, BOX.y + 14, 3, 7, AZUL);
    expect(analizarCasillero(r, BOX, 2).estado).toBe('DEBIL');
    const n = leerNumeroCelda(r, BOX)!;
    expect(n).not.toBeNull();
    expect(n.ambiguo).toBe(true);
    expect(n.valor).toBeNull();
  });

  it('una mota de 1 píxel sí es ruido: la casilla sigue vacía', () => {
    const r = lienzo();
    rect(r, BOX.x + 2 * 40 + 18, BOX.y + 14, 1, 1, AZUL);
    expect(leerNumeroCelda(r, BOX)).toBeNull();
  });

  it('las guías punteadas y la caja impresas, con ruido de escaneo, no se confunden con escritura', () => {
    const r = lienzo();
    ruido(r, 6);
    expect(leerNumeroCelda(r, BOX)).toBeNull();
  });
});

describe('variantes de tinta (luminancia vs. azul)', () => {
  it('tinta azul: ambas variantes ven el dígito y coinciden', () => {
    const r = lienzo();
    escribirGlifos(r, BOX, [null, null, 3], AZUL);
    const c = analizarCasillero(r, BOX, 2);
    expect(c.luma).not.toBeNull();
    expect(c.azul).not.toBeNull();
    const n = leerNumeroCelda(r, BOX)!;
    expect(n.digitos[0].variante).toBe('AMBAS');
    expect(n.digitos[0].acuerdo).toBe(true);
    expect(n.casilleros_azul).toBe(1);
  });

  it('tinta negra: solo luminancia (la variante azul no responde) y se lee igual', () => {
    const r = lienzo();
    escribirGlifos(r, BOX, [null, null, 3], NEGRO);
    const c = analizarCasillero(r, BOX, 2);
    expect(c.luma).not.toBeNull();
    expect(c.azul).toBeNull();
    const n = leerNumeroCelda(r, BOX)!;
    expect(n.digitos[0].variante).toBe('LUMINANCIA');
    expect(n.casilleros_azul).toBe(0);
  });

  it('un 1 en tinta azul ya no se pierde (la limpieza de líneas lo borraba en luminancia)', () => {
    const r = lienzo();
    escribirGlifos(r, BOX, [null, null, 1], AZUL);
    const n = leerNumeroCelda(r, BOX)!;
    expect(n.texto).toBe('1');
    expect(n.digitos[0].variante).toBe('AZUL');
  });

  it('una barra negra impresa dentro del casillero no genera una lectura azul', () => {
    const r = lienzo();
    rect(r, BOX.x + 2 * 40 + 14, BOX.y + 8, 12, 24, NEGRO);
    expect(analizarCasillero(r, BOX, 2).azul).toBeNull();
  });
});

describe('fidelidad del recorrido de imagen (aislado del clasificador)', () => {
  it('el vector 8×8 extraído se parece al de normalizar8 sobre la máscara conocida del glifo', () => {
    for (const d of [0, 2, 5, 7, 9]) {
      const r = crearRaster(240, 110);
      escribirGlifos(r, BOX, [null, null, d], NEGRO);
      const c = analizarCasillero(r, BOX, 2);
      // máscara «verdad»: píxeles oscuros de la región del casillero
      const x0 = BOX.x + 80, w = 40, y0 = BOX.y, h = BOX.h;
      const m = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = r.data[((y0 + y) * r.width + x0 + x) * 4] < 100 ? 1 : 0;
      expect(dist(c.luma!, normalizar8(m, w, h))).toBeLessThan(0.9);
    }
  });
});

describe('clasificador y exclusión de actas al evaluar', () => {
  it('las semillas se clasifican con su etiqueta (cordura: la red se entrenó con ellas, no es precisión)', () => {
    let ok = 0;
    SEMILLAS.X.forEach((x, i) => { if (clasificarDigito(x).digito === SEMILLAS.Y[i]) ok++; });
    expect(ok / SEMILLAS.X.length).toBeGreaterThan(0.9);
  });

  it('sinAprendizaje + excluir semillas deja la red sola: sin refuerzo de vecinos', () => {
    const x = semillaDe(4);
    opcionesClasificador.excluirActas.add(ACTA_SEMILLAS);
    try {
      const c = clasificarDigito(x);
      expect(c.confianza).toBeCloseTo(c.mlp.p, 10);
      expect(c.digito).toBe(c.mlp.digito);
    } finally { opcionesClasificador.excluirActas.delete(ACTA_SEMILLAS); }
  });

  it('las muestras de un acta excluida no influyen', () => {
    const x = semillaDe(4);
    const base = clasificarDigito(x);
    opcionesClasificador.excluirActas.add(ACTA_SEMILLAS);
    const sin = clasificarDigito(x);
    opcionesClasificador.excluirActas.delete(ACTA_SEMILLAS);
    expect(clasificarDigito(x).confianza).toBeCloseTo(base.confianza, 10);
    expect(sin.confianza).not.toBeCloseTo(base.confianza, 6);
  });
});
