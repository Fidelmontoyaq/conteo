import { useActaStore } from '../store/actaStore';
import { limpiarAuditoria, useAuditoria } from '../hooks/useAuditoria';

export default function LogAuditoria() {
  const version = useActaStore((s) => s.auditoriaVersion);
  const entradas = useAuditoria(version);

  const limpiar = async () => {
    if (!confirm('¿Borrar TODO el log de auditoría local? Esta acción no se puede deshacer.')) return;
    await limpiarAuditoria();
    useActaStore.setState((s) => ({ auditoriaVersion: s.auditoriaVersion + 1 }));
  };

  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-700">Log de auditoría (IndexedDB local)</h3>
        <button onClick={() => void limpiar()} className="rounded border px-2 py-0.5 text-xs">Limpiar</button>
      </div>
      <div className="max-h-60 space-y-1 overflow-auto text-[11px]">
        {entradas.length === 0 && <p className="text-gray-400">Sin eventos registrados.</p>}
        {entradas.slice(0, 100).map((e) => (
          <div key={e.id} className="rounded border bg-gray-50 p-1.5">
            <p>
              <span className="font-mono text-gray-500">{new Date(e.timestamp).toLocaleString('es-PE')}</span>{' · '}
              <b>{e.usuario}</b>{' · '}
              <span className="font-semibold text-blue-800">{e.accion}</span>
            </p>
            {e.cambios.map((c, i) => (
              <p key={i} className="pl-2 text-gray-700">
                {c.campo}: <s className="text-red-600">{String(c.antes ?? '∅')}</s> → <b className="text-green-700">{String(c.despues ?? '∅')}</b>
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
