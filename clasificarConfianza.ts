import type { EstadoLectura } from '../types/acta';

// Semáforo de seguridad técnica (según especificación)
export function clasificarConfianza(c: number): EstadoLectura {
  if (c >= 0.9) return 'CONFIABLE';
  if (c >= 0.75) return 'VERIFICACION_ASISTIDA';
  if (c >= 0.6) return 'REVISION_MANUAL';
  if (c >= 0.4) return 'OBSERVADO_TRAZO_DUDOSO';
  return 'CRITICO_BORRON';
}

export const ETIQUETA: Record<EstadoLectura, string> = {
  CONFIABLE: 'CONFIABLE',
  VERIFICACION_ASISTIDA: 'VERIFICACIÓN ASISTIDA',
  REVISION_MANUAL: 'REVISIÓN MANUAL (ILEGIBLE)',
  OBSERVADO_TRAZO_DUDOSO: 'OBSERVADO (TRAZO DUDOSO)',
  CRITICO_BORRON: 'CRÍTICO (BORRÓN / MANCHA)',
};

// Clases completas (literales) para que Tailwind las detecte al compilar.
export const CLASE_BADGE: Record<EstadoLectura, string> = {
  CONFIABLE: 'bg-green-600 text-white',
  VERIFICACION_ASISTIDA: 'bg-green-200 text-green-900',
  REVISION_MANUAL: 'bg-amber-300 text-amber-950',
  OBSERVADO_TRAZO_DUDOSO: 'bg-orange-500 text-white',
  CRITICO_BORRON: 'bg-red-600 text-white',
};

export const CLASE_FILA: Record<EstadoLectura, string> = {
  CONFIABLE: '',
  VERIFICACION_ASISTIDA: 'bg-green-50',
  REVISION_MANUAL: 'bg-amber-50',
  OBSERVADO_TRAZO_DUDOSO: 'bg-orange-50',
  CRITICO_BORRON: 'bg-red-50',
};

export const COLOR_CAJA: Record<EstadoLectura, string> = {
  CONFIABLE: '#16a34a',
  VERIFICACION_ASISTIDA: '#86efac',
  REVISION_MANUAL: '#f59e0b',
  OBSERVADO_TRAZO_DUDOSO: '#f97316',
  CRITICO_BORRON: '#dc2626',
};

// Un estado "pendiente" exige intervención humana (≤ 0.74) salvo que ya se verificó.
export function esPendiente(e: EstadoLectura): boolean {
  return e === 'REVISION_MANUAL' || e === 'OBSERVADO_TRAZO_DUDOSO' || e === 'CRITICO_BORRON';
}
