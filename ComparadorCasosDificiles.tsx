import { useEffect, useMemo, useState } from 'react';
import { useActaStore } from '../store/actaStore';
import { useOCR } from '../hooks/useOCR';
import { recortar } from '../utils/cropImage';
import { aporte } from '../utils/celdas';
import { CLASE_BADGE, ETIQUETA, clasificarConfianza } from '../utils/clasificarConfianza';
import type { BoundingBox, CeldaVoto, DigitoLeido } from '../types/acta';

const CASILLERO = ['Centena', 'Decena', 'Unidad'];

// Vector 8x8 tal como lo ve el clasificador (negro = tinta).
function Vector8({ v }: { v: number[] }) {
  return (
    <svg viewBox="0 0 8 8" className="h-12 w-12 rounded border bg-white" shapeRendering="crispEdges">
      {v.map((p, i) => <rect key={i} x={i % 8} y={Math.floor(i / 8)} width={1} height={1} fill={`rgb(${Math.round(255 * (1 - p))},${Math.round(255 * (1 - p))},${Math.round(255 * (1 - p))})`} />)}
    </svg>
  );
}

function estadoAuto(c: CeldaVoto): string {
  const e = c.estado_ocr ?? c.estado;
  return e === 'MANUSCRITO' ? String(c.valor_ocr ?? '?') : e === 'VACIA' ? 'VACÍO' : e === 'ANULADA' ? 'NEGRO' : e === 'AMBIGUA' ? `AMBIGUA${c.texto_ocr ? ` «${c.texto_ocr}»` : ''}` : 'ERROR';
}

export default function ComparadorCasosDificiles() {
  const { acta, paginas, paginaActual, seleccion, actualizarCelda } = useActaStore();
  const { releerCelda, ocupado } = useOCR();
  const org = acta?.organizaciones.find((o) => o.id === seleccion?.id);
  const e = seleccion?.eleccion;
  const celda = org && e ? org[e] : undefined;
  const pagina = paginas[paginaActual];

  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [casilleros, setCasilleros] = useState<(string | null)[]>([null, null, null]);
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [zoom, setZoom] = useState(1);
  const [lectura, setLectura] = useState<{ texto: string; valor: number | null; confianza: number; ambiguo: boolean; motivos: string[] } | null>(null);

  useEffect(() => {
    let vivo = true;
    setCanvas(null);
    setCasilleros([null, null, null]);
    setLectura(null);
    setMotivo('');
    setValor(celda && (celda.estado === 'MANUSCRITO' || celda.estado === 'AMBIGUA') && celda.valor != null ? String(celda.valor) : '');
    const b = celda?.bbox;
    if (b && pagina) {
      recortar(pagina.url, b, { margenPx: 12, anchoMin: 360 }).then((c) => vivo && setCanvas(c));
      [0, 1, 2].forEach((k) => {
        const bk: BoundingBox = { x: b.x + (k * b.w) / 3, y: b.y, w: b.w / 3, h: b.h };
        recortar(pagina.url, bk, { margenPx: 3, anchoMin: 120 }).then((c) => vivo && setCasilleros((prev) => prev.map((x, i) => (i === k ? c.toDataURL('image/png') : x))));
      });
    }
    return () => { vivo = false; };
  }, [org?.id, e, pagina?.url]);

  const dataUrl = useMemo(() => (canvas ? canvas.toDataURL('image/png') : null), [canvas]);

  if (!acta || !org || !e || !celda) {
    return (
      <div className="rounded-lg border bg-white p-4 text-sm text-gray-500">
        Comparador de casos difíciles: pulse 🔍 en una celda de la tabla o una caja sobre el visor.
      </div>
    );
  }

  // Comprobación aritmética INFORMATIVA con el valor que la persona escribe. El sistema no propone ni sugiere
  // valores a partir de los totales: una discrepancia es una advertencia, no una pista para «cuadrar».
  const sumaOtras = acta.organizaciones.reduce((s, o) => s + (o.id === org.id ? 0 : aporte(o[e])), 0);
  const fijos = acta[`blanco_${e}`] + acta[`nulos_${e}`] + acta[`impugnados_${e}`];
  const hipotetico = valor === '' ? null : parseInt(valor, 10);
  const suma = hipotetico === null || Number.isNaN(hipotetico) ? null : sumaOtras + hipotetico + fijos;
  const diff = suma === null ? null : suma - acta.ciudadanos_votaron;
  const nivel = clasificarConfianza(celda.confianza);
  const b = celda.bbox;

  const aplicar = () => {
    if (hipotetico === null || Number.isNaN(hipotetico)) return;
    actualizarCelda(org.id, e, { estado: 'MANUSCRITO', valor: hipotetico }, motivo.trim() || 'corrección manual tras revisar el recorte');
  };
  const releer = async () => { if (b) setLectura(await releerCelda(b)); };
  const digito = (k: number): DigitoLeido | undefined => celda.digitos?.find((d) => d.k === k);

  return (
    <div className="rounded-lg border bg-white p-3">
      <h3 className="mb-1 text-sm font-bold text-gray-700">
        Comparador · {org.codigo} {org.nombre_partido} · <span className="uppercase">{e}</span>
      </h3>
      <p className="mb-2 font-mono text-[10px] text-gray-500">
        Fila {(celda.fila ?? acta.organizaciones.indexOf(org)) + 1} · columna {e.toUpperCase()}
        {b && ` · recorte x=${Math.round(b.x)} y=${Math.round(b.y)} w=${Math.round(b.w)} h=${Math.round(b.h)} px`}
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded border p-2">
          <p className="mb-1 text-xs font-semibold">1 · Recorte original y casilleros</p>
          {dataUrl ? (
            <>
              <div className="max-h-40 overflow-auto rounded border bg-gray-50">
                <img src={dataUrl} alt="Recorte de la celda" style={{ width: `${zoom * 100}%`, maxWidth: 'none' }} />
              </div>
              <input type="range" min={1} max={4} step={0.25} value={zoom} onChange={(ev) => setZoom(Number(ev.target.value))} className="mt-1 w-full" />
              <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px]">
                {[0, 1, 2].map((k) => {
                  const d = digito(k);
                  const v = celda.vectores?.[k];
                  return (
                    <div key={k} className="rounded border p-1">
                      <p className="font-semibold text-gray-600">{CASILLERO[k]}</p>
                      {casilleros[k] ? <img src={casilleros[k]!} alt={`Casillero ${CASILLERO[k]}`} className="mx-auto h-12 object-contain" /> : <div className="h-12" />}
                      {v ? <div className="mt-0.5 flex justify-center"><Vector8 v={v} /></div> : <p className="mt-1 text-gray-400">sin trazo</p>}
                      {d && (
                        <p className={`mt-0.5 ${d.acuerdo === false ? 'font-bold text-red-700' : ''}`} title={`Variante: ${d.variante}`}>
                          {d.candidatos.slice(0, 2).map((c) => `${c.digito} (${c.p.toFixed(2)})`).join(' · ')}
                          {d.acuerdo === false && d.alternativa && <span className="block">azul lee {d.alternativa.digito}</span>}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-400">Sin recuadro de lectura.</p>
          )}
        </div>

        <div className="rounded border p-2 text-xs">
          <p className="mb-1 font-semibold">2 · Lectura automática (original, no se modifica)</p>
          <p className="text-2xl font-bold">{estadoAuto(celda)}</p>
          <p>Confianza: {Math.round(celda.confianza * 100)} % <span className="text-gray-400">(sin calibrar)</span> · tinta {(celda.tinta * 100).toFixed(1)} %</p>
          <span className={`mt-1 inline-block rounded px-2 py-0.5 font-semibold ${CLASE_BADGE[nivel]}`}>{ETIQUETA[nivel]}</span>
          {celda.motivos && celda.motivos.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-orange-800">{celda.motivos.map((m) => <li key={m}>{m}</li>)}</ul>
          )}
          <div className="mt-2 rounded bg-gray-50 p-1">
            <p>Valor vigente: <b>{celda.estado === 'MANUSCRITO' ? celda.valor ?? '—' : celda.estado === 'ANULADA' ? 'NEGRO' : celda.estado === 'VACIA' ? 'VACÍO' : celda.estado}</b> · fijado por {celda.origen_valor === 'HUMANO' ? <b>una persona</b> : 'el sistema'}{celda.verificada && ' · verificado'}</p>
            {celda.origen_valor === 'HUMANO' && <p className="text-gray-500">Lectura automática era: {estadoAuto(celda)}</p>}
          </div>
          <button onClick={() => void releer()} disabled={!b || ocupado} className="mt-2 block w-full rounded border px-2 py-1 disabled:opacity-40">
            Re-leer celda (solo dígitos)
          </button>
          {lectura && (
            <p className="mt-1">
              Re-lectura: <b>{lectura.texto || '∅'}</b> ({Math.round(lectura.confianza * 100)} %){lectura.ambiguo && <span className="text-orange-700"> · ambigua</span>}{' '}
              {lectura.valor !== null && <button className="underline" onClick={() => setValor(String(lectura.valor))}>usar</button>}
            </p>
          )}
        </div>

        <div className="rounded border p-2 text-xs">
          <p className="mb-1 font-semibold">3 · Corrección del fiscalizador</p>
          <label className="block font-semibold">Valor visto en el recorte</label>
          <div className="flex gap-1">
            <input type="number" min={0} value={valor} onChange={(ev) => setValor(ev.target.value)} className="w-full rounded border px-1 py-1 font-bold" />
            <button onClick={aplicar} className="rounded bg-blue-800 px-2 py-1 font-semibold text-white">Aplicar</button>
          </div>
          <label className="mt-1 block text-gray-600">Motivo (opcional, queda en la auditoría)</label>
          <input value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder="p. ej. el 7 lleva raya, es un 7" className="w-full rounded border px-1 py-0.5" />
          {suma !== null && diff !== null && (
            <p className="mt-2 rounded bg-gray-100 p-1 text-gray-700">
              Comprobación informativa: con este valor la elección suma <b>{suma}</b> frente a <b>{acta.ciudadanos_votaron}</b> ciudadanos
              ({diff === 0 ? 'coincide' : `diferencia ${diff > 0 ? '+' : ''}${diff}`}). No se corrige nada automáticamente.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
