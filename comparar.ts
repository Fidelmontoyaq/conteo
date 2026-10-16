import { ELECCIONES, type ActaElectoral, type ActaGuardada, type CeldaVoto } from '../types/acta';
import { validarActa } from '../hooks/useValidacionActa';

export interface Diferencia { clave: string; etiqueta: string; a: string; b: string; cambia: boolean }

export const textoCelda = (c: CeldaVoto): string =>
  c.estado === 'ANULADA' ? 'NEGRO' : c.estado === 'VACIA' ? '—' : c.estado === 'AMBIGUA' ? `AMBIGUA${c.texto_ocr ? ` «${c.texto_ocr}»` : ''}` : c.estado === 'ERROR' ? 'ERROR' : String(c.valor ?? '?');

// Compara dos lecturas del mismo acta (original vs reescrita), campo por campo.
export function compararActas(a: ActaElectoral, b: ActaElectoral): Diferencia[] {
  const d: Diferencia[] = [];
  const add = (clave: string, etiqueta: string, x: string | number, y: string | number) =>
    d.push({ clave, etiqueta, a: String(x), b: String(y), cambia: String(x) !== String(y) });
  add('mesa', 'N.° mesa', a.mesa || '—', b.mesa || '—');
  add('ciudadanos', 'Ciudadanos que votaron', a.ciudadanos_votaron, b.ciudadanos_votaron);
  add('electores', 'Electores hábiles', a.electores_habiles, b.electores_habiles);
  for (const e of ELECCIONES) {
    add(`bl_${e}`, `Blancos · ${e}`, a[`blanco_${e}`], b[`blanco_${e}`]);
    add(`nu_${e}`, `Nulos · ${e}`, a[`nulos_${e}`], b[`nulos_${e}`]);
    add(`im_${e}`, `Impugnados · ${e}`, a[`impugnados_${e}`], b[`impugnados_${e}`]);
    add(`es_${e}`, `Total emitido escrito · ${e}`, a[`emitidos_escrito_${e}`], b[`emitidos_escrito_${e}`]);
  }
  add('firmas', 'Firmas detectadas', a.miembros_mesa.filter((m) => m.firma_detectada).length, b.miembros_mesa.filter((m) => m.firma_detectada).length);
  const n = Math.max(a.organizaciones.length, b.organizaciones.length);
  for (let i = 0; i < n; i++) {
    const oa = a.organizaciones[i];
    const ob = b.organizaciones[i];
    const nombre = `${(oa ?? ob).codigo} ${(oa ?? ob).nombre_partido}`.trim();
    for (const e of ELECCIONES) add(`o${i}_${e}`, `${nombre} · ${e}`, oa ? textoCelda(oa[e]) : '∅', ob ? textoCelda(ob[e]) : '∅');
  }
  return d;
}

export interface EstadoCuadre { etiqueta: string; provincial: boolean; distrital: boolean; ambas: boolean; dif_prov: number; dif_dist: number }

export function estadoCuadre(v: { etiqueta: string; acta: ActaElectoral }): EstadoCuadre {
  const r = validarActa(v.acta).por_eleccion;
  return {
    etiqueta: v.etiqueta, provincial: r.provincial.cuadra, distrital: r.distrital.cuadra,
    ambas: r.provincial.cuadra && r.distrital.cuadra, dif_prov: r.provincial.diferencia, dif_dist: r.distrital.diferencia,
  };
}

export function veredicto(versiones: ActaGuardada[], actual: ActaElectoral | null, etiquetaActual: string): string {
  const todas = [...versiones.map((v) => ({ etiqueta: v.etiqueta, acta: v.acta })), ...(actual ? [{ etiqueta: etiquetaActual, acta: actual }] : [])];
  const est = todas.map(estadoCuadre);
  const ok = est.filter((e) => e.ambas).map((e) => e.etiqueta);
  if (est.length < 2) return 'Suba otra acta (la misma, reescrita) para compararla con esta.';
  if (ok.length === est.length) return `Cuadran TODAS las actas (${ok.join(', ')}).`;
  if (ok.length === 0) return 'Ninguna de las actas cuadra: la cantidad de votantes no coincide con los votos sumados. Se requiere otra acta o recuento.';
  return `Cuadra el acta ${ok.join(' y ')}. No cuadra: ${est.filter((e) => !e.ambas).map((e) => e.etiqueta).join(', ')}.`;
}
