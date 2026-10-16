import { useEffect, useMemo, useState } from 'react';
import { useActaStore } from '../store/actaStore';
import { compararActas, estadoCuadre, textoCelda, veredicto } from '../utils/comparar';
import { recortar } from '../utils/cropImage';
import { ELECCIONES, type ActaGuardada, type BoundingBox, type CampoNumerico, type Eleccion, type NombreZona } from '../types/acta';

type Tipo = '' | 'celda' | 'fila' | 'ciudadanos' | 'miembro' | 'observaciones';
type Fila = 'blanco' | 'nulos' | 'impugnados' | 'emitidos_escrito';
const NOMBRE_FILA: Record<Fila, string> = { blanco: 'Votos en blanco', nulos: 'Votos nulos', impugnados: 'Votos impugnados', emitidos_escrito: 'Total emitido (escrito)' };
const MIEMBROS: { z: NombreZona; t: string }[] = [
  { z: 'miembro_presidente', t: 'Presidente' }, { z: 'miembro_secretario', t: 'Secretario' }, { z: 'miembro_tercero', t: '3.er Miembro' },
];

interface Objetivo { tipo: Tipo; org: number; e: Eleccion; fila: Fila; miembro: NombreZona }

// Recuadro del objetivo elegido, en las coordenadas de la imagen de ESA versión del acta.
function caja(v: ActaGuardada, o: Objetivo): BoundingBox | null {
  const z = v.zonas;
  if (o.tipo === 'celda') return v.acta.organizaciones[o.org]?.[o.e].bbox ?? null;
  if (!z) return null;
  if (o.tipo === 'ciudadanos') return z.ciudadanos;
  if (o.tipo === 'miembro') return z[o.miembro];
  if (o.tipo === 'observaciones') return z.observaciones;
  if (o.tipo === 'fila') {
    const zz = z[o.e === 'provincial' ? 'votos_provincial' : 'votos_distrital'];
    const n = v.acta.organizaciones.length;
    const rh = zz.h / (n + 4);
    const idx = n + (['blanco', 'nulos', 'impugnados', 'emitidos_escrito'] as Fila[]).indexOf(o.fila);
    return { x: zz.x, y: zz.y + idx * rh, w: zz.w, h: rh };
  }
  return null;
}

function valorTexto(v: ActaGuardada, o: Objetivo): string {
  const a = v.acta;
  if (o.tipo === 'celda') { const c = a.organizaciones[o.org]?.[o.e]; return c ? textoCelda(c) : '∅'; }
  if (o.tipo === 'fila') return String(a[`${o.fila}_${o.e}` as CampoNumerico]);
  if (o.tipo === 'ciudadanos') return String(a.ciudadanos_votaron);
  if (o.tipo === 'miembro') { const m = a.miembros_mesa[MIEMBROS.findIndex((x) => x.z === o.miembro)]; return m ? `firma ${m.firma_detectada ? '✓' : '✗'} · datos ${m.datos_presentes ? '✓' : '✗'} · DNI ${m.dni_presente ? '✓' : '✗'}` : '∅'; }
  return a.observaciones_escritas ? 'hay texto' : 'sin texto';
}

export default function ComparadorActas() {
  const { versiones, acta, archivo, paginas, paginaActual, zonas, quitarVersion, seleccion, actualizarCelda, setCampoNumerico } = useActaStore();
  const etiquetaActual = String.fromCharCode(65 + versiones.length);
  const todas: ActaGuardada[] = useMemo(
    () => [...versiones, ...(acta && archivo ? [{ id: 'actual', etiqueta: etiquetaActual, archivo, acta, paginas, paginaActual, zonas }] : [])],
    [versiones, acta, archivo, etiquetaActual, paginas, paginaActual, zonas],
  );
  const [ia, setIa] = useState<number | null>(null);
  const [ib, setIb] = useState<number | null>(null);
  const [soloDif, setSoloDif] = useState(true);
  const [obj, setObj] = useState<Objetivo>({ tipo: '', org: 0, e: 'provincial', fila: 'blanco', miembro: 'miembro_presidente' });
  const [fotos, setFotos] = useState<Record<string, string>>({});

  // Si hay una celda seleccionada en la tabla, se propone compararla (opcional: se puede cambiar o quitar).
  useEffect(() => {
    if (!seleccion || !acta) return;
    const i = acta.organizaciones.findIndex((o) => o.id === seleccion.id);
    if (i >= 0) setObj((o) => ({ ...o, tipo: 'celda', org: i, e: seleccion.eleccion }));
  }, [seleccion?.id, seleccion?.eleccion]);

  const a = Math.min(ia ?? Math.max(0, todas.length - 2), Math.max(0, todas.length - 1));
  const b = Math.min(ib ?? todas.length - 1, Math.max(0, todas.length - 1));
  const A = todas[a];
  const B = todas[b];

  const claveFoto = obj.tipo && A && B ? [obj.tipo, obj.org, obj.e, obj.fila, obj.miembro, A.id, B.id, JSON.stringify(caja(A, obj)), JSON.stringify(caja(B, obj))].join('|') : '';
  useEffect(() => {
    let vivo = true;
    setFotos({});
    if (!claveFoto || !A || !B) return;
    void Promise.all([A, B].map(async (v) => {
      const bx = caja(v, obj);
      const pag = v.paginas[v.paginaActual];
      if (!bx || !pag) return [v.id, ''] as const;
      const m = obj.tipo === 'celda' || obj.tipo === 'fila' ? Math.round(bx.h * 0.25) : 0;
      const c = await recortar(pag.url, bx, { margenPx: m, anchoMin: obj.tipo === 'celda' || obj.tipo === 'fila' ? 420 : 560 });
      return [v.id, c.toDataURL('image/jpeg', 0.9)] as const;
    })).then((r) => vivo && setFotos(Object.fromEntries(r)));
    return () => { vivo = false; };
  }, [claveFoto]);

  if (!todas.length) {
    return <div className="rounded-lg border bg-white p-4 text-sm text-gray-500">Aún no hay actas. Lea un acta; si no cuadra, cargue la misma acta reescrita y aquí se compararán.</div>;
  }
  const diffs = todas.length >= 2 ? compararActas(A.acta, B.acta) : [];
  const mostrar = soloDif ? diffs.filter((d) => d.cambia) : diffs;

  // Copia el valor de una versión al acta actual (útil cuando una celda está borrosa en la actual).
  const adoptar = (v: ActaGuardada) => {
    if (!acta || v.id === 'actual') return;
    if (obj.tipo === 'celda') {
      const src = v.acta.organizaciones[obj.org]?.[obj.e];
      const dest = acta.organizaciones[obj.org];
      if (src && dest) actualizarCelda(dest.id, obj.e, { estado: src.estado, valor: src.valor });
    } else if (obj.tipo === 'fila') {
      const k = `${obj.fila}_${obj.e}` as CampoNumerico;
      setCampoNumerico(k, v.acta[k]);
    } else if (obj.tipo === 'ciudadanos') setCampoNumerico('ciudadanos_votaron', v.acta.ciudadanos_votaron);
  };
  const puedeAdoptar = obj.tipo === 'celda' || obj.tipo === 'fila' || obj.tipo === 'ciudadanos';

  return (
    <div className="space-y-3 rounded-lg border bg-white p-3">
      <p className={`rounded border p-2 text-sm font-semibold ${todas.length < 2 ? 'border-gray-300 bg-gray-50 text-gray-600' : todas.some((t) => estadoCuadre(t).ambas) ? 'border-green-400 bg-green-50 text-green-800' : 'border-red-400 bg-red-50 text-red-800'}`}>
        {veredicto(versiones, acta, etiquetaActual)}
      </p>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {todas.map((t) => {
          const e = estadoCuadre(t);
          return (
            <div key={t.id} className={`rounded border p-2 text-xs ${e.ambas ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'}`}>
              <p className="font-bold">Acta {t.etiqueta}{t.id === 'actual' ? ' (actual)' : ''} · mesa {t.acta.mesa || 'sin mesa'}</p>
              <p className="truncate text-gray-600">{t.archivo.nombre}</p>
              <p>Ciudadanos que votaron: <b>{t.acta.ciudadanos_votaron}</b></p>
              <p className={e.provincial ? 'text-green-700' : 'text-red-700'}>{e.provincial ? '✓' : '✗'} Provincial {e.provincial ? 'cuadra' : `no cuadra (${e.dif_prov > 0 ? '+' : ''}${e.dif_prov})`}</p>
              <p className={e.distrital ? 'text-green-700' : 'text-red-700'}>{e.distrital ? '✓' : '✗'} Distrital {e.distrital ? 'cuadra' : `no cuadra (${e.dif_dist > 0 ? '+' : ''}${e.dif_dist})`}</p>
              {t.id !== 'actual' && <button onClick={() => quitarVersion(t.id)} className="mt-1 underline">quitar versión</button>}
            </div>
          );
        })}
      </div>

      {todas.length >= 2 && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            Comparar
            <select value={a} onChange={(e) => setIa(Number(e.target.value))} className="rounded border px-1 py-0.5">{todas.map((t, i) => <option key={t.id} value={i}>Acta {t.etiqueta}</option>)}</select>
            con
            <select value={b} onChange={(e) => setIb(Number(e.target.value))} className="rounded border px-1 py-0.5">{todas.map((t, i) => <option key={t.id} value={i}>Acta {t.etiqueta}</option>)}</select>
            {A.acta.mesa && B.acta.mesa && A.acta.mesa !== B.acta.mesa && <span className="rounded bg-red-100 px-2 py-0.5 font-semibold text-red-800">⛔ mesas distintas ({A.acta.mesa} ≠ {B.acta.mesa})</span>}
          </div>

          {/* Comparación visual de un recuadro (opcional): para cuando una celda está borrosa en una de las actas */}
          <div className="rounded border bg-gray-50 p-2">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <b>Ver y comparar un recuadro (opcional):</b>
              <select value={obj.tipo} onChange={(e) => setObj({ ...obj, tipo: e.target.value as Tipo })} className="rounded border px-1 py-0.5">
                <option value="">— ninguno —</option>
                <option value="celda">Celda de votos</option>
                <option value="fila">Blancos / nulos / impugnados / total</option>
                <option value="ciudadanos">Ciudadanos que votaron</option>
                <option value="miembro">Firma de miembro de mesa</option>
                <option value="observaciones">Observaciones</option>
              </select>
              {obj.tipo === 'celda' && (
                <>
                  <select value={obj.org} onChange={(e) => setObj({ ...obj, org: Number(e.target.value) })} className="max-w-[16rem] rounded border px-1 py-0.5">
                    {A.acta.organizaciones.map((o, i) => <option key={o.id} value={i}>{o.codigo} {o.nombre_partido}</option>)}
                  </select>
                  <select value={obj.e} onChange={(e) => setObj({ ...obj, e: e.target.value as Eleccion })} className="rounded border px-1 py-0.5">
                    {ELECCIONES.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </>
              )}
              {obj.tipo === 'fila' && (
                <>
                  <select value={obj.fila} onChange={(e) => setObj({ ...obj, fila: e.target.value as Fila })} className="rounded border px-1 py-0.5">
                    {(Object.keys(NOMBRE_FILA) as Fila[]).map((f) => <option key={f} value={f}>{NOMBRE_FILA[f]}</option>)}
                  </select>
                  <select value={obj.e} onChange={(e) => setObj({ ...obj, e: e.target.value as Eleccion })} className="rounded border px-1 py-0.5">
                    {ELECCIONES.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </>
              )}
              {obj.tipo === 'miembro' && (
                <select value={obj.miembro} onChange={(e) => setObj({ ...obj, miembro: e.target.value as NombreZona })} className="rounded border px-1 py-0.5">
                  {MIEMBROS.map((m) => <option key={m.z} value={m.z}>{m.t}</option>)}
                </select>
              )}
            </div>
            {obj.tipo && (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {[A, B].map((v) => (
                  <div key={v.id} className="rounded border bg-white p-2 text-xs">
                    <p className="mb-1 font-bold">Acta {v.etiqueta}{v.id === 'actual' ? ' (actual)' : ''} · lectura: <span className="font-mono">{valorTexto(v, obj)}</span></p>
                    {fotos[v.id] ? <img src={fotos[v.id]} alt={`Recuadro del acta ${v.etiqueta}`} className="w-full rounded border bg-gray-50" /> : <p className="text-gray-400">Sin imagen para este recuadro.</p>}
                    {puedeAdoptar && v.id !== 'actual' && <button onClick={() => adoptar(v)} className="mt-1 rounded border bg-white px-2 py-0.5 font-semibold">Usar este valor en el acta actual</button>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <b>Diferencias entre ambas lecturas</b>
            <label className="ml-auto flex items-center gap-1"><input type="checkbox" checked={soloDif} onChange={(e) => setSoloDif(e.target.checked)} /> solo diferencias ({diffs.filter((d) => d.cambia).length})</label>
          </div>
          <div className="max-h-72 overflow-auto rounded border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-gray-100 uppercase text-gray-700"><tr><th className="px-2 py-1">Campo</th><th className="px-2 py-1 text-center">Acta {A.etiqueta}</th><th className="px-2 py-1 text-center">Acta {B.etiqueta}</th></tr></thead>
              <tbody>
                {mostrar.length === 0 && <tr><td colSpan={3} className="px-2 py-2 text-gray-500">Sin diferencias entre ambas lecturas.</td></tr>}
                {mostrar.map((d) => (
                  <tr key={d.clave} className={`border-t ${d.cambia ? 'bg-amber-50' : ''}`}>
                    <td className="px-2 py-1">{d.etiqueta}</td>
                    <td className="px-2 py-1 text-center font-mono">{d.a}</td>
                    <td className={`px-2 py-1 text-center font-mono ${d.cambia ? 'font-bold text-amber-800' : ''}`}>{d.b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
