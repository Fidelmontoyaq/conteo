// Umbrales del lector, en UN solo sitio.
//
// IMPORTANTE: los valores marcados «SIN CALIBRAR» son puntos de partida razonables, NO medidos con
// actas etiquetadas (el proyecto no incluye imágenes con respuesta). Se calibran con `npm run evaluar`
// (ver evaluacion/README.md) y se ajustan aquí. Los demás conservan el valor que ya tenía el código.

export const VERSION_ALGORITMO = '2.0.0';

// ---- Confianza / revisión humana ----
export const UMBRAL_PENDIENTE = 0.75; // por debajo, la celda exige revisión salvo que ya esté verificada
export const MARGEN_AMBIGUO = 0.1; // SIN CALIBRAR: 1.º y 2.º candidato a menos de esto → AMBIGUA
export const CONF_MAX_DIGITO = 0.97; // tope histórico: ninguna lectura automática se presenta como certeza
export const CONF_MAX_HUECO = 0.5; // casilleros con hueco (centena y unidad sin decena)
export const CONF_MAX_BORDE = 0.7; // SIN CALIBRAR: el trazo toca el borde del recorte (puede estar cortado)
export const VACIA_CONF_MAX = 0.97;
export const VACIA_TINTA_SOSPECHOSA = 0.04; // SIN CALIBRAR: «vacía» con más tinta que esto en la celda baja su confianza
export const VACIA_CONF_SOSPECHOSA = 0.7;

// ---- Máscara de tinta ----
export const MASCARA_FRAC_FONDO = 0.66; // píxel de tinta si luminancia < 0.66 × fondo (valor original)
export const LINEAS_UMBRAL_DIGITO = 0.7; // se borran filas/columnas de «tinta» casi completas (líneas impresas)
export const AZUL_DELTA = 30; // SIN CALIBRAR: (B−R) debe superar la mediana de la zona en este margen
export const AZUL_LUMA_MAX = 0.92; // SIN CALIBRAR: y el píxel debe ser más oscuro que 0.92 × fondo
export const TINTA_AZUL_DOMINANTE = 0.6; // SIN CALIBRAR: fracción de casilleros con evidencia azul para decir «acta escrita en azul»

// ---- Casilleros (cada dígito se lee en SU casillero) ----
export const ZONA_CENTRAL = { ih: 0.2, iv: 0.12 }; // decide si hay escritura (evita puntos y bordes)
export const ZONA_AMPLIA = { ih: 0.02, iv: 0.08 }; // recupera el trazo completo
export const SEMILLA_MIN_PX = 8;
export const SEMILLA_FRAC_MAX = 0.06;
export const TINTA_MIN_FRAC = 0.01; // menos tinta que esto no es un dígito…
export const ALTURA_MIN_FRAC = 0.28; // …ni un trazo más bajo que esto
export const DEBIL_MIN_FRAC = 0.003; // SIN CALIBRAR: entre esto y TINTA_MIN_FRAC = «trazo débil» (AMBIGUA), no «vacío»

// ---- Ampliación de casilleros pequeños ----
export const ALTO_MIN_PX = 40; // casilleros más bajos que esto se amplían antes de reconocer
export const ALTO_OBJETIVO_PX = 56;
export const FACTOR_AMPLIACION_MAX = 4;

// ---- Geometría de la tabla ----
export const LINEA_COBERTURA = 0.55; // SIN CALIBRAR: fracción de la fila cubierta de tinta para ser «línea impresa»
export const LINEA_GROSOR_MAX = 0.12; // una racha más gruesa que esto (en filas) es un relleno negro, no una línea
export const LINEAS_MIN_FRAC = 0.6; // SIN CALIBRAR: líneas detectadas necesarias respecto de las esperadas
export const FILAS_TOLERANCIA = 0.75; // SIN CALIBRAR: diferencia admitida (en filas) entre el alto del recuadro y las filas configuradas
export const RESIDUO_MAX = 0.08; // SIN CALIBRAR: error medio del ajuste (en filas)
export const DESPLAZAMIENTO_AVISO = 0.5; // SIN CALIBRAR: corrimiento (en filas) que exige confirmación humana
export const CELDA_MIN_PX = 6; // recorte más pequeño que esto es inválido

// ---- Enderezado ----
export const ANGULO_MAX = 6; // grados explorados a cada lado
export const ANGULO_MIN_APLICAR = 0.35; // SIN CALIBRAR: giros menores no se corrigen
export const NITIDEZ_MIN_APLICAR = 1.05; // SIN CALIBRAR: mejora mínima de la nitidez de líneas para aceptar el giro
