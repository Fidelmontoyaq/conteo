import { useEffect, useState } from 'react';
import { useActaStore } from '../store/actaStore';
import { recortar } from '../utils/cropImage';
import { subzonasMiembro } from '../utils/plantilla';
import type { MiembroMesa } from '../types/acta';

const ROL: Record<string, string> = { PRESIDENTE: 'Presidente', SECRETARIO: 'Secretario', TERCER_MIEMBRO: '3.er Miembro' };

function Mini({ ok, texto, onChange }: { ok: boolean; texto: string; onChange: (v: boolean) => void }) {
  return (
    <label className={`flex items-center gap-0.5 ${ok ? 'text-green-700' : 'text-red-700'}`} title={ok ? 'Presente' : 'No detectado'}>
      <input type="checkbox" className="h-3 w-3" checked={ok} onChange={(e) => onChange(e.target.checked)} />{texto}
    </label>
  );
}

// Compacto a propósito: la tabla de votos es lo principal. Solo se muestra un recorte pequeño de cada firma.
export default function PanelFirmas() {
  const { acta, setMiembro, paginas, paginaActual } = useActaStore();
  const [fotos, setFotos] = useState<Record<string, string>>({});
  const pagina = paginas[paginaActual];
  const clave = acta?.miembros_mesa.map((m) => `${m.caja?.x}|${m.caja?.y}|${m.caja?.w}|${m.caja?.h}`).join();

  useEffect(() => {
    let vivo = true;
    if (!acta || !pagina) return;
    void Promise.all(acta.miembros_mesa.map(async (m) => {
      if (!m.caja) return [m.rol, ''] as const;
      const c = await recortar(pagina.url, subzonasMiembro(m.caja).firma, { margenPx: 0, anchoMin: 220 });
      return [m.rol, c.toDataURL('image/jpeg', 0.8)] as const;
    })).then((r) => vivo && setFotos(Object.fromEntries(r)));
    return () => { vivo = false; };
  }, [acta?.hash_sha256, pagina?.url, clave]);

  if (!acta) return null;
  const cambiar = (rol: MiembroMesa['rol'], patch: Partial<MiembroMesa>) => setMiembro(rol, { ...patch, confirmado_manual: true });

  return (
    <div className="grid grid-cols-3 gap-1 rounded-lg border bg-white p-1.5 text-[11px]">
      {acta.miembros_mesa.map((m) => (
        <div key={m.rol} className={`rounded border p-1 ${m.firma_detectada ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'}`}>
          <div className="flex items-center justify-between">
            <b>{ROL[m.rol]}</b>
            <span className="text-gray-500">{(m.densidad_firma * 100).toFixed(1)} %</span>
          </div>
          {fotos[m.rol] && <img src={fotos[m.rol]} alt={`Firma ${ROL[m.rol]}`} className="my-0.5 h-10 w-full rounded border bg-white object-contain" />}
          <div className="flex gap-2">
            <Mini ok={m.firma_detectada} texto="Firma" onChange={(v) => cambiar(m.rol, { firma_detectada: v })} />
            <Mini ok={m.datos_presentes} texto="Datos" onChange={(v) => cambiar(m.rol, { datos_presentes: v })} />
            <Mini ok={m.dni_presente} texto="DNI" onChange={(v) => cambiar(m.rol, { dni_presente: v })} />
          </div>
        </div>
      ))}
    </div>
  );
}
