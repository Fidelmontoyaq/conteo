// Copia los binarios OCR/PDF desde node_modules a /public (sin red).
// Nunca lanza error: si falta algo, avisa y el README explica la descarga manual.
import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const raiz = process.cwd();
const nm = (...p) => join(raiz, 'node_modules', ...p);
const pub = (...p) => join(raiz, 'public', ...p);

function copiar(origen, destino) {
  try {
    if (!existsSync(origen)) {
      console.warn('[vendorizar] No encontrado:', origen);
      return;
    }
    mkdirSync(dirname(destino), { recursive: true });
    copyFileSync(origen, destino);
    console.log('[vendorizar] OK', destino);
  } catch (e) {
    console.warn('[vendorizar] Falló', origen, e);
  }
}

// 1) Worker de Tesseract
copiar(nm('tesseract.js', 'dist', 'worker.min.js'), pub('tesseract', 'worker.min.js'));

// 2) Core WASM (todas las variantes: simd/no-simd, lstm/legacy)
const core = nm('tesseract.js-core');
if (existsSync(core)) {
  for (const f of readdirSync(core)) {
    if (/^tesseract-core.*\.(js|wasm)$/.test(f)) copiar(join(core, f), pub('tesseract', 'core', f));
  }
} else {
  console.warn('[vendorizar] tesseract.js-core no instalado');
}

// 3) Worker de pdf.js
copiar(nm('pdfjs-dist', 'build', 'pdf.worker.min.js'), pub('pdf.worker.min.js'));

// 4) Modelos de idioma (gz, como espera Tesseract.js por defecto)
for (const lang of ['spa', 'eng']) {
  copiar(
    nm('@tesseract.js-data', lang, '4.0.0_best_int', `${lang}.traineddata.gz`),
    pub('tessdata', `${lang}.traineddata.gz`),
  );
}
