import type { CeldaVoto } from '../types/acta';
import { UMBRAL_PENDIENTE } from './umbrales';

// Celda sin lectura: VACÍA con valor null. Un 0 solo existe si se reconoció un 0 (estado MANUSCRITO).
export const celdaNueva = (): CeldaVoto => ({
  estado: 'VACIA', valor: null, valor_ocr: null, confianza: 0, tinta: 0, oscuro: 0, verificada: false,
});

// Cuánto suma la celda en la ARITMÉTICA: solo cuenta si hay número escrito.
// Negro (anulada), vacía y ambigua aportan 0 aquí, pero la validación las informa por separado:
// que aporten 0 a la suma no significa que su valor sea 0.
export const aporte = (c: CeldaVoto): number => (c.estado === 'MANUSCRITO' ? c.valor ?? 0 : 0);

export const esIncierta = (c: CeldaVoto): boolean => c.estado === 'AMBIGUA' || c.estado === 'ERROR';

// Pendiente de revisión humana: ambigua/error, o confianza baja, y sin verificar.
export const pendiente = (c: CeldaVoto): boolean => !c.verificada && (esIncierta(c) || c.confianza < UMBRAL_PENDIENTE);
