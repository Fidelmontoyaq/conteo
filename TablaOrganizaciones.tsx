import { useActaStore } from '../store/actaStore';
import { useValidacionActa } from '../hooks/useValidacionActa';
import { CLASE_BADGE, CLASE_FILA, ETIQUETA, clasificarConfianza } from '../utils/clasificarConfianza';
import { ELECCIONES, type Eleccion, type EstadoCelda, type VotoOrganizacion } from '../types/acta';

const TITULO: Record<Eleccion, string> = { provincial: 'PROVINCIAL', distrital: 'DISTRITAL' };

// Celda compacta: número · estado (Voto / Vacío / Negro) · zoom · confirmar · confianza.
function Celda({ o, e }: { o: VotoOrganizacion; e: Eleccion }) {
  const { actualizarCelda, confirmarCelda, seleccionar, seleccion } = useActaStore();
  const c = o[e];
  const nivel = clasificarConfianza(c.confianza);
  const sel = seleccion?.id === o.id && seleccion.eleccion === e;
  const cambiarEstado = (est: EstadoCelda) =>
    actualizarCelda(o.id, e, est === 'MANUSCRITO' ? { estado: est, valor: c.valor_ocr ?? c.valor } : { estado: est, valor: 0 });

  return (
    <div className={`flex items-center gap-1 rounded px-1 py-0.5 ${CLASE_FILA[nivel]} ${sel ? 'outline outline-2 outline-blue-500' : ''}`}>
      {c.estado === 'ANULADA' ? (
        <span className="w-12 rounded bg-gray-800 py-0.5 text-center text-[10px] font-bold text-white">NEGRO</span>
      ) : (
        <input type="number" min={0} placeholder="0" value={c.estado === 'VACIA' ? '' : c.valor ?? ''}
          onChange={(ev) => ev.target.value === ''
            ? actualizarCelda(o.id, e, c.estado === 'VACIA' ? {} : { valor: null })
            : actualizarCelda(o.id, e, { estado: 'MANUSCRITO', valor: Math.max(0, parseInt(ev.target.value, 10) || 0) })}
          className="w-12 rounded border bg-white px-1 py-0.5 text-center text-sm font-bold" />
      )}
      <select value={c.estado} onChange={(ev) => cambiarEstado(ev.target.value as EstadoCelda)} className="w-[3.6rem] rounded border bg-white py-0.5 text-[10px]" title="Con voto / Vacío = 0 / Negro = no cuenta">
        <option value="MANUSCRITO">Voto</option>
        <option value="VACIA">Vacío</option>
        <option value="ANULADA">Negro</option>
      </select>
      <button onClick={() => seleccionar({ id: o.id, eleccion: e })} className="rounded border bg-white px-1 text-[11px]" title="Ver recorte y comparar">🔍</button>
      <button onClick={() => confirmarCelda(o.id, e)} className="rounded border bg-white px-1 text-[11px]" title="Confirmar valor">✔</button>
      {c.verificada
        ? <span className="rounded bg-blue-600 px-1 text-[10px] font-semibold text-white" title="Verificado por el fiscalizador">✓</span>
        : <span className={`rounded px-1 text-[10px] font-semibold ${CLASE_BADGE[nivel]}`} title={ETIQUETA[nivel]}>{Math.round(c.confianza * 100)}%</span>}
      {c.estado === 'MANUSCRITO' && c.valor_ocr !== null && c.valor_ocr !== c.valor && <span className="text-[10px] text-gray-500" title="Lectura automática original">OCR {c.valor_ocr}</span>}
    </div>
  );
}

export default function TablaOrganizaciones() {
  const { acta, actualizarOrg, agregarOrg, eliminarOrg } = useActaStore();
  const resumen = useValidacionActa(acta);
  if (!acta || !resumen) return null;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-700">Conteo y asignación de votos <span className="font-normal text-gray-500">· Negro = no cuenta · Vacío = nadie votó (0) · Voto = número escrito</span></h3>
        <button onClick={agregarOrg} className="rounded border bg-white px-2 py-0.5 text-xs hover:bg-gray-50">＋ Fila</button>
      </div>
      <div className="overflow-auto rounded border" style={{ height: 'max(420px, calc(100vh - 330px))' }}>
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-gray-100 uppercase text-gray-700">
            <tr>
              <th className="px-1 py-1">N°</th>
              <th className="px-1 py-1">Organización política</th>
              {ELECCIONES.map((e) => <th key={e} className="px-1 py-1 text-center">{TITULO[e]}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {acta.organizaciones.map((o) => (
              <tr key={o.id} className="border-t">
                <td className="px-1 py-0.5"><input value={o.codigo} onChange={(ev) => actualizarOrg(o.id, { codigo: ev.target.value })} className="w-8 rounded border bg-white px-0.5 py-0.5 text-center" /></td>
                <td className="px-1 py-0.5"><input value={o.nombre_partido} placeholder="(sin nombre)" title={o.nombre_partido} onChange={(ev) => actualizarOrg(o.id, { nombre_partido: ev.target.value.toUpperCase() })} className="w-full min-w-[120px] rounded border bg-white px-1 py-0.5 text-[11px]" /></td>
                {ELECCIONES.map((e) => <td key={e} className="px-0.5 py-0.5"><Celda o={o} e={e} /></td>)}
                <td className="px-0.5"><button onClick={() => eliminarOrg(o.id)} className="rounded border bg-white px-1 text-[11px]" title="Eliminar fila">✕</button></td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 bg-gray-100 font-semibold">
            <tr className="border-t"><td colSpan={2} className="px-1 py-0.5">Votos válidos</td>{ELECCIONES.map((e) => <td key={e} className="px-1 py-0.5 text-center">{resumen.por_eleccion[e].validos}</td>)}<td /></tr>
            <tr><td colSpan={2} className="px-1 py-0.5">Blancos · Nulos · Impugnados</td>{ELECCIONES.map((e) => <td key={e} className="px-1 py-0.5 text-center">{acta[`blanco_${e}`]} · {acta[`nulos_${e}`]} · {acta[`impugnados_${e}`]}</td>)}<td /></tr>
            <tr><td colSpan={2} className="px-1 py-0.5">Total emitido (suma)</td>{ELECCIONES.map((e) => <td key={e} className={`px-1 py-0.5 text-center ${resumen.por_eleccion[e].cuadra ? 'text-green-700' : 'text-red-700'}`}>{resumen.por_eleccion[e].emitidos}</td>)}<td /></tr>
            <tr><td colSpan={2} className="px-1 py-0.5">Total emitido ESCRITO en el acta</td>{ELECCIONES.map((e) => <td key={e} className={`px-1 py-0.5 text-center ${resumen.por_eleccion[e].escrito_ok ? 'text-green-700' : 'text-red-700'}`}>{acta[`emitidos_escrito_${e}`]}</td>)}<td /></tr>
            <tr><td colSpan={2} className="px-1 py-0.5">Ciudadanos que votaron · Electores hábiles</td><td colSpan={2} className="px-1 py-0.5 text-center">{acta.ciudadanos_votaron} · {acta.electores_habiles}</td><td /></tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
