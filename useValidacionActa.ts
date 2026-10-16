import { useMemo } from 'react';
import type { ActaElectoral, ResumenValidacion } from '../types/acta';
import { validarActa } from '../utils/validaciones';

// La lógica vive en utils/validaciones.ts (capa independiente del reconocimiento); se re-exporta aquí
// para no romper las importaciones existentes (store, comparador de actas).
export { validarActa };

export function useValidacionActa(acta: ActaElectoral | null): ResumenValidacion | null {
  return useMemo(() => (acta ? validarActa(acta) : null), [acta]);
}
