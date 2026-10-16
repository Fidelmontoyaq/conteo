import { useActaStore } from '../store/actaStore';
import { useOCR } from '../hooks/useOCR';
import { COLOR_ZONA, ETIQUETA_ZONA, ZONAS } from '../utils/plantilla';

// Zonas de trabajo = los recuadros por donde se lee. Se detectan solas y se ajustan a mano, antes o después de leer.
export default function PanelZonas() {
  const { zonas, zonaActiva, setZonaActiva, nOrganizaciones, setNOrg, procesando, acta, vincularVotos, setVincularVotos, autoRelectura, setAutoRelectura } = useActaStore();
  const { detectarZonas, releerZonas } = useOCR();
  if (!zonas) return null;

  return (
    <div className="rounded-lg border bg-white p-2 text-xs">
      <div className="flex flex-wrap items-center gap-1">
        <span className="font-bold text-gray-700">Recuadros de lectura:</span>
        {ZONAS.map((n) => (
          <button key={n} disabled={procesando} onClick={() => setZonaActiva(zonaActiva === n ? null : n)}
            className="rounded border px-2 py-0.5 font-semibold disabled:opacity-40"
            style={{ borderColor: COLOR_ZONA[n], background: zonaActiva === n ? COLOR_ZONA[n] : '#fff', color: zonaActiva === n ? '#fff' : COLOR_ZONA[n] }}>
            ✎ {ETIQUETA_ZONA[n]}
          </button>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-700">
        <label className="flex items-center gap-1">N.° organizaciones
          <input type="number" min={1} max={60} value={nOrganizaciones} onChange={(e) => setNOrg(Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 1)))} className="w-12 rounded border px-1 py-0.5 text-center font-bold" />
        </label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={vincularVotos} onChange={(e) => setVincularVotos(e.target.checked)} /> igualar alto de Provincial y Distrital</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={autoRelectura} onChange={(e) => setAutoRelectura(e.target.checked)} /> re-leer al soltar</label>
        <button disabled={procesando} onClick={() => void detectarZonas()} className="rounded border px-2 py-0.5 disabled:opacity-40">Detectar automáticamente</button>
        <button disabled={procesando || !acta} onClick={() => void releerZonas()} className="rounded bg-blue-800 px-2 py-0.5 font-semibold text-white disabled:opacity-40">Re-leer con estos recuadros</button>
      </div>
      {!acta && <p className="mt-1 text-gray-500">Elija un recuadro y estírelo por lados y esquinas hasta cubrir su zona; luego pulse «Leer acta». Puede volver a ajustarlo después de leer: lo ya verificado se conserva.</p>}
    </div>
  );
}
