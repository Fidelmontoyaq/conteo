import { useEffect, useState } from 'react';
import { useActaStore } from '../store/actaStore';
import { recortar } from '../utils/cropImage';

// Las observaciones son texto libre para el usuario: se muestra el recuadro recortado.
export default function CuadroObservaciones() {
  const { acta, paginas, paginaActual, zonas } = useActaStore();
  const [url, setUrl] = useState('');
  const pagina = paginas[paginaActual];

  useEffect(() => {
    let vivo = true;
    if (!acta || !pagina || !zonas) return;
    void recortar(pagina.url, zonas.observaciones, { margenPx: 0, anchoMin: 900 }).then((c) => vivo && setUrl(c.toDataURL('image/jpeg', 0.85)));
    return () => { vivo = false; };
  }, [acta?.hash_sha256, pagina?.url, zonas?.observaciones.x, zonas?.observaciones.y, zonas?.observaciones.w, zonas?.observaciones.h]);

  if (!acta) return null;
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-700">Observaciones del acta</h3>
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${acta.observaciones_escritas ? 'bg-amber-400 text-amber-950' : 'bg-gray-200 text-gray-700'}`}>
          {acta.observaciones_escritas ? 'Hay texto escrito: léalo' : 'Sin observaciones escritas (detección automática)'}
        </span>
      </div>
      {url && <img src={url} alt="Recuadro de observaciones" className="w-full rounded border" />}
    </div>
  );
}
