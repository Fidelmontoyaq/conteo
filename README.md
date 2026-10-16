# Fiscalización de Actas Electorales · Módulo Jurisdiccional (offline-first)

React 18 + TypeScript + Vite + Tailwind (npm) + Zustand.
OCR con Tesseract.js (WASM local), PDF con pdfjs-dist (worker local).
Sin APIs en la nube, sin CDN, sin backend. Auditoría en IndexedDB.

## Uso local
```bash
npm install     # el postinstall copia los binarios OCR a /public automáticamente
npm run dev
npm run build   # genera /dist (sitio estático)
```

## Binarios OCR en /public
`npm install` ejecuta `scripts/vendorizar.mjs`, que deja:
```
public/pdf.worker.min.js
public/tesseract/worker.min.js
public/tesseract/core/tesseract-core*.js (variantes simd/lstm)
public/tessdata/spa.traineddata.gz
public/tessdata/eng.traineddata.gz
```
Si falló (sin red durante install, etc.), vea "PASOS PARA VENDORIZAR OCR" abajo.
Puede commitear `/public` a Git para no depender del postinstall.

## GitHub + Vercel (manual)
```bash
git init && git add . && git commit -m "acta-fiscalizador"
git remote add origin <URL-de-su-repo> && git push -u origin main
```
En Vercel: *Add New Project* → importe el repo → Framework "Vite" →
Build `npm run build`, Output `dist`. No requiere variables de entorno.

## Flujo
1. Cargar PDF/imagen (se calcula SHA-256 local).
2. Ejecutar OCR → se rellena la tabla editable, firmas y cabecera.
3. Revisar filas en semáforo; usar el Comparador (recorte vs OCR vs sugerido).
4. Corregir y confirmar; el estado del acta se recalcula en vivo.
5. Exportar JSON (incluye acta, validación y log de auditoría).

## Formato del acta (dos elecciones)
Cada organización tiene DOS celdas: *Municipal PROVINCIAL* y *Municipal DISTRITAL*
(la última columna del acta es solo el N° de orden y se ignora). Por cada celda:
- **Negro** (relleno oscuro) → no cuenta.
- **Vacío** (sin tinta) → nadie votó → vale 0.
- **Con voto** (tinta azul o negra) → se aísla la tinta y se lee con OCR de dígitos.

Cada elección debe cuadrar por separado: válidos + blancos + nulos + impugnados = ciudadanos que votaron.
Si no se encuentran los encabezados PROVINCIAL / DISTRITAL, use «Calibrar columnas» y re-lea.

## Limitaciones honestas
- Tesseract está entrenado para texto impreso: los dígitos manuscritos se leen con
  confianza baja o errónea. Por eso toda lectura dudosa va al fiscalizador.
- La detección de firmas usa densidad de tinta en una ROI estimada a partir de las
  etiquetas "PRESIDENTE / SECRETARIO / TERCER MIEMBRO"; confirme manualmente.
- El parser de la tabla es heurístico (código + nombre + votos en una misma línea).
  Ajuste `src/utils/parsearActa.ts` al formato real de la cédula escaneada.
- Esta herramienta apoya la revisión; no reemplaza la decisión del JEE/JNE.

## PASOS PARA VENDORIZAR OCR (manual, si el postinstall no los copió)

| Archivo | URL oficial | Destino |
|---|---|---|
| `worker.min.js` | https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js | `public/tesseract/worker.min.js` |
| Core WASM (todos los `tesseract-core*.js`) | https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0/ (o `node_modules/tesseract.js-core/`) | `public/tesseract/core/` |
| `spa.traineddata.gz` | https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0_best_int/spa.traineddata.gz | `public/tessdata/spa.traineddata.gz` |
| `eng.traineddata.gz` | https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0_best_int/eng.traineddata.gz | `public/tessdata/eng.traineddata.gz` |
| `pdf.worker.min.js` | https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js | `public/pdf.worker.min.js` |

Los `traineddata` deben quedar **comprimidos (`.gz`)**, tal como los lee Tesseract.js por defecto.
Si usa archivos sin comprimir, ponga `gzip: false` en `createWorker` dentro de `src/hooks/useOCR.ts`.


## Lectura de dígitos (v2.0)
Cada celda tiene 3 casilleros [centena][decena][unidad]; cada dígito se lee en el suyo (red 64-64-32-10 sobre 8×8 +
vecinos de correcciones). Todo es local. Estados de una celda:

| Estado | Significado | ¿Suma? |
|---|---|---|
| `MANUSCRITO` | número escrito (un 0 reconocido es un 0 real) | sí |
| `VACIA` | sin tinta; `valor: null`, **no** es un 0 leído | suma 0 (se informa) |
| `ANULADA` | tapada en negro | no |
| `AMBIGUA` | hay tinta pero la lectura no es fiable: trazo débil, hueco entre dígitos, unidad vacía con dígitos a la izquierda, candidatos muy cercanos, o las dos variantes de tinta discrepan | no, hasta que una persona la resuelva |
| `ERROR` | falló el procesamiento o el recorte queda fuera de la imagen | no |

- **Dos variantes de tinta**: luminancia (cualquier tinta oscura) y croma azul (B−R). Si coinciden, la lectura es firme; si
  discrepan, NO se mezclan: queda `AMBIGUA` con ambos candidatos. Si el acta está escrita en azul, un dígito sin tinta azul se marca.
- **Casilleros pequeños** (< 40 px de alto) se amplían (bilineal) antes de reconocer.
- **Geometría**: las filas se ajustan a las líneas impresas; si el número de filas no coincide con «N.° organizaciones»
  o no se pueden verificar las líneas, la validación da el error *ALINEACIÓN NO VERIFICADA* (se levanta ajustando los
  recuadros o confirmando la rejilla a mano). Ver el panel «Alineación de filas y columnas» y el botón ▦ Rejilla.
- **Enderezado**: se corrige la rotación de la hoja (la imagen original se conserva y se puede volver a ella antes de leer).
- **Validación** (`src/utils/validaciones.ts`) es independiente del reconocimiento: solo advierte. No corrige lecturas,
  no completa dígitos para cuadrar sumas y no ofrece «valores sugeridos».
- **Auditoría**: cada cambio guarda origen (AUTO/HUMANO) y motivo; la lectura automática original (`valor_ocr`,
  `estado_ocr`, `texto_ocr`) nunca se sobrescribe.

## Pruebas y evaluación
```bash
npm test          # pruebas unitarias (vitest), sin navegador
npm run evaluar   # métricas contra actas etiquetadas: ver evaluacion/README.md
```

## Limitaciones conocidas
- **No hay cifra de precisión**: no existen actas etiquetadas en el repositorio. Los umbrales «SIN CALIBRAR» (`src/utils/umbrales.ts`) son puntos de partida.
- **No se corrige la perspectiva** (solo la rotación): sin imágenes reales no se puede validar.
- **El modelo no se cambió.** Sigue siendo el MLP 8×8 entrenado con muy pocos dígitos reales de una sola acta. Un modelo ONNX
  (p. ej. ONNX Runtime Web) es una alternativa viable en el navegador, pero no se sustituye sin medir una mejora real.
- La limpieza de «líneas» de la variante de luminancia borra el trazo de un 1 que cubra > 70 % del alto; la variante azul lo recupera, pero en tinta negra queda como lectura débil/ambigua.
- Una lectura completa tarda ≈0.5 s en el hilo principal (acta de 2382×3369, 32 organizaciones, medido con una imagen sintética): no se usa Web Worker.
- Los archivos sueltos de la raíz (`App.tsx`, `acta.ts`, `digitos.ts`…) son copias obsoletas de `src/` y nada las importa.
