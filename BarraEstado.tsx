import { useActaStore } from '../store/actaStore';
import { useValidacionActa } from '../hooks/useValidacionActa';
import { ELECCIONES } from '../types/acta';

const BADGE = {
  APROBADA: 'bg-green-600 text-white',
  APROBADA_CON_OBSERVACIONES: 'bg-amber-400 text-amber-950',
  ENVIADA_A_JURADO: 'bg-red-600 text-white',
} as const;

// Resumen siempre visible: estado del acta y si cada elección cuadra con los ciudadanos que votaron.
export default function BarraEstado() {
  const { acta } = useActaStore();
  const r = useValidacionActa(acta);
  if (!acta || !r) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-white p-2 text-xs shadow">
      <span className={`rounded px-2 py-1 font-bold ${BADGE[r.estado]}`}>{r.estado.replace(/_/g, ' ')}</span>
      <span>Votantes: <b>{acta.ciudadanos_votaron}</b></span>
      {ELECCIONES.map((e) => (
        <span key={e} className={`rounded border px-2 py-1 font-semibold ${r.por_eleccion[e].cuadra ? 'border-green-400 bg-green-50 text-green-800' : 'border-red-400 bg-red-50 text-red-800'}`}>
          {r.por_eleccion[e].cuadra ? '✓' : '✗'} {e}: {r.por_eleccion[e].emitidos}/{acta.ciudadanos_votaron}
        </span>
      ))}
      <span className={`rounded border px-2 py-1 font-semibold ${r.firmas === 3 ? 'border-green-400 bg-green-50 text-green-800' : 'border-red-400 bg-red-50 text-red-800'}`}>Firmas {r.firmas}/3</span>
      {r.celdas_pendientes > 0 && <span className="rounded border border-amber-400 bg-amber-50 px-2 py-1 font-semibold text-amber-900">{r.celdas_pendientes} por revisar</span>}
    </div>
  );
}
