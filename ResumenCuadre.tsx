import { useActaStore } from '../store/actaStore';
import { useValidacionActa } from '../hooks/useValidacionActa';
import { listarAuditoria } from '../hooks/useAuditoria';
import { exportarActaJSON } from '../utils/exportarActaJSON';
import { ELECCIONES, type CampoNumerico, type CampoTexto } from '../types/acta';

const BADGE = {
  APROBADA: 'bg-green-600 text-white',
  APROBADA_CON_OBSERVACIONES: 'bg-amber-400 text-amber-950',
  ENVIADA_A_JURADO: 'bg-red-600 text-white',
} as const;

const TXT: { campo: CampoTexto; etiqueta: string }[] = [
  { campo: 'mesa', etiqueta: 'N.° mesa' },
  { campo: 'departamento', etiqueta: 'Departamento' },
  { campo: 'provincia', etiqueta: 'Provincia' },
  { campo: 'distrito', etiqueta: 'Distrito' },
];
const COMUNES: { campo: CampoNumerico; etiqueta: string }[] = [
  { campo: 'electores_habiles', etiqueta: 'Electores hábiles' },
  { campo: 'ciudadanos_votaron', etiqueta: 'Ciudadanos que votaron' },
];
const FIJOS = [
  { k: 'blanco', etiqueta: 'En blanco' },
  { k: 'nulos', etiqueta: 'Nulos' },
  { k: 'impugnados', etiqueta: 'Impugnados' },
  { k: 'emitidos_escrito', etiqueta: 'Total emitido (escrito)' },
] as const;

export default function ResumenCuadre() {
  const { acta, setCampoNumerico, setCampoTexto, versiones } = useActaStore();
  const resumen = useValidacionActa(acta);
  if (!acta || !resumen) return null;

  const exportar = async () => exportarActaJSON(acta, resumen, await listarAuditoria(), versiones);
  const campoNum = (campo: CampoNumerico, etiqueta: string) => {
    const c = acta.confianza_campos[campo];
    return (
      <label key={campo} className="text-xs">
        <span className="text-gray-500">{etiqueta}{c !== undefined && c < 0.75 && <b className="text-red-600"> · verificar</b>}</span>
        <input
          type="number" min={0} value={acta[campo]}
          onChange={(ev) => setCampoNumerico(campo, Math.max(0, parseInt(ev.target.value, 10) || 0))}
          className="w-full rounded border px-1 py-0.5 font-bold"
        />
      </label>
    );
  };

  return (
    <div className="space-y-3 rounded-lg border bg-white p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-700">Resumen de cuadre</h3>
        <span className={`rounded px-3 py-1 text-xs font-bold ${BADGE[resumen.estado]}`}>{resumen.estado.replace(/_/g, ' ')}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {TXT.map(({ campo, etiqueta }) => (
          <label key={campo} className="text-xs">
            <span className="text-gray-500">{etiqueta}</span>
            <input value={acta[campo]} onChange={(ev) => setCampoTexto(campo, ev.target.value.toUpperCase())} className="w-full rounded border px-1 py-0.5" />
          </label>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">{COMUNES.map((c) => campoNum(c.campo, c.etiqueta))}</div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {ELECCIONES.map((e) => {
          const r = resumen.por_eleccion[e];
          return (
            <div key={e} className={`space-y-2 rounded border p-2 ${r.cuadra ? 'border-green-400' : 'border-red-400'}`}>
              <p className="text-xs font-bold uppercase">Municipal {e}</p>
              <div className="grid grid-cols-2 gap-2">
                {FIJOS.map((f) => campoNum(`${f.k}_${e}` as CampoNumerico, f.etiqueta))}
              </div>
              <p className="text-xs">Votos válidos: <b>{r.validos}</b></p>
              <p className="text-xs">
                Emitidos: <b className={r.cuadra ? 'text-green-700' : 'text-red-700'}>{r.emitidos}</b>{' · '}
                Diferencia: <b className={r.cuadra ? 'text-green-700' : 'text-red-700'}>{r.diferencia > 0 ? '+' : ''}{r.diferencia}</b>
              </p>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-gray-500">
        Celdas vacías (sin tinta): <b>{resumen.celdas_vacias}</b> — suman 0 en la aritmética, pero no son un 0 leído.
        {resumen.celdas_ambiguas > 0 && <> Ambiguas sin resolver: <b className="text-red-700">{resumen.celdas_ambiguas}</b> (no suman).</>}
      </p>

      {resumen.errores.map((er) => <p key={er} className="rounded border border-red-400 bg-red-100 p-2 text-xs text-red-800">⛔ {er}</p>)}
      {resumen.avisos.map((er) => <p key={er} className="rounded border border-amber-400 bg-amber-100 p-2 text-xs text-amber-900">⚠ {er}</p>)}
      {resumen.estado === 'APROBADA' && (
        <p className="rounded border border-green-400 bg-green-100 p-2 text-xs text-green-800">✓ Acta íntegra: firmas, DNI y aritmética (provincial y distrital) conformes.</p>
      )}

      <button onClick={() => void exportar()} className="w-full rounded bg-gray-800 px-3 py-2 text-sm font-semibold text-white">
        Exportar acta procesada (JSON)
      </button>
    </div>
  );
}
