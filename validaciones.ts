import { ELECCIONES, type ActaElectoral, type Eleccion, type ResumenEleccion, type ResumenValidacion } from '../types/acta';
import { aporte, esIncierta, pendiente } from './celdas';

// CAPA DE VALIDACIÓN: función pura, independiente del reconocimiento.
// Reglas: solo COMPRUEBA y advierte. Nunca cambia una lectura, nunca completa un dígito para que cuadre una suma
// y nunca usa los totales para adivinar valores. Negro = no cuenta · Vacío = suma 0 (pero no es un 0 leído) · Voto = valor.
// REGLA PRINCIPAL: por cada elección, votos válidos + blancos + nulos + impugnados = ciudadanos que votaron.

const NOMBRE: Record<Eleccion, string> = { provincial: 'PROVINCIAL', distrital: 'DISTRITAL' };

export function validarActa(a: ActaElectoral): ResumenValidacion {
  const por = {} as Record<Eleccion, ResumenEleccion>;
  for (const e of ELECCIONES) {
    const validos = a.organizaciones.reduce((s, o) => s + aporte(o[e]), 0);
    const emitidos = validos + a[`blanco_${e}`] + a[`nulos_${e}`] + a[`impugnados_${e}`];
    const escrito = a[`emitidos_escrito_${e}`];
    por[e] = { validos, emitidos, diferencia: emitidos - a.ciudadanos_votaron, cuadra: emitidos === a.ciudadanos_votaron, escrito, escrito_ok: escrito === emitidos };
  }
  const celdas = a.organizaciones.flatMap((o) => ELECCIONES.map((e) => o[e]));
  const firmas = a.miembros_mesa.filter((m) => m.firma_detectada).length;
  const excede_habiles = a.electores_habiles > 0 && a.ciudadanos_votaron > a.electores_habiles;
  const datos_ok = a.miembros_mesa.every((m) => m.datos_presentes);
  const dni_ok = a.miembros_mesa.every((m) => m.dni_presente);
  const sinValor = celdas.filter((c) => c.estado === 'MANUSCRITO' && c.valor === null).length;
  const celdas_pendientes = celdas.filter(pendiente).length;
  const celdas_ambiguas = celdas.filter(esIncierta).length;
  const celdas_vacias = celdas.filter((c) => c.estado === 'VACIA').length;
  const celdas_sospechosas = a.ciudadanos_votaron > 0
    ? celdas.filter((c) => c.estado === 'MANUSCRITO' && c.valor !== null && c.valor > a.ciudadanos_votaron).length
    : 0;
  const meta = a.lectura_meta;
  const alineacion_ok = !meta || meta.geometria.confiable || meta.alineacion_confirmada;

  const errores: string[] = [];
  const avisos: string[] = [];
  if (!alineacion_ok && meta) {
    errores.push(`ALINEACIÓN NO VERIFICADA: no se pudo comprobar que cada recorte corresponda a su fila y columna (${meta.geometria.problemas.slice(0, 2).join(' · ')}). Revise la rejilla y confírmela o ajuste los recuadros.`);
  }
  if (firmas < 3) errores.push(`INCOMPLETA: solo ${firmas}/3 firmas de miembros de mesa.`);
  if (excede_habiles) errores.push(`EXCESO DE VOTANTES: ciudadanos que votaron (${a.ciudadanos_votaron}) > electores hábiles (${a.electores_habiles}).`);
  for (const e of ELECCIONES) {
    const r = por[e];
    if (!r.cuadra) errores.push(`NO CUADRA ${NOMBRE[e]}: votos sumados (${r.emitidos}) ≠ ciudadanos que votaron (${a.ciudadanos_votaron}); diferencia ${r.diferencia > 0 ? '+' : ''}${r.diferencia}.`);
    if (r.escrito > 0 && !r.escrito_ok) avisos.push(`${NOMBRE[e]}: el TOTAL DE VOTOS EMITIDOS escrito (${r.escrito}) no coincide con la suma (${r.emitidos}).`);
  }
  if (celdas_ambiguas > 0) errores.push(`${celdas_ambiguas} celda(s) con tinta pero lectura ambigua o con error, sin resolver: no suman y la aritmética no es confiable hasta que una persona las revise.`);
  if (sinValor > 0) errores.push(`${sinValor} celda(s) con número escrito pero ilegible.`);
  if (a.ciudadanos_votaron === 0) avisos.push('Ciudadanos que votaron: no se leyó ningún valor.');
  if (a.electores_habiles === 0) avisos.push('Electores hábiles no leídos: no se pudo validar el límite de votantes.');
  if (!datos_ok) avisos.push('Falta nombres/apellidos de algún miembro de mesa.');
  if (!dni_ok) avisos.push('Falta el DNI de algún miembro de mesa.');
  if (a.observaciones_escritas) avisos.push('El acta tiene texto en el recuadro de OBSERVACIONES: léalo.');
  if (celdas_sospechosas > 0) avisos.push(`${celdas_sospechosas} celda(s) con más votos que ciudadanos que votaron: verifique el valor o el total (no se corrigió nada).`);
  if (celdas_pendientes > 0) avisos.push(`${celdas_pendientes} celda(s) con lectura dudosa sin verificar por el fiscalizador.`);

  const estado = errores.length ? 'ENVIADA_A_JURADO' : avisos.length ? 'APROBADA_CON_OBSERVACIONES' : 'APROBADA';
  return {
    por_eleccion: por, firmas, cuadra: ELECCIONES.every((e) => por[e].cuadra), excede_habiles, datos_ok, dni_ok,
    celdas_pendientes, celdas_ambiguas, celdas_vacias, celdas_sospechosas, alineacion_ok, errores, avisos, estado,
  };
}
