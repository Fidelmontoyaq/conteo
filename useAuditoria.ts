import { useEffect, useState } from 'react';
import type { EntradaAuditoria } from '../types/acta';

// Log de auditoría en IndexedDB (local). Este archivo NO importa el store para evitar ciclos.
const DB = 'acta-auditoria';
const STORE = 'log';

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function registrarAuditoria(entrada: Omit<EntradaAuditoria, 'id'>): Promise<void> {
  try {
    const db = await abrir();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).add(entrada);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.error('Auditoría: no se pudo registrar', e);
  }
}

export async function listarAuditoria(): Promise<EntradaAuditoria[]> {
  try {
    const db = await abrir();
    const filas = await new Promise<EntradaAuditoria[]>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as EntradaAuditoria[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return filas.reverse(); // más reciente primero
  } catch {
    return [];
  }
}

export async function limpiarAuditoria(): Promise<void> {
  try {
    const db = await abrir();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.error(e);
  }
}

// `version` cambia cada vez que el store registra algo → recarga la lista.
export function useAuditoria(version: number) {
  const [entradas, setEntradas] = useState<EntradaAuditoria[]>([]);
  useEffect(() => {
    let vivo = true;
    listarAuditoria().then((r) => vivo && setEntradas(r));
    return () => { vivo = false; };
  }, [version]);
  return entradas;
}
