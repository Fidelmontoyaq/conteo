import { useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useActaStore } from '../store/actaStore';
import { sha256Hex } from '../utils/hash';
import { cargarCanvas, cargarImagen } from '../utils/cropImage';
import { detectarMarco, zonasPorDefecto } from '../utils/plantilla';
import { enderezarPagina } from '../utils/enderezar';
import type { PaginaActa } from '../types/acta';

// Worker local servido desde /public (copiado por scripts/vendorizar.mjs).
pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.js`;

export function usePDFLoader() {
  const cargar = useCallback(async (file: File) => {
    const s = useActaStore.getState();
    s.setProcesando(true, 0, 'Calculando hash SHA-256…');
    try {
      const hash = await sha256Hex(file);
      let paginas: PaginaActa[] = [];

      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const data = new Uint8Array(await file.arrayBuffer());
        const pdf = await pdfjsLib.getDocument({ data }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          s.setProcesando(true, (i - 1) / pdf.numPages, `Convirtiendo página ${i}/${pdf.numPages}…`);
          const page = await pdf.getPage(i);
          // ~2400 px de ancho: los casilleros de dígitos quedan con ~40 px, suficiente para leer manuscritos
          const scale = Math.min(4, 2400 / page.getViewport({ scale: 1 }).width);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
          const blob = await new Promise<Blob>((res, rej) =>
            canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob falló'))), 'image/png'),
          );
          paginas.push({ url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height });
        }
      } else {
        const url = URL.createObjectURL(file);
        const img = await cargarImagen(url);
        paginas = [{ url, width: img.naturalWidth, height: img.naturalHeight }];
      }

      // Enderezado de rotación: la imagen original se conserva; las coordenadas serán sobre la imagen de trabajo.
      s.setProcesando(true, 0.9, 'Comprobando la inclinación de la hoja…');
      paginas = await Promise.all(paginas.map((p) => enderezarPagina(p).catch(() => p)));

      useActaStore.getState().setArchivo({ nombre: file.name, hash }, paginas);
      // Zonas de trabajo por defecto: se ubica el formulario en la hoja y se aplica la plantilla ONPE 4b.
      const canvas = await cargarCanvas(paginas[0].url);
      useActaStore.getState().setZonas(zonasPorDefecto(detectarMarco(canvas)));
      useActaStore.getState().setProcesando(false, 1, (paginas[0].rotacion_grados ? `Archivo cargado (hoja enderezada ${paginas[0].rotacion_grados.toFixed(2)}°). ` : 'Archivo cargado. ') + 'Revise las zonas y pulse «Leer acta».');
    } catch (e) {
      useActaStore.getState().setProcesando(false, 0, `Error al cargar: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  return { cargar };
}
