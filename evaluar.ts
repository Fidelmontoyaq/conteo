// Evalúa una o varias lecturas exportadas (JSON de «Exportar acta procesada») contra etiquetas hechas a mano.
//
//   npm run evaluar -- --etiquetas evaluacion/etiquetas.json anterior=lecturas_v1/ nuevo=lecturas_v2/
//
// Cada argumento `nombre=ruta` es un archivo .json o una carpeta de .json exportados. Se emparejan con las
// etiquetas por hash SHA-256, luego por N.° de mesa, luego por nombre de archivo. Usar las MISMAS imágenes en
// todas las corridas es lo que hace comparable «antes» y «después».
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { emparejar, evaluarActa, evaluarTexto, metricasVacias, resumen, sumar, type ActaEtiquetada, type Metricas } from '../src/eval/metricas';
import type { ActaElectoral } from '../src/types/acta';

const args = process.argv.slice(2);
let etiquetasRuta = 'evaluacion/etiquetas.json';
let salida: string | null = null;
const corridas: { nombre: string; ruta: string }[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--etiquetas') etiquetasRuta = args[++i];
  else if (args[i] === '--salida') salida = args[++i];
  else if (args[i].includes('=')) { const [nombre, ...r] = args[i].split('='); corridas.push({ nombre, ruta: r.join('=') }); }
  else corridas.push({ nombre: args[i], ruta: args[i] });
}
if (!corridas.length || !existsSync(etiquetasRuta)) {
  console.error('Uso: npm run evaluar -- --etiquetas evaluacion/etiquetas.json [--salida resultados.json] nombre=archivo_o_carpeta ...');
  process.exit(2);
}

const etiquetas: ActaEtiquetada[] = (JSON.parse(readFileSync(etiquetasRuta, 'utf8')).actas ?? []) as ActaEtiquetada[];
const archivos = (ruta: string): string[] => (statSync(ruta).isDirectory() ? readdirSync(ruta).filter((f) => f.endsWith('.json')).map((f) => join(ruta, f)) : [ruta]);

const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)} %`);
const resultados: Record<string, { metricas: Metricas; resumen: ReturnType<typeof resumen>; cer: number | null; wer: number | null; sin_etiqueta: string[] }> = {};

for (const c of corridas) {
  let m = metricasVacias();
  const sinEtiqueta: string[] = [];
  let cer = 0, wer = 0, nTexto = 0;
  for (const f of archivos(c.ruta)) {
    const j = JSON.parse(readFileSync(f, 'utf8'));
    const acta = (j.acta ?? j) as ActaElectoral;
    const et = emparejar(etiquetas, acta);
    if (!et) { sinEtiqueta.push(f); continue; }
    m = sumar(m, evaluarActa(et, acta));
    const t = evaluarTexto(et, acta);
    if (t.cer !== null) { cer += t.cer; wer += t.wer!; nTexto++; }
  }
  resultados[c.nombre] = { metricas: m, resumen: resumen(m), cer: nTexto ? cer / nTexto : null, wer: nTexto ? wer / nTexto : null, sin_etiqueta: sinEtiqueta };
}

const nombres = Object.keys(resultados);
const fila = (titulo: string, f: (n: string) => string) => console.log(`| ${titulo} | ${nombres.map(f).join(' | ')} |`);
console.log(`\nEtiquetas: ${etiquetas.length} actas · ${etiquetasRuta}\n`);
console.log(`| Métrica | ${nombres.join(' | ')} |`);
console.log(`|---|${nombres.map(() => '---').join('|')}|`);
fila('Actas evaluadas', (n) => String(resultados[n].metricas.actas));
fila('Casillas etiquetadas', (n) => String(resultados[n].metricas.celdas));
fila('Exactitud por dígito', (n) => pct(resultados[n].resumen.exactitud_por_digito));
fila('Exactitud por casilla (sobre las que lee)', (n) => pct(resultados[n].resumen.exactitud_por_casilla));
fila('Cobertura (casillas sin abstenerse)', (n) => pct(resultados[n].resumen.cobertura));
fila('Vacías mal clasificadas', (n) => `${pct(resultados[n].resumen.tasa_vacias_mal)} (${resultados[n].metricas.vacias_mal})`);
fila('Falsas vacías (número leído como vacío)', (n) => String(resultados[n].metricas.falsas_vacias));
fila('Confusiones 0 ↔ vacío', (n) => String(resultados[n].metricas.confusiones_cero_vacio));
fila('Errores de asociación (sospecha)', (n) => String(resultados[n].metricas.errores_asociacion));
fila('Errores SIN marcar para revisión', (n) => String(resultados[n].metricas.errores_silenciosos));
fila('Requieren revisión manual', (n) => pct(resultados[n].resumen.porcentaje_revision_manual));
fila('CER cabecera', (n) => pct(resultados[n].cer));
fila('WER cabecera', (n) => pct(resultados[n].wer));
for (const n of nombres) if (resultados[n].sin_etiqueta.length) console.log(`\n[${n}] sin etiqueta (no evaluadas): ${resultados[n].sin_etiqueta.join(', ')}`);
if (salida) writeFileSync(salida, JSON.stringify(resultados, null, 2));
if (nombres.every((n) => resultados[n].metricas.actas === 0)) { console.error('\nNinguna lectura se pudo emparejar con las etiquetas.'); process.exit(1); }
