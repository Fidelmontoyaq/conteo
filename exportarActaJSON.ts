import type { ActaElectoral, ActaGuardada, EntradaAuditoria, ResumenValidacion } from '../types/acta';

// Exporta el acta procesada + resultado de validación + log de auditoría (local, sin red).
export function exportarActaJSON(
  acta: ActaElectoral,
  resumen: ResumenValidacion,
  auditoria: EntradaAuditoria[],
  versiones: ActaGuardada[] = [],
): void {
  const payload = {
    version_esquema: '1.1', // 1.1: celdas vacías/negras con valor null; estados AMBIGUA/ERROR; estado_ocr, texto_ocr, digitos, motivos, lectura_meta
    exportado_en: new Date().toISOString(),
    acta,
    resumen_validacion: resumen,
    versiones_anteriores: versiones.map((v) => ({ etiqueta: v.etiqueta, archivo: v.archivo, acta: v.acta })),
    auditoria,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `acta_${acta.mesa || 'sin-mesa'}_${acta.hash_sha256.slice(0, 8)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
