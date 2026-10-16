import type { ActaElectoral, BoundingBox, CampoNumerico, CeldaVoto, EstadoCelda, LecturaMeta, MiembroMesa, Zonas } from '../types/acta';
import { celdaNegra, densidadTinta, papelRef, type Fuente } from './analizarCelda';
import { ACTA_SEMILLAS, leerNumeroCelda, opcionesClasificador, totalMuestras } from './digitos';
import { celdaNueva } from './celdas';
import { cajaValida, diagnosticarGeometria } from './geometria';
import { ORGANIZACIONES_4B, subzonasMiembro } from './plantilla';
import * as U from './umbrales';

// Umbrales medidos sobre un acta real (tinta relativa al fondo del papel).
const FIRMA_SI = 0.015;
const FIRMA_DUDOSA = 0.008;
const DATO_SI = 0.012;
const OBSERVACION_SI = 0.02;

export interface LecturaCelda { celda: CeldaVoto; trazo: number; azul: number }

// Lee UNA celda de votos. Solo RECONOCE: no consulta totales ni otras celdas (eso es la capa de validación).
export function leerCeldaVotoDetallada(f: Fuente, box: BoundingBox, papel: number, fila?: number): LecturaCelda {
  const base: CeldaVoto = { ...celdaNueva(), bbox: box, fila, origen_valor: 'AUTO' };
  const fin = (celda: CeldaVoto, trazo = 0, azul = 0): LecturaCelda => ({ celda: { ...celda, estado_ocr: celda.estado }, trazo, azul });
  try {
    if (!cajaValida(box, f.width, f.height)) {
      return fin({ ...base, estado: 'ERROR', motivos: ['el recorte de la celda queda fuera de la imagen o es demasiado pequeño'] });
    }
    const n = celdaNegra(f, box.x, box.y, box.w, box.h, papel);
    if (n.negra) {
      return fin({ ...base, estado: 'ANULADA', oscuro: n.oscuro, confianza: n.oscuro > 0.7 ? 0.95 : 0.7 });
    }
    const r = leerNumeroCelda(f, box);
    if (!r) {
      // Sin tinta: VACÍA (valor null). NO es un 0 leído.
      const tinta = densidadTinta(f, box.x + box.w * 0.05, box.y + box.h * 0.1, box.w * 0.9, box.h * 0.8);
      const sospechosa = tinta > U.VACIA_TINTA_SOSPECHOSA;
      return fin({
        ...base, estado: 'VACIA', tinta, confianza: sospechosa ? U.VACIA_CONF_SOSPECHOSA : U.VACIA_CONF_MAX,
        motivos: sospechosa ? ['no se reconoció ningún dígito pero la celda tiene bastante tinta: revísela'] : undefined,
      });
    }
    const estado: EstadoCelda = r.ambiguo ? 'AMBIGUA' : 'MANUSCRITO';
    return fin({
      ...base, estado, valor: r.valor, valor_ocr: r.valor, texto_ocr: r.texto, confianza: r.confianza, tinta: r.tinta,
      vectores: r.vectores, digitos: r.digitos, motivos: r.motivos.length ? r.motivos : undefined,
    }, r.casilleros_trazo, r.casilleros_azul);
  } catch (e) {
    return fin({ ...base, estado: 'ERROR', motivos: [`error de procesamiento: ${e instanceof Error ? e.message : String(e)}`] });
  }
}

export const leerCeldaVoto = (f: Fuente, box: BoundingBox, papel: number): CeldaVoto => leerCeldaVotoDetallada(f, box, papel).celda;

// Lee el acta COMPLETA a partir de las zonas de trabajo. La cabecera impresa se completa luego con OCR.
export function leerActa(
  canvas: Fuente,
  zonas: Zonas,
  nOrg: number,
  meta: { hash: string; nombre: string },
): ActaElectoral {
  const confianza_campos: Partial<Record<CampoNumerico, number>> = {};

  // 1) Ciudadanos que votaron (3 casilleros)
  const c = leerNumeroCelda(canvas, zonas.ciudadanos);
  const ciudadanos_votaron = c && c.valor !== null ? c.valor : 0;
  confianza_campos.ciudadanos_votaron = c ? (c.ambiguo ? Math.min(c.confianza, 0.5) : c.confianza) : 0;

  // 2) Geometría: filas ajustadas a las líneas impresas (o reparto uniforme marcado como NO verificado)
  const filas = nOrg + 4;
  const geo = diagnosticarGeometria(canvas, zonas.votos_provincial, zonas.votos_distrital, filas);

  // 3) Tabla de votos: nOrg organizaciones + 4 filas (blanco, nulos, impugnados, total emitido)
  const lecturas: { e: 'provincial' | 'distrital'; i: number; l: LecturaCelda }[] = [];
  for (const e of ['provincial', 'distrital'] as const) {
    const z = zonas[e === 'provincial' ? 'votos_provincial' : 'votos_distrital'];
    const bordes = geo[e].bordes;
    const papel = papelRef(canvas, z.x, z.y, z.w, z.h);
    for (let i = 0; i < filas; i++) {
      const box = { x: z.x, y: bordes[i], w: z.w, h: bordes[i + 1] - bordes[i] };
      if (!cajaValida(box, canvas.width, canvas.height)) geo.recortes_invalidos.push(`${e} fila ${i + 1}`);
      lecturas.push({ e, i, l: leerCeldaVotoDetallada(canvas, box, papel, i) });
    }
  }
  geo.confiable = geo.problemas.length === 0 && geo.recortes_invalidos.length === 0;
  if (geo.recortes_invalidos.length) geo.problemas.push(`${geo.recortes_invalidos.length} recorte(s) fuera de la imagen o demasiado pequeños`);

  // 4) Tinta dominante: si el acta está escrita en azul, un trazo SIN evidencia azul (línea, mancha, marca impresa)
  //    no se acepta sin revisión. Es una marca para la persona, no una corrección.
  const trazoTot = lecturas.reduce((s, x) => s + x.l.trazo, 0);
  const azulTot = lecturas.reduce((s, x) => s + x.l.azul, 0);
  const prop = trazoTot ? azulTot / trazoTot : 0;
  const tinta_dominante: LecturaMeta['tinta_dominante'] =
    trazoTot < 5 ? 'INDETERMINADA' : prop >= U.TINTA_AZUL_DOMINANTE ? 'AZUL' : prop <= 0.2 ? 'OTRA' : 'INDETERMINADA';
  if (tinta_dominante === 'AZUL') {
    for (const x of lecturas) {
      const ce = x.l.celda;
      if (ce.estado === 'MANUSCRITO' && x.l.azul < x.l.trazo) {
        ce.estado = 'AMBIGUA';
        ce.estado_ocr = 'AMBIGUA';
        ce.motivos = [...(ce.motivos ?? []), 'el acta está escrita en azul pero algún dígito de esta celda no tiene tinta azul (¿línea, mancha o marca impresa?)'];
      }
    }
  }

  const organizaciones: ActaElectoral['organizaciones'] = [];
  const fijos: Record<string, number> = {};
  for (const { e, i, l } of lecturas) {
    const celda = l.celda;
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
      // Estos campos son numéricos (no admiten null): vacía/negra suman 0, y una celda dudosa queda marcada «verificar».
      fijos[campo] = celda.estado === 'MANUSCRITO' || celda.estado === 'AMBIGUA' ? celda.valor ?? 0 : 0;
      confianza_campos[campo] = celda.estado === 'AMBIGUA' || celda.estado === 'ERROR' ? Math.min(celda.confianza, 0.5) : celda.confianza;
    }
  }

  // 5) Miembros de mesa: la firma es lo importante; nombres/apellidos/DNI solo se verifica que existan
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
    lectura_meta: {
      version_algoritmo: U.VERSION_ALGORITMO, tinta_dominante, geometria: geo, alineacion_confirmada: false,
      clasificador: { sin_aprendizaje: opcionesClasificador.sinAprendizaje, semillas_excluidas: opcionesClasificador.excluirActas.has(ACTA_SEMILLAS), muestras_disponibles: totalMuestras() },
    },
  };
}
