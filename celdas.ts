import type { CeldaVoto } from '../types/acta';

export const celdaNueva = (): CeldaVoto => ({
  estado: 'VACIA', valor: 0, valor_ocr: null, confianza: 0, tinta: 0, oscuro: 0, verificada: false,
});

// Cuánto suma la celda: solo cuenta si hay número escrito.
// Negro (anulada) y blanco (nadie votó) aportan 0.
export const aporte = (c: CeldaVoto): number => (c.estado === 'MANUSCRITO' ? c.valor ?? 0 : 0);

// Pendiente de revisión humana: confianza < 0.75 y sin verificar.
export const pendiente = (c: CeldaVoto): boolean => !c.verificada && c.confianza < 0.75;
