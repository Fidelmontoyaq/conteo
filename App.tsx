import { useEffect } from 'react';
import { useActaStore } from './store/actaStore';
import { cargarMuestras } from './utils/aprendizaje';
import UploadActa from './components/UploadActa';
import VisorActa from './components/VisorActa';
import PanelZonas from './components/PanelZonas';
import PanelFirmas from './components/PanelFirmas';
import BarraEstado from './components/BarraEstado';
import TablaOrganizaciones from './components/TablaOrganizaciones';
import ComparadorCasosDificiles from './components/ComparadorCasosDificiles';
import ResumenCuadre from './components/ResumenCuadre';
import CuadroObservaciones from './components/CuadroObservaciones';
import ComparadorActas from './components/ComparadorActas';
import LogAuditoria from './components/LogAuditoria';
import type { Pestana } from './types/acta';

export default function App() {
  const { acta, usuario, setUsuario, pestana, setPestana, versiones } = useActaStore();
  useEffect(() => { void cargarMuestras(); }, []); // correcciones anteriores del fiscalizador (IndexedDB local)

  const pestanas: [Pestana, string][] = [
    ['votos', 'Conteo de votos'],
    ['resumen', 'Resumen y observaciones'],
    ['comparar', `Comparar actas${versiones.length ? ` (${versiones.length + 1})` : ''}`],
  ];

  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-2 bg-blue-900 px-4 py-2 text-white shadow-lg">
        <div>
          <h1 className="text-lg font-bold">Módulo Jurisdiccional · Recuento y Fiscalización de Actas</h1>
          <p className="text-[11px] text-blue-200">Elecciones Regionales y Municipales 2026 · Procesamiento 100 % local (sin envío de datos)</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {acta && <span className="rounded bg-blue-800 px-3 py-1 text-xs font-semibold">MESA {acta.mesa || '—'} · {acta.departamento || '—'} · {acta.distrito || '—'}</span>}
          <label className="flex items-center gap-1 text-xs">Usuario:
            <input value={usuario} onChange={(e) => setUsuario(e.target.value)} className="w-28 rounded px-1 py-0.5 text-gray-900" />
          </label>
        </div>
      </header>

      <main className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-2">
        {/* Izquierda: el escaneo, lo más grande posible */}
        <section className="space-y-2 rounded-lg border bg-white p-2 shadow">
          <UploadActa />
          <PanelZonas />
          <VisorActa />
        </section>

        {/* Derecha: el conteo de votos ocupa el mayor espacio; firmas pequeñas */}
        <section className="space-y-2">
          {acta || versiones.length > 0 ? (
            <>
              <BarraEstado />
              <PanelFirmas />
              <div className="flex gap-1 border-b">
                {pestanas.map(([k, t]) => (
                  <button key={k} onClick={() => setPestana(k)} className={`rounded-t px-3 py-1.5 text-xs font-semibold ${pestana === k ? 'bg-blue-800 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>{t}</button>
                ))}
              </div>
              {pestana === 'votos' && <div className="rounded-lg border bg-white p-2 shadow"><TablaOrganizaciones /></div>}
              {pestana === 'resumen' && <><ResumenCuadre /><CuadroObservaciones /></>}
              {pestana === 'comparar' && <ComparadorActas />}
            </>
          ) : (
            <div className="rounded-lg border bg-white p-6 text-sm text-gray-500 shadow">
              Cargue un acta, ajuste los recuadros de lectura y pulse «Leer acta». Los datos aparecerán aquí en una tabla editable.
            </div>
          )}
        </section>

        <section className="lg:col-span-2"><ComparadorCasosDificiles /></section>
        <section className="lg:col-span-2"><LogAuditoria /></section>
      </main>
    </div>
  );
}
