import { useCallback } from 'react';
import { createWorker, type Worker } from 'tesseract.js';
import { useActaStore } from '../store/actaStore';
import { cargarCanvas } from '../utils/cropImage';
import { leerActa } from '../utils/parsearActa';
import { leerNumeroCelda } from '../utils/digitos';
import { leerLuma, percentil } from '../utils/analizarCelda';
import { cajasEncabezado, detectarMarco, zonasPorDefecto } from '../utils/plantilla';
import type { BoundingBox } from '../types/acta';

const base = import.meta.env.BASE_URL;
let workerPromise: Promise<Worker> | null = null;
let leyendo = false; // evita lecturas simultáneas al ajustar zonas rápido
let repetir = false;

// Tesseract (local) solo se usa para la CABECERA IMPRESA (mesa, electores hábiles, dpto/prov/distrito).
// Los números manuscritos los lee el clasificador propio (digitos.ts), casillero por casillero.
function obtenerWorker(): Promise<Worker> {
  if (workerPromise) return workerPromise;
  const p: Promise<Worker> = createWorker('spa', 1, {
    workerPath: `${base}tesseract/worker.min.js`,
    corePath: `${base}tesseract/core`,
    langPath: `${base}tessdata`,
    workerBlobURL: false,
    gzip: true,
  }).catch((e: unknown) => {
    workerPromise = null;
    throw e;
  });
  workerPromise = p;
  return p;
}

// Texto impreso → blanco y negro, ampliado ×2 y con margen: mejora mucho el OCR de cabeceras.
function prepararTexto(canvas: HTMLCanvasElement, b: BoundingBox): HTMLCanvasElement {
  const r = leerLuma(canvas, b.x + b.w * 0.03, b.y + b.h * 0.12, b.w * 0.94, b.h * 0.76);
  const fondo = percentil(r.L, 70);
  const bin = document.createElement('canvas');
  bin.width = Math.max(1, r.w);
  bin.height = Math.max(1, r.h);
  const bctx = bin.getContext('2d')!;
  const img = bctx.createImageData(bin.width, bin.height);
  for (let i = 0; i < r.L.length; i++) {
    const v = r.L[i] < 0.7 * fondo ? 0 : 255;
    img.data[4 * i] = img.data[4 * i + 1] = img.data[4 * i + 2] = v;
    img.data[4 * i + 3] = 255;
  }
  bctx.putImageData(img, 0, 0);
  const out = document.createElement('canvas');
  out.width = bin.width * 2 + 60;
  out.height = bin.height * 2 + 60;
  const octx = out.getContext('2d')!;
  octx.fillStyle = '#fff';
  octx.fillRect(0, 0, out.width, out.height);
  octx.drawImage(bin, 30, 30, bin.width * 2, bin.height * 2);
  return out;
}

export function useOCR() {
  const procesando = useActaStore((s) => s.procesando);

  const ejecutarOCR = useCallback(async () => {
    const s = useActaStore.getState();
    const pagina = s.paginas[s.paginaActual];
    if (!pagina || !s.archivo || !s.zonas) return;
    const zonas = s.zonas;
    s.setProcesando(true, 0.1, 'Leyendo casilleros de votos, firmas y totales…');
    try {
      const canvas = await cargarCanvas(pagina.url);
      await new Promise((r) => setTimeout(r, 30)); // deja pintar el mensaje antes del cálculo
      const acta = leerActa(canvas, zonas, s.nOrganizaciones, { hash: s.archivo.hash, nombre: s.archivo.nombre });
      useActaStore.getState().setActa(acta);

      let aviso = '';
      try {
        useActaStore.getState().setProcesando(true, 0.5, 'Leyendo cabecera impresa (OCR local)…');
        const w = await obtenerWorker();
        const cajas = cajasEncabezado(zonas);
        const leer = async (b: BoundingBox, digitos: boolean) => {
          await w.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: digitos ? '0123456789' : '' } as any);
          const { data } = await w.recognize(prepararTexto(canvas, b));
          return data.text.trim();
        };
        const texto = (t: string) => t.toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ ]/g, '').replace(/\s+/g, ' ').trim();
        const mesa = (await leer(cajas.mesa, true)).replace(/\D/g, '');
        const electores = parseInt((await leer(cajas.electores, true)).replace(/\D/g, ''), 10) || 0;
        useActaStore.getState().aplicarEncabezado({
          mesa, electores_habiles: electores,
          departamento: texto(await leer(cajas.departamento, false)),
          provincia: texto(await leer(cajas.provincia, false)),
          distrito: texto(await leer(cajas.distrito, false)),
        });
      } catch (e) {
        aviso = ` (no se pudo leer la cabecera impresa: ${e instanceof Error ? e.message : String(e)}; complétela a mano)`;
      }
      const a = useActaStore.getState().acta;
      // Si ya había otra acta guardada, se pasa directo a la comparación.
      useActaStore.getState().setPestana(useActaStore.getState().versiones.length ? 'comparar' : 'votos');
      useActaStore.getState().setProcesando(false, 1, `Lectura completa: ${a?.organizaciones.length ?? 0} organizaciones.${aviso}`);
    } catch (e) {
      useActaStore.getState().setProcesando(false, 0, `Error de lectura: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  // Re-lee con las zonas ya ajustadas, conservando lo que el fiscalizador verificó o corrigió.
  const releerZonas = useCallback(async () => {
    if (leyendo) { repetir = true; return; }
    leyendo = true;
    try {
      do {
        repetir = false;
        const s = useActaStore.getState();
        const pagina = s.paginas[s.paginaActual];
        if (!pagina || !s.zonas || !s.archivo || !s.acta) break;
        const canvas = await cargarCanvas(pagina.url);
        const nueva = leerActa(canvas, s.zonas, s.nOrganizaciones, { hash: s.archivo.hash, nombre: s.archivo.nombre });
        useActaStore.getState().reemplazarLectura(nueva);
      } while (repetir);
    } finally { leyendo = false; }
  }, []);

  // Recalcula las zonas automáticamente a partir del marco del formulario en la página actual.
  const detectarZonas = useCallback(async () => {
    const s = useActaStore.getState();
    const pagina = s.paginas[s.paginaActual];
    if (!pagina) return;
    const canvas = await cargarCanvas(pagina.url);
    s.setZonas(zonasPorDefecto(detectarMarco(canvas)));
  }, []);

  // Re-lectura de UNA celda (comparador) con su zona actual.
  const releerCelda = useCallback(async (box: BoundingBox) => {
    const vacio = { texto: '', valor: null as number | null, confianza: 0, ambiguo: false, motivos: [] as string[] };
    const s = useActaStore.getState();
    const pagina = s.paginas[s.paginaActual];
    if (!pagina) return vacio;
    const r = leerNumeroCelda(await cargarCanvas(pagina.url), box);
    return r ? { texto: r.texto, valor: r.valor, confianza: r.confianza, ambiguo: r.ambiguo, motivos: r.motivos } : vacio;
  }, []);

  return { ejecutarOCR, releerZonas, detectarZonas, releerCelda, ocupado: procesando };
}
