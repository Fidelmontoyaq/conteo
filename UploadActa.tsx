import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useActaStore } from '../store/actaStore';
import { usePDFLoader } from '../hooks/usePDFLoader';
import { useOCR } from '../hooks/useOCR';

export default function UploadActa() {
  const { procesando, progreso, mensaje, archivo, paginas, acta, versiones } = useActaStore();
  const { cargar } = usePDFLoader();
  const { ejecutarOCR } = useOCR();

  const onDrop = useCallback((files: File[]) => { if (files[0]) void cargar(files[0]); }, [cargar]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled: procesando,
    accept: { 'application/pdf': ['.pdf'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] },
  });

  return (
    <div className="space-y-2">
      <div
        {...getRootProps()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-2 text-center text-sm transition ${
          isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
        } ${procesando ? 'opacity-60' : ''}`}
      >
        <input {...getInputProps()} />
        <p className="font-medium text-gray-700">Arrastre el acta (PDF, JPG o PNG) o haga clic para seleccionarla</p>
        <p className="text-xs text-gray-500">Procesamiento 100 % local: el archivo nunca sale de este navegador.</p>
        {acta && <p className="mt-1 text-xs font-semibold text-blue-800">Si esta acta no cuadra, cargue la misma acta reescrita: esta se guardará como versión {String.fromCharCode(65 + versiones.length)} para compararlas.</p>}
      </div>

      {archivo && (
        <div className="rounded border bg-white p-2 text-xs">
          <p className="font-semibold">{archivo.nombre} · {paginas.length} pág.</p>
          <p className="break-all font-mono text-[10px] text-gray-500">SHA-256: {archivo.hash}</p>
        </div>
      )}

      <button
        onClick={() => void ejecutarOCR()}
        disabled={!archivo || procesando}
        className="w-full rounded bg-blue-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {procesando ? 'Procesando…' : 'Leer acta (página actual)'}
      </button>

      {(procesando || mensaje) && (
        <div className="text-xs text-gray-600">
          {procesando && (
            <div className="mb-1 h-2 w-full overflow-hidden rounded bg-gray-200">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${Math.round(progreso * 100)}%` }} />
            </div>
          )}
          {mensaje}
        </div>
      )}
    </div>
  );
}
