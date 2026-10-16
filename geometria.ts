import type { BoundingBox, DiagnosticoFilas, DiagnosticoGeometria } from '../types/acta';
import { leerLuma, percentil, type Fuente } from './analizarCelda';
import * as U from './umbrales';

// Reparte las filas de una columna de votos AJUSTÁNDOLAS a las líneas impresas, y comprueba que
// coincidan con lo configurado. Antes: alto/(nOrg+4) sin verificar → un error de una fila asignaba
// los votos de una organización a la vecina sin ningún aviso.

interface Racha { centro: number; grosor: number }

// Rachas de filas/columnas con cobertura de tinta ≥ umbral. perfil[i] = fracción de píxeles oscuros.
function rachas(perfil: Float32Array, grosorMax: number): Racha[] {
  const out: Racha[] = [];
  let ini = -1;
  for (let i = 0; i <= perfil.length; i++) {
    const on = i < perfil.length && perfil[i] >= U.LINEA_COBERTURA;
    if (on && ini < 0) ini = i;
    if (!on && ini >= 0) {
      const g = i - ini;
      if (g <= grosorMax) out.push({ centro: ini + g / 2, grosor: g }); // más grueso = relleno negro, no línea
      ini = -1;
    }
  }
  return out;
}

const mediana = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };

// Regresión lineal y = a + b·x
function ajuste(xs: number[], ys: number[]): { a: number; b: number } {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
  const b = sxx ? sxy / sxx : 0;
  return { a: my - b * mx, b };
}

function uniforme(z: BoundingBox, filas: number, lineas: number, motivos: string[]): DiagnosticoFilas {
  const paso = z.h / filas;
  return {
    metodo: 'UNIFORME', filas_esperadas: filas, lineas_detectadas: lineas, filas_estimadas: null, paso_px: null,
    paso_esperado_px: paso, desplazamiento_filas: null, residuo: null, confiable: false, motivos,
    bordes: Array.from({ length: filas + 1 }, (_, i) => z.y + i * paso),
  };
}

export function ajustarFilas(f: Fuente, z: BoundingBox, filas: number): DiagnosticoFilas {
  const pasoEsp = z.h / filas;
  const y0r = Math.max(0, Math.floor(z.y - pasoEsp * 0.5));
  const y1r = Math.min(f.height, Math.ceil(z.y + z.h + pasoEsp * 0.5));
  const r = leerLuma(f, z.x, y0r, z.w, y1r - y0r);
  if (!r.w || !r.h) return uniforme(z, filas, 0, ['el recuadro de votos queda fuera de la imagen']);
  const papel = percentil(r.L, 75);
  const perfil = new Float32Array(r.h);
  for (let y = 0; y < r.h; y++) {
    let c = 0;
    for (let x = 0; x < r.w; x++) if (r.L[y * r.w + x] < 0.66 * papel) c++;
    perfil[y] = c / r.w;
  }
  const lineas = rachas(perfil, Math.max(2, Math.ceil(U.LINEA_GROSOR_MAX * pasoEsp))).map((l) => l.centro + y0r);
  if (lineas.length < 3) return uniforme(z, filas, lineas.length, [`solo se detectaron ${lineas.length} líneas impresas: no se pudo verificar la alineación de las filas`]);

  // Paso real: mediana de las separaciones consecutivas plausibles (robusta frente a líneas no detectadas).
  const difs: number[] = [];
  for (let i = 1; i < lineas.length; i++) {
    const d = lineas[i] - lineas[i - 1];
    const m = Math.round(d / pasoEsp);
    if (m >= 1 && m <= 2 && Math.abs(d / m - pasoEsp) <= 0.35 * pasoEsp) difs.push(d / m);
  }
  if (difs.length < 2) return uniforme(z, filas, lineas.length, ['las líneas detectadas no forman una rejilla regular']);
  let paso = mediana(difs);

  // Ajuste de la rejilla y = a + b·idx, descartando líneas que no encajan.
  let idx = lineas.map((y) => Math.round((y - lineas[0]) / paso));
  let ys = lineas.slice();
  let a = lineas[0], b = paso;
  for (let it = 0; it < 3; it++) {
    const vistos = new Set<number>();
    const xs2: number[] = [], ys2: number[] = [];
    idx.forEach((k, i) => { if (!vistos.has(k)) { vistos.add(k); xs2.push(k); ys2.push(ys[i]); } });
    if (xs2.length < 3) break;
    ({ a, b } = ajuste(xs2, ys2));
    const res = xs2.map((k, i) => Math.abs(a + b * k - ys2[i]) / b);
    const ok = xs2.map((_, i) => res[i] <= 0.25);
    if (ok.every(Boolean)) { idx = xs2; ys = ys2; break; }
    idx = xs2.filter((_, i) => ok[i]); ys = ys2.filter((_, i) => ok[i]);
    if (idx.length < 3) break;
  }
  const resid = idx.map((k, i) => Math.abs(a + b * k - ys[i]) / b);
  const residuo = resid.length ? resid.reduce((s, v) => s + v, 0) / resid.length : 1;
  paso = b;

  const s = Math.round((z.y - a) / b);
  const y0 = a + s * b;
  const desplazamiento = (y0 - z.y) / b;
  const filasEst = z.h / b;
  const enZona = idx.filter((_, i) => ys[i] >= z.y - 0.25 * b && ys[i] <= z.y + z.h + 0.25 * b).length;

  const motivos: string[] = [];
  const minLineas = Math.max(4, Math.ceil(U.LINEAS_MIN_FRAC * (filas + 1)));
  if (idx.length < minLineas) motivos.push(`solo ${idx.length} líneas encajan en la rejilla (se esperaban ≥ ${minLineas})`);
  if (residuo > U.RESIDUO_MAX) motivos.push(`las filas no son regulares (error medio ${residuo.toFixed(2)} filas)`);
  if (Math.abs(filasEst - filas) > U.FILAS_TOLERANCIA) {
    motivos.push(`el recuadro mide ≈${filasEst.toFixed(1)} filas pero hay ${filas} configuradas (${filas - 4} organizaciones + 4 filas de totales): revise «N.° organizaciones» o el recuadro`);
  }
  if (Math.abs(desplazamiento) > U.DESPLAZAMIENTO_AVISO) motivos.push(`la primera fila impresa está corrida ${desplazamiento.toFixed(2)} filas respecto del recuadro`);
  const confiable = motivos.length === 0;

  return {
    metodo: 'LINEAS', filas_esperadas: filas, lineas_detectadas: enZona, filas_estimadas: Math.round(filasEst * 10) / 10,
    paso_px: paso, paso_esperado_px: pasoEsp, desplazamiento_filas: Math.round(desplazamiento * 100) / 100,
    residuo: Math.round(residuo * 1000) / 1000, confiable, motivos,
    bordes: Array.from({ length: filas + 1 }, (_, i) => y0 + i * b),
  };
}

// Líneas verticales cerca de los bordes de las dos columnas de votos.
export function verificarColumnas(f: Fuente, prov: BoundingBox, dist: BoundingBox) {
  const colW = Math.max(prov.w, dist.w);
  const x0 = Math.max(0, Math.floor(prov.x - 0.4 * colW));
  const x1 = Math.min(f.width, Math.ceil(dist.x + dist.w + 0.4 * colW));
  const y0 = Math.max(0, Math.floor(prov.y));
  const y1 = Math.min(f.height, Math.ceil(prov.y + prov.h));
  const r = leerLuma(f, x0, y0, x1 - x0, y1 - y0);
  const separacion = dist.x - (prov.x + prov.w);
  const vacio = { desfase_izq_px: null as number | null, desfase_der_px: null as number | null, separacion_px: separacion };
  if (!r.w || !r.h) return vacio;
  const papel = percentil(r.L, 75);
  const perfil = new Float32Array(r.w);
  for (let x = 0; x < r.w; x++) {
    let c = 0;
    for (let y = 0; y < r.h; y++) if (r.L[y * r.w + x] < 0.66 * papel) c++;
    perfil[x] = c / r.h;
  }
  const centros = rachas(perfil, Math.max(3, Math.ceil(0.08 * colW))).map((l) => l.centro + x0);
  const cerca = (esperado: number) => {
    let mejor: number | null = null;
    for (const c of centros) if (Math.abs(c - esperado) <= 0.4 * colW && (mejor === null || Math.abs(c - esperado) < Math.abs(mejor - esperado))) mejor = c;
    return mejor === null ? null : Math.round((mejor - esperado) * 10) / 10;
  };
  return { desfase_izq_px: cerca(prov.x), desfase_der_px: cerca(dist.x + dist.w), separacion_px: separacion };
}

// Recortes fuera de la imagen o demasiado pequeños.
export function cajaValida(b: BoundingBox, W: number, H: number): boolean {
  return b.w >= U.CELDA_MIN_PX && b.h >= U.CELDA_MIN_PX && b.x >= -1 && b.y >= -1 && b.x + b.w <= W + 1 && b.y + b.h <= H + 1;
}

export function diagnosticarGeometria(f: Fuente, prov: BoundingBox, dist: BoundingBox, filas: number): DiagnosticoGeometria {
  const provincial = ajustarFilas(f, prov, filas);
  const distrital = ajustarFilas(f, dist, filas);
  const columnas = verificarColumnas(f, prov, dist);
  const problemas: string[] = [];
  if (!provincial.confiable) problemas.push(...provincial.motivos.map((m) => `Provincial: ${m}`));
  if (!distrital.confiable) problemas.push(...distrital.motivos.map((m) => `Distrital: ${m}`));
  const colW = Math.max(prov.w, dist.w);
  if (provincial.metodo === 'LINEAS' && distrital.metodo === 'LINEAS' && provincial.paso_px && distrital.paso_px) {
    const dy = Math.abs(provincial.bordes[0] - distrital.bordes[0]) / provincial.paso_px;
    if (dy > 0.25) problemas.push(`las filas de Provincial y Distrital no coinciden (${dy.toFixed(2)} filas de diferencia)`);
  }
  for (const [lado, d] of [['izquierdo', columnas.desfase_izq_px], ['derecho', columnas.desfase_der_px]] as const) {
    if (d !== null && Math.abs(d) > 0.12 * colW) problemas.push(`el borde ${lado} de las columnas de votos está desplazado ${d} px respecto de la línea impresa`);
  }
  if (Math.abs(columnas.separacion_px) > 0.1 * colW) problemas.push(`las columnas Provincial y Distrital no son contiguas (separación ${Math.round(columnas.separacion_px)} px)`);
  return { provincial, distrital, columnas, recortes_invalidos: [], problemas, confiable: problemas.length === 0 };
}
