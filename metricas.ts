import type { ActaElectoral, CeldaVoto, Eleccion, EstadoCelda } from '../types/acta';
import { UMBRAL_PENDIENTE } from '../utils/umbrales';

// Métricas de evaluación. Funciones PURAS: comparan una lectura exportada por la app (JSON) con etiquetas hechas a mano.
// Se evalúa la lectura AUTOMÁTICA original (estado_ocr / valor_ocr), no las correcciones humanas.

export type EstadoEtiqueta = 'MANUSCRITO' | 'VACIA' | 'ANULADA';
export interface CeldaEtiqueta { fila: number; eleccion: Eleccion; estado: EstadoEtiqueta; valor?: number }
export interface ActaEtiquetada {
  id: string;
  hash_sha256?: string;
  mesa?: string;
  celdas: CeldaEtiqueta[];
  campos?: Partial<Record<'ciudadanos_votaron' | 'electores_habiles', number>>;
  texto?: Partial<Record<'mesa' | 'departamento' | 'provincia' | 'distrito', string>>;
}

export interface Metricas {
  actas: number;
  celdas: number;
  correctas: number; // estado y valor coinciden con la etiqueta (excluye abstenciones)
  abstenciones: number; // lectura AMBIGUA/ERROR: el sistema no se comprometió
  incorrectas: number;
  errores_silenciosos: number; // incorrectas que NO se marcaron para revisión (lo más grave)
  marcadas_revision: number; // celdas que exigen revisión manual (ambigua/error o confianza < umbral)
  digitos_total: number;
  digitos_correctos: number;
  vacias_etiquetadas: number;
  vacias_mal: number; // etiquetada vacía y leída como otra cosa
  falsas_vacias: number; // etiquetada con número y leída VACÍA (pérdida silenciosa de votos)
  confusiones_cero_vacio: number; // 0 escrito leído como vacío, o vacío leído como 0
  errores_asociacion: number; // la lectura coincide con la etiqueta de la fila vecina o de la otra columna
  sin_lectura: number; // celdas etiquetadas que no aparecen en la lectura
}

export const metricasVacias = (): Metricas => ({
  actas: 0, celdas: 0, correctas: 0, abstenciones: 0, incorrectas: 0, errores_silenciosos: 0, marcadas_revision: 0,
  digitos_total: 0, digitos_correctos: 0, vacias_etiquetadas: 0, vacias_mal: 0, falsas_vacias: 0,
  confusiones_cero_vacio: 0, errores_asociacion: 0, sin_lectura: 0,
});

const estadoAuto = (c: CeldaVoto): EstadoCelda => c.estado_ocr ?? c.estado;
const valorAuto = (c: CeldaVoto): number | null => (c.estado_ocr ? c.valor_ocr : c.valor_ocr ?? c.valor);
export const exigeRevision = (c: CeldaVoto): boolean => estadoAuto(c) === 'AMBIGUA' || estadoAuto(c) === 'ERROR' || c.confianza < UMBRAL_PENDIENTE;

// Dígitos alineados a la derecha (casillero de la unidad con unidad). Un dígito de más o de menos cuenta como error.
export function compararDigitos(etiqueta: number, leido: number | null): { total: number; correctos: number } {
  const a = String(etiqueta);
  const b = leido === null ? '' : String(leido);
  const n = Math.max(a.length, b.length);
  const A = a.padStart(n, ' ');
  const B = b.padStart(n, ' ');
  let ok = 0;
  for (let i = 0; i < n; i++) if (A[i] === B[i]) ok++;
  return { total: n, correctos: ok };
}

const clave = (fila: number, e: Eleccion) => `${fila}|${e}`;

export function evaluarActa(et: ActaEtiquetada, acta: ActaElectoral): Metricas {
  const m = metricasVacias();
  m.actas = 1;
  const leidas = new Map<string, CeldaVoto>();
  acta.organizaciones.forEach((o, i) => { leidas.set(clave(i, 'provincial'), o.provincial); leidas.set(clave(i, 'distrital'), o.distrital); });
  const etiquetas = new Map(et.celdas.map((c) => [clave(c.fila, c.eleccion), c]));
  const otra = (e: Eleccion): Eleccion => (e === 'provincial' ? 'distrital' : 'provincial');

  for (const c of et.celdas) {
    const l = leidas.get(clave(c.fila, c.eleccion));
    m.celdas++;
    if (!l) { m.sin_lectura++; continue; }
    const est = estadoAuto(l);
    const val = valorAuto(l);
    const revision = exigeRevision(l);
    if (revision) m.marcadas_revision++;
    if (c.estado === 'VACIA') m.vacias_etiquetadas++;
    if (c.estado === 'MANUSCRITO') {
      const d = compararDigitos(c.valor ?? 0, est === 'MANUSCRITO' || est === 'AMBIGUA' ? val : null);
      m.digitos_total += d.total; m.digitos_correctos += d.correctos;
    }

    if (est === 'AMBIGUA' || est === 'ERROR') { m.abstenciones++; continue; }
    const ok = est === c.estado && (c.estado !== 'MANUSCRITO' || val === c.valor);
    if (ok) { m.correctas++; continue; }
    m.incorrectas++;
    if (!revision) m.errores_silenciosos++;
    if (c.estado === 'VACIA') m.vacias_mal++;
    if (c.estado === 'MANUSCRITO' && est === 'VACIA') {
      m.falsas_vacias++;
      if (c.valor === 0) m.confusiones_cero_vacio++;
    }
    if (c.estado === 'VACIA' && est === 'MANUSCRITO' && val === 0) m.confusiones_cero_vacio++;
    // Sospecha de error de asociación: lo leído es exactamente lo que dice la etiqueta de una celda vecina distinta de ésta.
    if (est === 'MANUSCRITO' && val !== null) {
      const vecinas = [clave(c.fila - 1, c.eleccion), clave(c.fila + 1, c.eleccion), clave(c.fila, otra(c.eleccion))]
        .map((k) => etiquetas.get(k)).filter((x): x is CeldaEtiqueta => !!x);
      if (vecinas.some((v) => v.estado === 'MANUSCRITO' && v.valor === val && v.valor !== c.valor)) m.errores_asociacion++;
    }
  }
  return m;
}

export function sumar(a: Metricas, b: Metricas): Metricas {
  const out = metricasVacias();
  (Object.keys(out) as (keyof Metricas)[]).forEach((k) => { out[k] = a[k] + b[k]; });
  return out;
}

const pct = (n: number, d: number): number | null => (d ? n / d : null);
export function resumen(m: Metricas) {
  const comprometidas = m.correctas + m.incorrectas;
  return {
    exactitud_por_digito: pct(m.digitos_correctos, m.digitos_total),
    exactitud_por_casilla: pct(m.correctas, comprometidas), // sobre las que el sistema se comprometió
    cobertura: pct(comprometidas, m.celdas - m.sin_lectura), // casillas que no se abstuvo
    tasa_vacias_mal: pct(m.vacias_mal, m.vacias_etiquetadas),
    falsas_vacias: m.falsas_vacias,
    errores_asociacion: m.errores_asociacion,
    errores_silenciosos: m.errores_silenciosos,
    porcentaje_revision_manual: pct(m.marcadas_revision, m.celdas - m.sin_lectura),
  };
}

// ---- Texto (cabecera): CER y WER ----
export function levenshtein<T>(a: ArrayLike<T>, b: ArrayLike<T>): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}
export const cer = (ref: string, hip: string): number => (ref.length ? levenshtein([...ref], [...hip]) / ref.length : hip.length ? 1 : 0);
export const wer = (ref: string, hip: string): number => {
  const r = ref.trim().split(/\s+/).filter(Boolean);
  const h = hip.trim().split(/\s+/).filter(Boolean);
  return r.length ? levenshtein(r, h) / r.length : h.length ? 1 : 0;
};

export function evaluarTexto(et: ActaEtiquetada, acta: ActaElectoral): { cer: number | null; wer: number | null; campos: number } {
  const ks = Object.keys(et.texto ?? {}) as (keyof NonNullable<ActaEtiquetada['texto']>)[];
  if (!ks.length) return { cer: null, wer: null, campos: 0 };
  let c = 0, w = 0;
  for (const k of ks) { c += cer(et.texto![k] ?? '', acta[k] ?? ''); w += wer(et.texto![k] ?? '', acta[k] ?? ''); }
  return { cer: c / ks.length, wer: w / ks.length, campos: ks.length };
}

// Empareja una lectura exportada con su etiqueta por hash, luego por mesa, luego por id = nombre de archivo.
export function emparejar(etiquetas: ActaEtiquetada[], acta: ActaElectoral): ActaEtiquetada | undefined {
  return etiquetas.find((e) => e.hash_sha256 && e.hash_sha256 === acta.hash_sha256)
    ?? etiquetas.find((e) => e.mesa && acta.mesa && e.mesa === acta.mesa)
    ?? etiquetas.find((e) => e.id === acta.nombre_archivo);
}
