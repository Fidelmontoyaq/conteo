import type { ActaElectoral, CampoNumerico } from '../types/acta';

const CAMPOS: CampoNumerico[] = [
  'electores_habiles', 'ciudadanos_votaron',
  'blanco_provincial', 'nulos_provincial', 'impugnados_provincial', 'emitidos_escrito_provincial',
  'blanco_distrital', 'nulos_distrital', 'impugnados_distrital', 'emitidos_escrito_distrital',
];

// Al re-leer con zonas ajustadas se conserva lo que el fiscalizador ya verificó o escribió a mano:
// celdas verificadas, nombres/códigos editados, cabecera, campos editados y miembros confirmados.
export function fusionarLecturas(v: ActaElectoral, n: ActaElectoral): ActaElectoral {
  const organizaciones = n.organizaciones.map((o, i) => {
    const old = v.organizaciones[i];
    if (!old) return o;
    return {
      ...o, id: old.id, codigo: old.codigo, nombre_partido: old.nombre_partido,
      provincial: old.provincial.verificada ? { ...old.provincial, bbox: o.provincial.bbox } : o.provincial,
      distrital: old.distrital.verificada ? { ...old.distrital, bbox: o.distrital.bbox } : o.distrital,
    };
  });
  const campos: Record<string, number> = {};
  const cc = { ...n.confianza_campos };
  for (const k of CAMPOS) if (v.confianza_campos[k] === 1) { campos[k] = v[k]; cc[k] = 1; }
  const miembros_mesa = n.miembros_mesa.map((m, i) => {
    const old = v.miembros_mesa[i];
    return old?.confirmado_manual ? { ...old, caja: m.caja, roi_firma: m.roi_firma } : m;
  });
  return {
    ...n, ...campos, confianza_campos: cc, organizaciones, miembros_mesa,
    mesa: v.mesa, departamento: v.departamento, provincia: v.provincia, distrito: v.distrito,
    electores_habiles: v.electores_habiles, hash_sha256: v.hash_sha256, nombre_archivo: v.nombre_archivo,
  };
}
