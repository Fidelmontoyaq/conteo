import type { CeldaVoto } from '../types/acta';
import { agregarMuestras, type Muestra } from './digitos';

// El sistema aprende de las correcciones del fiscalizador: cada celda confirmada/corregida
// guarda sus dígitos (8x8 + etiqueta) en IndexedDB y mejora lecturas futuras. 100 % local.
const DB = 'acta-muestras';
const STORE = 'm';

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cargarMuestras(): Promise<number> {
  try {
    const db = await abrir();
    const filas = await new Promise<Muestra[]>((resolve, reject) => {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      r.onsuccess = () => resolve(r.result as Muestra[]);
      r.onerror = () => reject(r.error);
    });
    db.close();
    agregarMuestras(filas.map((f) => ({ x: f.x, y: f.y })));
    return filas.length;
  } catch { return 0; }
}

async function guardar(ms: Muestra[]) {
  try {
    const db = await abrir();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      ms.forEach((m) => tx.objectStore(STORE).add(m));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) { console.error('Aprendizaje: no se pudo guardar', e); }
}

// Devuelve true si aprendió algo. Solo aprende si el número de casilleros con tinta == nº de dígitos del valor.
export function aprenderCelda(c: CeldaVoto): boolean {
  if (c.estado !== 'MANUSCRITO' || c.valor === null || !c.vectores) return false;
  const ds = String(c.valor);
  const vs = c.vectores.filter((v): v is number[] => !!v);
  if (vs.length !== ds.length) return false;
  const ms = vs.map((x, i) => ({ x, y: Number(ds[i]) }));
  agregarMuestras(ms);
  void guardar(ms);
  return true;
}
