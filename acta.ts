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

// MANUSCRITO = hay número escrito (incluye un 0 reconocido) · VACIA = casilla sin tinta (valor null: NO es un 0 leído;
// para la suma aporta 0 y se informa) · ANULADA = tapada en negro (no cuenta) ·
// AMBIGUA = hay tinta pero la lectura no es fiable (requiere revisión humana) · ERROR = falló el procesamiento de la casilla.
export type EstadoCelda = 'MANUSCRITO' | 'VACIA' | 'ANULADA' | 'AMBIGUA' | 'ERROR';

export interface CandidatoDigito {
  digito: number;
  p: number; // puntuación del clasificador (NO calibrada como probabilidad)
}

// Lectura de UN casillero (centena=0, decena=1, unidad=2).
export interface DigitoLeido {
  k: number;
  digito: number;
  confianza: number; // misma escala que CeldaVoto.confianza (sin calibrar)
  margen: number; // diferencia entre el 1.º y el 2.º candidato (más bajo = más dudoso)
  candidatos: CandidatoDigito[]; // mejores candidatos de la variante principal
  variante: 'LUMINANCIA' | 'AZUL' | 'AMBAS';
  acuerdo: boolean | null; // null si solo hubo una variante utilizable
  alternativa?: { variante: 'LUMINANCIA' | 'AZUL'; digito: number }; // lectura contradictoria de la otra variante
}

export interface CeldaVoto {
  estado: EstadoCelda;
  valor: number | null; // valor vigente (editable)
  valor_ocr: number | null; // lectura automática original (evidencia forense; nunca se sobrescribe)
  estado_ocr?: EstadoCelda; // estado según la lectura automática original
  texto_ocr?: string | null; // lectura textual cruda por casillero, p. ej. "5·7" (· = casillero sin dígito)
  confianza: number; // 0..1
  tinta: number;
  oscuro: number;
  bbox?: BoundingBox;
  fila?: number; // índice de fila (0 = primera organización) con el que se recortó la celda
  verificada: boolean; // el fiscalizador la confirmó/corrigió
  origen_valor?: 'AUTO' | 'HUMANO'; // quién fijó el valor vigente
  aprendida?: boolean; // ya se usó para entrenar con la corrección del fiscalizador
  vectores?: (number[] | null)[]; // 8x8 por casillero [centena, decena, unidad] (para aprender de las correcciones)
  digitos?: DigitoLeido[]; // detalle por casillero (candidatos, margen, acuerdo entre variantes)
  motivos?: string[]; // por qué la lectura es dudosa o ambigua
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

// Diagnóstico de cómo se repartieron las filas de una columna de votos (ver utils/geometria.ts).
export interface DiagnosticoFilas {
  metodo: 'LINEAS' | 'UNIFORME'; // LINEAS = ajustado a las líneas impresas · UNIFORME = reparto parejo sin verificar
  filas_esperadas: number;
  lineas_detectadas: number;
  filas_estimadas: number | null; // filas que caben en el recuadro según el paso medido entre líneas
  paso_px: number | null;
  paso_esperado_px: number;
  desplazamiento_filas: number | null; // cuánto se corrió la 1.ª fila respecto del recuadro (en filas)
  residuo: number | null; // error medio del ajuste (en filas)
  confiable: boolean;
  motivos: string[];
  bordes: number[]; // filas_esperadas + 1 coordenadas Y (px de la imagen) de los bordes de fila usados para recortar
}

export interface DiagnosticoGeometria {
  provincial: DiagnosticoFilas;
  distrital: DiagnosticoFilas;
  columnas: { desfase_izq_px: number | null; desfase_der_px: number | null; separacion_px: number };
  recortes_invalidos: string[]; // celdas fuera de la imagen o demasiado pequeñas
  problemas: string[];
  confiable: boolean;
}

export interface LecturaMeta {
  version_algoritmo: string;
  tinta_dominante: 'AZUL' | 'OTRA' | 'INDETERMINADA';
  geometria: DiagnosticoGeometria;
  alineacion_confirmada: boolean; // una persona revisó la rejilla sobre la imagen y la dio por buena
  // Con qué clasificador se leyó (trazabilidad de evaluaciones: no entrenar y medir con la misma acta)
  clasificador?: { sin_aprendizaje: boolean; semillas_excluidas: boolean; muestras_disponibles: number };
}

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
  lectura_meta?: LecturaMeta; // cómo se leyó (geometría, tinta); ausente en JSON de versiones anteriores
}

export interface ImagenPagina { url: string; width: number; height: number }

export interface PaginaActa {
  url: string; // imagen de TRABAJO: todas las coordenadas (zonas, bbox) son sobre ESTA imagen
  width: number;
  height: number;
  original?: ImagenPagina; // imagen tal como se cargó (solo si se enderezó); nunca se modifica
  enderezada?: ImagenPagina; // versión girada para corregir la inclinación
  rotacion_grados?: number; // giro aplicado en `enderezada` (0 = ninguno)
  nitidez_rotacion?: number; // mejora de la nitidez de líneas al enderezar (≥1)
  usando_original?: boolean; // la persona pidió trabajar con la imagen sin enderezar
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
  paginas: PaginaActa[]; // imágenes de esa acta (para comparar recuadros borrosos)
  paginaActual: number;
  zonas: Zonas | null;
}

export type Pestana = 'votos' | 'resumen' | 'comparar';

export interface CambioAuditoria {
  campo: string;
  antes: unknown;
  despues: unknown;
  origen?: 'AUTO' | 'HUMANO'; // quién produjo el cambio (ausente en entradas antiguas)
  motivo?: string; // razón indicada por la persona o generada por el sistema
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
  celdas_ambiguas: number; // con tinta pero sin lectura fiable ni resolución humana (la suma no es confiable)
  celdas_vacias: number; // sin tinta: suman 0 en la aritmética, pero NO son un 0 leído
  celdas_sospechosas: number; // número leído mayor que los ciudadanos que votaron (solo advertencia)
  alineacion_ok: boolean; // rejilla verificada contra las líneas impresas o confirmada por una persona
  errores: string[];
  avisos: string[];
  estado: EstadoActa;
}
