import { useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { useActaStore } from '../store/actaStore';
import { useOCR } from '../hooks/useOCR';
import { COLOR_CAJA, clasificarConfianza } from '../utils/clasificarConfianza';
import { COLOR_ZONA, ETIQUETA_ZONA, ZONAS } from '../utils/plantilla';
import { ELECCIONES, type BoundingBox } from '../types/acta';

type Asa = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const ASAS: Asa[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const CURSOR: Record<Asa, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
const MIN = 12; // tamaño mínimo de una zona (px de la imagen)

const posAsa = (b: BoundingBox, a: Asa) => ({
  x: a.includes('w') ? b.x : a.includes('e') ? b.x + b.w : b.x + b.w / 2,
  y: a.includes('n') ? b.y : a.includes('s') ? b.y + b.h : b.y + b.h / 2,
});

function estirar(o: BoundingBox, asa: Asa, dx: number, dy: number): BoundingBox {
  let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
  if (asa.includes('w')) x0 += dx;
  if (asa.includes('e')) x1 += dx;
  if (asa.includes('n')) y0 += dy;
  if (asa.includes('s')) y1 += dy;
  if (x1 - x0 < MIN) { if (asa.includes('w')) x0 = x1 - MIN; else x1 = x0 + MIN; }
  if (y1 - y0 < MIN) { if (asa.includes('n')) y0 = y1 - MIN; else y1 = y0 + MIN; }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

interface Arrastre { modo: 'mover' | 'estirar' | 'dibujar'; asa?: Asa; antes: BoundingBox; ini: { x: number; y: number } }

export default function VisorActa() {
  const {
    paginas, paginaActual, setPaginaActual, acta, seleccion, seleccionar, zonas, zonaActiva, setZonaActiva,
    setZonaVivo, confirmarZona, autoRelectura, nOrganizaciones,
  } = useActaStore();
  const { releerZonas } = useOCR();
  const pagina = paginas[paginaActual];
  const capa = useRef<HTMLDivElement>(null);
  const arr = useRef<Arrastre | null>(null);
  const [zoom, setZoom] = useState(1);
  const [mano, setMano] = useState(false); // herramienta "desplazar" mientras se edita una zona
  const [rejilla, setRejilla] = useState(false);
  const [rotulos, setRotulos] = useState(false);

  const alto = 'max(480px, calc(100vh - 380px))';
  if (!pagina) return <div className="flex items-center justify-center rounded border bg-gray-50 text-sm text-gray-400" style={{ height: alto }}>Sin documento cargado</div>;

  const W = pagina.width;
  const H = pagina.height;
  const sw = W / 1500; // grosor proporcional al acta (crece y se reduce con el zoom)
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  const filas = nOrganizaciones + 4;
  const editando = !!zonaActiva && !!zonas && !mano;

  const aImagen = (e: RPointerEvent) => {
    const r = capa.current!.getBoundingClientRect(); // incluye zoom y desplazamiento
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const limitar = (b: BoundingBox): BoundingBox => {
    const x = Math.max(0, Math.min(b.x, W - MIN));
    const y = Math.max(0, Math.min(b.y, H - MIN));
    return { x, y, w: Math.min(b.w, W - x), h: Math.min(b.h, H - y) };
  };

  const iniciar = (modo: Arrastre['modo'], asa: Asa | undefined, e: RPointerEvent) => {
    if (!zonaActiva || !zonas) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = aImagen(e);
    arr.current = { modo, asa, antes: { ...zonas[zonaActiva] }, ini: p };
    if (modo === 'dibujar') setZonaVivo(zonaActiva, { x: p.x, y: p.y, w: MIN, h: MIN });
  };
  const mover = (e: RPointerEvent) => {
    const a = arr.current;
    if (!a || !zonaActiva) return;
    const p = aImagen(e);
    const dx = p.x - a.ini.x;
    const dy = p.y - a.ini.y;
    if (a.modo === 'mover') setZonaVivo(zonaActiva, limitar({ ...a.antes, x: a.antes.x + dx, y: a.antes.y + dy }));
    else if (a.modo === 'estirar' && a.asa) setZonaVivo(zonaActiva, limitar(estirar(a.antes, a.asa, dx, dy)));
    else setZonaVivo(zonaActiva, limitar({ x: Math.min(a.ini.x, p.x), y: Math.min(a.ini.y, p.y), w: Math.max(MIN, Math.abs(dx)), h: Math.max(MIN, Math.abs(dy)) }));
  };
  const soltar = () => {
    const a = arr.current;
    arr.current = null;
    if (!a || !zonaActiva || !zonas) return;
    const z = zonas[zonaActiva];
    if (a.modo === 'dibujar' && (z.w < 20 || z.h < 20)) { setZonaVivo(zonaActiva, a.antes); return; } // clic sin arrastrar
    confirmarZona(zonaActiva, a.antes);
    if (autoRelectura && acta) void releerZonas(); // ajuste fino: relee al soltar
  };

  const marcasVotos = (z: BoundingBox) => {
    const rh = z.h / filas;
    const L = Math.min(z.w * 0.07, rh * 0.5);
    const T = rh * 0.28;
    const el: JSX.Element[] = [];
    for (let i = 0; i <= filas; i++) {
      const y = z.y + i * rh;
      el.push(<line key={`a${i}`} x1={z.x} x2={rejilla ? z.x + z.w : z.x + L} y1={y} y2={y} />);
      if (!rejilla) el.push(<line key={`b${i}`} x1={z.x + z.w - L} x2={z.x + z.w} y1={y} y2={y} />);
    }
    // Divisiones de casilleros: solo marcas cortas arriba y abajo (no atraviesan el número, no se confunden con un «1»)
    [1, 2].forEach((k) => {
      const x = z.x + (k * z.w) / 3;
      el.push(<line key={`c${k}`} x1={x} x2={x} y1={z.y} y2={rejilla ? z.y + z.h : z.y + T} strokeDasharray={rejilla ? `${sw * 2} ${sw * 3}` : undefined} />);
      if (!rejilla) el.push(<line key={`d${k}`} x1={x} x2={x} y1={z.y + z.h - T} y2={z.y + z.h} />);
    });
    return el;
  };

  const tam = 11 / zoom; // asas de tamaño constante en pantalla

  return (
    <div className="rounded border bg-gray-100">
      <TransformWrapper minScale={0.4} maxScale={10} centerOnInit wheel={{ step: 0.15 }} panning={{ disabled: editando }} onTransformed={(_r, st) => setZoom(st.scale)}>
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <div className="flex flex-wrap items-center gap-1 border-b bg-white p-1 text-xs">
              <button onClick={() => zoomIn()} className="rounded border px-2 py-0.5">＋</button>
              <button onClick={() => zoomOut()} className="rounded border px-2 py-0.5">－</button>
              <button onClick={() => resetTransform()} className="rounded border px-2 py-0.5">Ajustar</button>
              <button onClick={() => setMano(!mano)} className={`rounded border px-2 py-0.5 ${mano ? 'bg-blue-700 text-white' : ''}`} title="Desplazar la imagen mientras edita una zona">✋ Desplazar</button>
              <button onClick={() => setRejilla(!rejilla)} className={`rounded border px-2 py-0.5 ${rejilla ? 'bg-blue-700 text-white' : ''}`} title="Rejilla completa de filas y casilleros">▦ Rejilla</button>
              <button onClick={() => setRotulos(!rotulos)} className={`rounded border px-2 py-0.5 ${rotulos ? 'bg-blue-700 text-white' : ''}`} title="Mostrar el nombre de cada zona">Aa Rótulos</button>
              {zonaActiva && (
                <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">
                  Editando «{ETIQUETA_ZONA[zonaActiva]}»: estire las asas · arrastre el interior para mover · o dibuje uno nuevo fuera
                  <button onClick={() => setZonaActiva(null)} className="ml-2 underline">listo</button>
                </span>
              )}
              {paginas.length > 1 && (
                <span className="ml-auto flex items-center gap-1">
                  <button disabled={paginaActual === 0} onClick={() => setPaginaActual(paginaActual - 1)} className="rounded border px-2 py-0.5 disabled:opacity-40">‹</button>
                  Pág. {paginaActual + 1}/{paginas.length}
                  <button disabled={paginaActual === paginas.length - 1} onClick={() => setPaginaActual(paginaActual + 1)} className="rounded border px-2 py-0.5 disabled:opacity-40">›</button>
                </span>
              )}
            </div>
            <TransformComponent wrapperStyle={{ width: '100%', height: alto }} contentStyle={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div ref={capa} className="relative inline-block max-w-full">
                <img src={pagina.url} alt="Acta electoral escaneada" draggable={false} className="block max-w-full object-contain" style={{ maxHeight: 'max(460px, calc(100vh - 420px))', width: 'auto', height: 'auto' }} />

                {/* Zonas: líneas finas y proporcionales al acta */}
                {zonas && (
                  <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                    {ZONAS.map((n) => {
                      const z = zonas[n];
                      const act = zonaActiva === n;
                      return (
                        <g key={n} stroke={COLOR_ZONA[n]} fill={act ? COLOR_ZONA[n] : 'none'} fillOpacity={0.06} strokeWidth={act ? sw * 1.8 : sw} strokeOpacity={act ? 1 : 0.8}>
                          <rect x={z.x} y={z.y} width={z.w} height={z.h} />
                          {(n === 'votos_provincial' || n === 'votos_distrital') && (
                            <g fill="none" strokeWidth={sw * 0.6} strokeOpacity={rejilla ? 0.4 : 0.7}>{marcasVotos(z)}</g>
                          )}
                          {(rotulos || act) && (
                            <text x={z.x} y={z.y - W / 220} fontSize={W / 105} fill={COLOR_ZONA[n]} stroke="#fff" strokeWidth={W / 900} paintOrder="stroke" fontWeight={700}>{ETIQUETA_ZONA[n]}</text>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                )}

                {/* Celdas leídas: clicables; solo se dibujan las que tienen escritura, dudas o están seleccionadas */}
                {acta?.organizaciones.flatMap((o) =>
                  ELECCIONES.map((e) => {
                    const c = o[e];
                    if (!c.bbox) return null;
                    const sel = seleccion?.id === o.id && seleccion.eleccion === e;
                    const dudosa = c.estado !== 'ANULADA' && c.confianza < 0.75 && !c.verificada;
                    const visible = sel || c.estado === 'MANUSCRITO' || dudosa;
                    const color = COLOR_CAJA[clasificarConfianza(c.confianza)];
                    return (
                      <div key={`${o.id}-${e}`} onClick={() => !editando && seleccionar({ id: o.id, eleccion: e })}
                        title={`${o.codigo} ${o.nombre_partido} (${e}): ${c.estado === 'MANUSCRITO' ? c.valor ?? '?' : c.estado}`}
                        className={editando ? 'pointer-events-none absolute' : 'absolute cursor-pointer'}
                        style={{
                          left: pct(c.bbox.x, W), top: pct(c.bbox.y, H), width: pct(c.bbox.w, W), height: pct(c.bbox.h, H),
                          border: visible ? `${sel ? 2 : 0.6}px solid ${sel ? '#2563eb' : color}` : 'none',
                          background: sel ? 'rgba(59,130,246,0.18)' : dudosa ? 'rgba(245,158,11,0.12)' : 'transparent',
                        }} />
                    );
                  }),
                )}

                {/* Edición de la zona activa: dibujar nueva, mover, estirar por lados y esquinas */}
                {editando && zonaActiva && zonas && (
                  <>
                    <div className="absolute inset-0 cursor-crosshair touch-none" onPointerDown={(e) => iniciar('dibujar', undefined, e)} onPointerMove={mover} onPointerUp={soltar} />
                    <div className="absolute cursor-move touch-none" onPointerDown={(e) => iniciar('mover', undefined, e)} onPointerMove={mover} onPointerUp={soltar}
                      style={{ left: pct(zonas[zonaActiva].x, W), top: pct(zonas[zonaActiva].y, H), width: pct(zonas[zonaActiva].w, W), height: pct(zonas[zonaActiva].h, H) }} />
                    {ASAS.map((a) => {
                      const p = posAsa(zonas[zonaActiva], a);
                      return (
                        <div key={a} onPointerDown={(e) => iniciar('estirar', a, e)} onPointerMove={mover} onPointerUp={soltar}
                          className="absolute touch-none rounded-sm border bg-white"
                          style={{ left: pct(p.x, W), top: pct(p.y, H), width: tam, height: tam, transform: 'translate(-50%,-50%)', cursor: CURSOR[a], borderColor: COLOR_ZONA[zonaActiva], borderWidth: Math.max(0.5, 1.5 / zoom) }} />
                      );
                    })}
                  </>
                )}
              </div>
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
