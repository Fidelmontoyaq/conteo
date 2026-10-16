import { useActaStore } from '../store/actaStore';
import type { DiagnosticoFilas, Eleccion } from '../types/acta';

const TITULO: Record<Eleccion, string> = { provincial: 'Provincial', distrital: 'Distrital' };

function Fila({ e, d }: { e: Eleccion; d: DiagnosticoFilas }) {
  return (
    <tr className="border-t">
      <td className="px-1 py-0.5 font-semibold">{TITULO[e]}</td>
      <td className="px-1 py-0.5">{d.metodo === 'LINEAS' ? 'líneas impresas' : <b className="text-red-700">uniforme (sin verificar)</b>}</td>
      <td className="px-1 py-0.5 text-center">{d.lineas_detectadas}/{d.filas_esperadas + 1}</td>
      <td className="px-1 py-0.5 text-center">{d.filas_estimadas ?? '—'} / {d.filas_esperadas}</td>
      <td className="px-1 py-0.5 text-center">{d.paso_px ? d.paso_px.toFixed(1) : '—'} / {d.paso_esperado_px.toFixed(1)}</td>
      <td className="px-1 py-0.5 text-center">{d.desplazamiento_filas ?? '—'}</td>
      <td className="px-1 py-0.5 text-center">{d.confiable ? <span className="text-green-700">✓</span> : <span className="font-bold text-red-700">✗</span>}</td>
    </tr>
  );
}

// Diagnóstico de la rejilla: ¿cada recorte corresponde a su fila y columna? Si no se pudo comprobar, lo dice
// (y la validación del acta lo marca como error) en vez de producir resultados aparentemente válidos.
export default function CalibrarColumnas() {
  const { acta, confirmarAlineacion } = useActaStore();
  const meta = acta?.lectura_meta;
  if (!meta) return null;
  const g = meta.geometria;
  const ok = g.confiable || meta.alineacion_confirmada;

  return (
    <div className={`rounded-lg border p-2 text-xs ${ok ? 'border-green-300 bg-green-50' : 'border-red-400 bg-red-50'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-gray-700">
          Alineación de filas y columnas:{' '}
          {g.confiable ? <span className="text-green-700">verificada contra las líneas impresas</span>
            : meta.alineacion_confirmada ? <span className="text-green-700">confirmada por una persona</span>
              : <span className="text-red-700">NO verificada</span>}
          <span className="ml-2 font-normal text-gray-500">tinta dominante: {meta.tinta_dominante.toLowerCase()} · algoritmo {meta.version_algoritmo}</span>
        </p>
        {!ok && (
          <button onClick={confirmarAlineacion} className="rounded border border-red-500 bg-white px-2 py-0.5 font-semibold text-red-800" title="Úselo solo después de activar ▦ Rejilla en el visor y comprobar que cada fila cae sobre su organización">
            Revisé la rejilla: confirmar
          </button>
        )}
      </div>
      <table className="mt-1 w-full text-left">
        <thead className="text-gray-500">
          <tr><th className="px-1">Columna</th><th className="px-1">Filas por</th><th className="px-1 text-center">Líneas</th><th className="px-1 text-center">Filas medidas / config.</th><th className="px-1 text-center">Paso px (medido / esperado)</th><th className="px-1 text-center">Corrimiento (filas)</th><th className="px-1 text-center">OK</th></tr>
        </thead>
        <tbody><Fila e="provincial" d={g.provincial} /><Fila e="distrital" d={g.distrital} /></tbody>
      </table>
      <p className="mt-1 text-gray-600">
        Bordes de columnas: izq. {g.columnas.desfase_izq_px ?? 'no detectado'} px · der. {g.columnas.desfase_der_px ?? 'no detectado'} px · separación Provincial/Distrital {Math.round(g.columnas.separacion_px)} px
      </p>
      {g.problemas.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-4 text-red-800">{g.problemas.map((p) => <li key={p}>{p}</li>)}</ul>}
      {g.recortes_invalidos.length > 0 && <p className="mt-1 text-red-800">Recortes inválidos: {g.recortes_invalidos.join(', ')}</p>}
      <p className="mt-1 text-gray-500">Active «▦ Rejilla» en el visor para ver las filas tal como se recortaron.</p>
    </div>
  );
}
