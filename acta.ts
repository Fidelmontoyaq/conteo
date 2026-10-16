export type EstadoLectura =
  | 'CONFIABLE'
  | 'VERIFICACION_ASISTIDA'
  | 'REVISION_MANUAL'
  | 'OBSERVADO_TRAZO_DUDOSO'
  | 'CRITICO_BORRON';

export interface BoundingBox {
  x: number; // píxeles sobre la imagen de la página
  y: number;
  w: number;
  h: number;
}

// El acta tiene DOS elecciones, cada una con su columna de votos.
export type Eleccion = 'provincial' | 'distrital';
export const ELECCIONES: Eleccion[] = ['provincial', 'distrital'];

// MANUSCRITO = hay número escrito · VACIA = casilla en blanco (nadie votó → 0) · ANULADA = tapada en negro (no cuenta)
export type EstadoCelda = 'MANUSCRITO' | 'VACIA' | 'ANULADA';

export interface CeldaVoto {
  estado: EstadoCelda;
  valor: number | null; // valor vigente (editable)
  valor_ocr: number | null; // lectura original (evidencia forense)
  confianza: number; // 0..1
  tinta: number;
  oscuro: number;
  bbox?: BoundingBox;
  verificada: boolean; // el fiscalizador la confirmó/corrigió
  aprendida?: boolean; // ya se usó para entrenar con la corrección del fiscalizador
  vectores?: (number[] | null)[]; // 8x8 por casillero [centena, decena, unidad] (para aprender de las correcciones)
}

export interface VotoOrganizacion {
  id: string;
  codigo: string;
  nombre_partido: string;
  provincial: CeldaVoto;
  distrital: CeldaVoto;
}

// Zonas de trabajo (los recuadros azules): el usuario puede redibujarlas sobre la imagen.
export type NombreZona =
  | 'votos_provincial'
  | 'votos_distrital'
  | 'ciudadanos'
  | 'observaciones'
  | 'miembro_presidente'
  | 'miembro_secretario'
  | 'miembro_tercero';
export type Zonas = Record<NombreZona, BoundingBox>;

export interface MiembroMesa {
  rol: 'PRESIDENTE' | 'SECRETARIO' | 'TERCER_MIEMBRO';
  firma_detectada: boolean; // lo más importante
  datos_presentes: boolean; // nombres y apellidos escritos
  dni_presente: boolean;
  densidad_firma: number;
  densidad_datos: number;
  densidad_dni: number;
  nivel_confianza: number;
  caja?: BoundingBox;
  roi_firma?: BoundingBox;
  confirmado_manual?: boolean;
}

export type EstadoActa = 'APROBADA' | 'APROBADA_CON_OBSERVACIONES' | 'ENVIADA_A_JURADO';

export type CampoNumerico =
  | 'electores_habiles'
  | 'ciudadanos_votaron'
  | 'blanco_provincial'
  | 'nulos_provincial'
  | 'impugnados_provincial'
  | 'emitidos_escrito_provincial'
  | 'blanco_distrital'
  | 'nulos_distrital'
  | 'impugnados_distrital'
  | 'emitidos_escrito_distrital';

export type CampoTexto = 'mesa' | 'departamento' | 'provincia' | 'distrito';

export interface ActaElectoral {
  mesa: string;
  departamento: string;
  provincia: string;
  distrito: string;
  electores_habiles: number;
  ciudadanos_votaron: number;
  blanco_provincial: number;
  nulos_provincial: number;
  impugnados_provincial: number;
  emitidos_escrito_provincial: number; // fila "TOTAL DE VOTOS EMITIDOS" escrita en el acta
  blanco_distrital: number;
  nulos_distrital: number;
  impugnados_distrital: number;
  emitidos_escrito_distrital: number;
  miembros_mesa: MiembroMesa[];
  organizaciones: VotoOrganizacion[];
  hash_sha256: string;
  estado_acta: EstadoActa;
  observaciones: string[]; // alertas de validación
  observaciones_escritas: boolean; // hay texto escrito en el recuadro OBSERVACIONES
  nombre_archivo: string;
  confianza_campos: Partial<Record<CampoNumerico, number>>;
}

export interface PaginaActa {
  url: string;
  width: number;
  height: number;
}

export interface Seleccion {
  id: string;
  eleccion: Eleccion;
}

// Versión guardada de un acta (para comparar la 1.ª con la reescrita).
export interface ActaGuardada {
  id: string;
  etiqueta: string; // A, B, C…
  archivo: { nombre: string; hash: string };
  acta: ActaElectoral;
}

export interface CambioAuditoria {
  campo: string;
  antes: unknown;
  despues: unknown;
}

export interface EntradaAuditoria {
  id?: number;
  timestamp: string;
  usuario: string;
  accion: string;
  hash_acta: string | null;
  cambios: CambioAuditoria[];
}

export interface ResumenEleccion {
  validos: number;
  emitidos: number; // válidos + blancos + nulos + impugnados
  diferencia: number; // emitidos − ciudadanos que votaron
  cuadra: boolean;
  escrito: number; // total emitido escrito en el acta
  escrito_ok: boolean; // el total escrito coincide con la suma
}

export interface ResumenValidacion {
  por_eleccion: Record<Eleccion, ResumenEleccion>;
  firmas: number;
  cuadra: boolean;
  excede_habiles: boolean;
  datos_ok: boolean;
  dni_ok: boolean;
  celdas_pendientes: number;
  errores: string[];
  avisos: string[];
  estado: EstadoActa;
}
