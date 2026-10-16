import type { ActaElectoral, BoundingBox, CampoNumerico, CeldaVoto, MiembroMesa, Zonas } from '../types/acta';
import { celdaNegra, densidadTinta, papelRef } from './analizarCelda';
import { leerNumeroCelda } from './digitos';
import { celdaNueva } from './celdas';
import { ORGANIZACIONES_4B, subzonasMiembro } from './plantilla';

// Umbrales medidos sobre un acta real (tinta relativa al fondo del papel).
const FIRMA_SI = 0.015;
const FIRMA_DUDOSA = 0.008;
const DATO_SI = 0.012;
const OBSERVACION_SI = 0.02;

export function leerCeldaVoto(canvas: HTMLCanvasElement, box: BoundingBox, papel: number, ciudadanos: number): CeldaVoto {
  const base: CeldaVoto = { ...celdaNueva(), bbox: box };
  const n = celdaNegra(canvas, box.x, box.y, box.w, box.h, papel);
  if (n.negra) return { ...base, estado: 'ANULADA', valor: 0, valor_ocr: 0, oscuro: n.oscuro, confianza: n.oscuro > 0.7 ? 0.95 : 0.7 };
  const r = leerNumeroCelda(canvas, box);
  if (!r) return { ...base, estado: 'VACIA', valor: 0, valor_ocr: 0, confianza: 0.95 };
  let conf = r.confianza;
  if (ciudadanos > 0 && r.valor > ciudadanos) conf = Math.min(conf, 0.35); // más votos que votantes: sospechoso
  return { ...base, estado: 'MANUSCRITO', valor: r.valor, valor_ocr: r.valor, confianza: conf, vectores: r.vectores };
}

// Lee el acta COMPLETA a partir de las zonas de trabajo. La cabecera impresa se completa luego con OCR.
export function leerActa(
  canvas: HTMLCanvasElement,
  zonas: Zonas,
  nOrg: number,
  meta: { hash: string; nombre: string },
): ActaElectoral {
  const confianza_campos: Partial<Record<CampoNumerico, number>> = {};

  // 1) Ciudadanos que votaron (3 casilleros)
  const c = leerNumeroCelda(canvas, zonas.ciudadanos);
  const ciudadanos_votaron = c ? c.valor : 0;
  confianza_campos.ciudadanos_votaron = c ? c.confianza : 0;

  // 2) Tabla de votos: nOrg organizaciones + 4 filas (blanco, nulos, impugnados, total emitido)
  const filas = nOrg + 4;
  const organizaciones: ActaElectoral['organizaciones'] = [];
  const fijos: Record<string, number> = {};
  for (const e of ['provincial', 'distrital'] as const) {
    const z = zonas[e === 'provincial' ? 'votos_provincial' : 'votos_distrital'];
    const paso = z.h / filas;
    const papel = papelRef(canvas, z.x, z.y, z.w, z.h);
    for (let i = 0; i < filas; i++) {
      const box = { x: z.x, y: z.y + i * paso, w: z.w, h: paso };
      const celda = leerCeldaVoto(canvas, box, papel, ciudadanos_votaron);
      if (i < nOrg) {
        if (e === 'provincial') {
          organizaciones.push({
            id: crypto.randomUUID(), codigo: String(i + 1).padStart(2, '0'),
            nombre_partido: ORGANIZACIONES_4B[i] ?? '', provincial: celda, distrital: celdaNueva(),
          });
        } else organizaciones[i].distrital = celda;
      } else {
        const clave = (['blanco', 'nulos', 'impugnados', 'emitidos_escrito'] as const)[i - nOrg];
        const campo = `${clave}_${e}` as CampoNumerico;
        fijos[campo] = celda.estado === 'MANUSCRITO' ? celda.valor ?? 0 : 0;
        confianza_campos[campo] = celda.confianza;
      }
    }
  }

  // 3) Miembros de mesa: la firma es lo importante; nombres/apellidos/DNI solo se verifica que existan
  const roles = [
    { rol: 'PRESIDENTE', z: zonas.miembro_presidente },
    { rol: 'SECRETARIO', z: zonas.miembro_secretario },
    { rol: 'TERCER_MIEMBRO', z: zonas.miembro_tercero },
  ] as const;
  const miembros_mesa: MiembroMesa[] = roles.map(({ rol, z }) => {
    const s = subzonasMiembro(z);
    const d = (b: BoundingBox) => densidadTinta(canvas, b.x, b.y, b.w, b.h);
    const firma = d(s.firma);
    const nom = d(s.nombres);
    const ape = d(s.apellidos);
    const dni = d(s.dni);
    return {
      rol, caja: z, roi_firma: s.firma,
      firma_detectada: firma >= FIRMA_SI,
      datos_presentes: nom >= DATO_SI && ape >= DATO_SI,
      dni_presente: dni >= DATO_SI,
      densidad_firma: firma, densidad_datos: Math.min(nom, ape), densidad_dni: dni,
      nivel_confianza: firma >= 0.03 || firma < FIRMA_DUDOSA ? 0.9 : firma >= FIRMA_SI ? 0.75 : 0.5,
      confirmado_manual: false,
    };
  });

  const o = zonas.observaciones;
  const observaciones_escritas =
    densidadTinta(canvas, o.x + o.w * 0.15, o.y + o.h * 0.12, o.w * 0.83, o.h * 0.76) >= OBSERVACION_SI;

  return {
    mesa: '', departamento: '', provincia: '', distrito: '', electores_habiles: 0, ciudadanos_votaron,
    blanco_provincial: fijos.blanco_provincial ?? 0, nulos_provincial: fijos.nulos_provincial ?? 0,
    impugnados_provincial: fijos.impugnados_provincial ?? 0, emitidos_escrito_provincial: fijos.emitidos_escrito_provincial ?? 0,
    blanco_distrital: fijos.blanco_distrital ?? 0, nulos_distrital: fijos.nulos_distrital ?? 0,
    impugnados_distrital: fijos.impugnados_distrital ?? 0, emitidos_escrito_distrital: fijos.emitidos_escrito_distrital ?? 0,
    miembros_mesa, organizaciones, hash_sha256: meta.hash, estado_acta: 'ENVIADA_A_JURADO',
    observaciones: [], observaciones_escritas, nombre_archivo: meta.nombre, confianza_campos,
  };
}
