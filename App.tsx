import { useEffect } from 'react';
import { useActaStore } from './store/actaStore';
import { cargarMuestras } from './utils/aprendizaje';
import UploadActa from './components/UploadActa';
import VisorActa from './components/VisorActa';
import PanelZonas from './components/PanelZonas';
import CalibrarColumnas from './components/CalibrarColumnas';
import PanelFirmas from './components/PanelFirmas';
import TablaOrganizaciones from './components/TablaOrganizaciones';
import ComparadorCasosDificiles from './components/ComparadorCasosDificiles';
import ResumenCuadre from './components/ResumenCuadre';
import CuadroObservaciones from './components/CuadroObservaciones';
import ComparadorActas from './components/ComparadorActas';
import LogAuditoria from './components/LogAuditoria';

export default function App() {
  const { acta, usuario, setUsuario } = useActaStore();
  useEffect(() => { void cargarMuestras(); }, []); // correcciones anteriores del fiscalizador (IndexedDB local)

  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-2 bg-blue-900 p-4 text-white shadow-lg">
        <div>
          <h1 className="text-xl font-bold">Módulo Jurisdiccional · Recuento y Fiscalización de Actas</h1>
          <p className="text-xs text-blue-200">Elecciones Regionales y Municipales 2026 · Procesamiento 100 % local (sin envío de datos)</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {acta && <span className="rounded bg-blue-800 px-3 py-1 font-semibold">MESA {acta.mesa || '—'} · {acta.departamento || '—'} · {acta.distrito || '—'}</span>}
          <label className="flex items-center gap-1 text-xs">
            Usuario:
            <input value={usuario} onChange={(e) => setUsuario(e.target.value)} className="w-32 rounded px-1 py-0.5 text-gray-900" />
          </label>
        </div>
      </header>

      <main className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
        <section className="space-y-3 rounded-lg border bg-white p-4 shadow">
          <h2 className="border-b pb-1 text-lg font-bold text-blue-900">1. Documento digitalizado</h2>
          <UploadActa />
          <PanelZonas />
          <CalibrarColumnas />
          <VisorActa />
        </section>

        <section className="space-y-3">
          {acta ? (
            <>
              <PanelFirmas />
              <div className="rounded-lg border bg-white p-3 shadow"><TablaOrganizaciones /></div>
              <ResumenCuadre />
              <CuadroObservaciones />
            </>
          ) : (
            <div className="rounded-lg border bg-white p-6 text-sm text-gray-500 shadow">
              Cargue un acta, revise las zonas y pulse «Leer acta». Los datos aparecerán aquí en una tabla editable.
            </div>
          )}
        </section>

        <section className="lg:col-span-2"><ComparadorActas /></section>
        <section className="lg:col-span-2"><ComparadorCasosDificiles /></section>
        <section className="lg:col-span-2"><LogAuditoria /></section>
      </main>
    </div>
  );
}
