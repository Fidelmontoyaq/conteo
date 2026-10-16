import { create } from 'zustand';
import type {
  ActaElectoral, ActaGuardada, CambioAuditoria, PaginaActa as Pagina, CampoNumerico, CampoTexto, CeldaVoto, Eleccion,
  MiembroMesa, NombreZona, PaginaActa, Pestana, Seleccion, VotoOrganizacion, Zonas, BoundingBox,
} from '../types/acta';
import { validarActa } from '../hooks/useValidacionActa';
import { registrarAuditoria } from '../hooks/useAuditoria';
import { celdaNueva } from '../utils/celdas';
import { aprenderCelda } from '../utils/aprendizaje';
import { fusionarLecturas } from '../utils/fusionar';

// Libera las imágenes de una página (la de trabajo, la original y la enderezada).
const revocarPagina = (p: Pagina) => {
  new Set([p.url, p.original?.url, p.enderezada?.url]).forEach((u) => { if (u) URL.revokeObjectURL(u); });
};
const ACCIONES_AUTO = new Set(['ACTA_CARGADA', 'LECTURA_EJECUTADA', 'RELECTURA_CON_ZONAS']);

const recalcular = (a: ActaElectoral): ActaElectoral => {
  const r = validarActa(a);
  return { ...a, estado_acta: r.estado, observaciones: [...r.errores, ...r.avisos] };
};

type Encabezado = Partial<Pick<ActaElectoral, 'mesa' | 'departamento' | 'provincia' | 'distrito' | 'electores_habiles'>>;

interface Estado {
  usuario: string;
  archivo: { nombre: string; hash: string } | null;
  paginas: PaginaActa[];
  paginaActual: number;
  acta: ActaElectoral | null;
  versiones: ActaGuardada[]; // actas anteriores (misma mesa) para comparar
  zonas: Zonas | null; // recuadros de trabajo
  zonaActiva: NombreZona | null; // zona que se está dibujando
  nOrganizaciones: number;
  pestana: Pestana;
  vincularVotos: boolean; // al estirar alto/posición vertical de una columna de votos, la otra lo copia
  autoRelectura: boolean; // re-leer solo al soltar un recuadro ajustado
  seleccion: Seleccion | null;
  procesando: boolean;
  progreso: number;
  mensaje: string;
  auditoriaVersion: number;

  setUsuario: (u: string) => void;
  setProcesando: (p: boolean, progreso?: number, mensaje?: string) => void;
  setArchivo: (a: { nombre: string; hash: string }, paginas: PaginaActa[]) => void;
  setPaginaActual: (i: number) => void;
  setActa: (a: ActaElectoral) => void;
  aplicarEncabezado: (p: Encabezado) => void;
  setZonas: (z: Zonas) => void;
  setZonaVivo: (n: NombreZona, b: BoundingBox) => void; // durante el arrastre (sin auditoría)
  confirmarZona: (n: NombreZona, antes: BoundingBox) => void; // al soltar (registra auditoría)
  reemplazarLectura: (a: ActaElectoral) => void;
  setPestana: (p: Pestana) => void;
  setVincularVotos: (v: boolean) => void;
  setAutoRelectura: (v: boolean) => void;
  setZonaActiva: (n: NombreZona | null) => void;
  setNOrg: (n: number) => void;
  quitarVersion: (id: string) => void;
  seleccionar: (s: Seleccion | null) => void;
  setCampoNumerico: (campo: CampoNumerico, valor: number) => void;
  setCampoTexto: (campo: CampoTexto, valor: string) => void;
  setMiembro: (rol: MiembroMesa['rol'], patch: Partial<MiembroMesa>) => void;
  actualizarOrg: (id: string, patch: Partial<Pick<VotoOrganizacion, 'codigo' | 'nombre_partido'>>) => void;
  actualizarCelda: (id: string, e: Eleccion, patch: Partial<CeldaVoto>, motivo?: string) => void;
  confirmarCelda: (id: string, e: Eleccion, motivo?: string) => void;
  confirmarAlineacion: () => void;
  usarImagenOriginal: (usar: boolean) => void;
  agregarOrg: () => void;
  eliminarOrg: (id: string) => void;
}

export const useActaStore = create<Estado>()((set, get) => {
  const log = (accion: string, cambios: CambioAuditoria[]) => {
    const { usuario, archivo } = get();
    const origen = ACCIONES_AUTO.has(accion) ? 'AUTO' : 'HUMANO';
    void registrarAuditoria({ timestamp: new Date().toISOString(), usuario, accion, hash_acta: archivo?.hash ?? null, cambios: cambios.map((c) => ({ origen, ...c })) })
      .then(() => set((s) => ({ auditoriaVersion: s.auditoriaVersion + 1 })));
  };
  const mutarActa = (fn: (a: ActaElectoral) => ActaElectoral) => {
    const a = get().acta;
    if (a) set({ acta: recalcular(fn(a)) });
  };

  return {
    usuario: 'fiscalizador', archivo: null, paginas: [], paginaActual: 0, acta: null, versiones: [],
    zonas: null, zonaActiva: null, nOrganizaciones: 32, pestana: 'votos', vincularVotos: true, autoRelectura: true, seleccion: null,
    procesando: false, progreso: 0, mensaje: '', auditoriaVersion: 0,

    setUsuario: (usuario) => set({ usuario }),
    setProcesando: (procesando, progreso = 0, mensaje = '') => set({ procesando, progreso, mensaje }),

    // Al cargar OTRA acta, la actual (con sus correcciones) se guarda como versión A, B, C…
    setArchivo: (archivo, paginas) => {
      const s = get();
      // Si ya había un acta leída se guarda como versión (con sus imágenes y zonas) para poder compararla.
      const guardar = !!(s.acta && s.archivo);
      if (!guardar) s.paginas.forEach(revocarPagina);
      const versiones: ActaGuardada[] = guardar
        ? [...s.versiones, {
            id: crypto.randomUUID(), etiqueta: String.fromCharCode(65 + s.versiones.length), archivo: s.archivo!, acta: s.acta!,
            paginas: s.paginas, paginaActual: s.paginaActual, zonas: s.zonas,
          }]
        : s.versiones;
      set({ archivo, paginas, paginaActual: 0, acta: null, seleccion: null, versiones, zonaActiva: null });
      log('ACTA_CARGADA', [{ campo: 'archivo', antes: null, despues: `${archivo.nombre} · SHA-256 ${archivo.hash}` }]);
    },

    setPaginaActual: (paginaActual) => set({ paginaActual }),

    setActa: (acta) => {
      set({ acta: recalcular(acta), seleccion: null });
      log('LECTURA_EJECUTADA', [
        { campo: 'filas_leidas', antes: null, despues: acta.organizaciones.length },
        { campo: 'ciudadanos_votaron', antes: null, despues: acta.ciudadanos_votaron },
      ]);
    },

    aplicarEncabezado: (p) => mutarActa((a) => ({ ...a, ...p })),
    setZonas: (zonas) => set({ zonas }),
    setZonaVivo: (n, b) => {
      const { zonas, vincularVotos } = get();
      if (!zonas) return;
      const z = { ...zonas, [n]: b };
      if (vincularVotos && (n === 'votos_provincial' || n === 'votos_distrital')) {
        const otra = n === 'votos_provincial' ? 'votos_distrital' : 'votos_provincial';
        z[otra] = { ...z[otra], y: b.y, h: b.h };
      }
      set({ zonas: z });
    },
    confirmarZona: (n, antes) => log('ZONA_AJUSTADA', [{ campo: n, antes, despues: get().zonas?.[n] }]),
    reemplazarLectura: (nueva) => {
      const v = get().acta;
      set({ acta: recalcular(v ? fusionarLecturas(v, nueva) : nueva) });
      log('RELECTURA_CON_ZONAS', [{ campo: 'filas_leidas', antes: null, despues: nueva.organizaciones.length }]);
    },
    setPestana: (pestana) => set({ pestana }),
    setVincularVotos: (vincularVotos) => set({ vincularVotos }),
    setAutoRelectura: (autoRelectura) => set({ autoRelectura }),
    setZonaActiva: (zonaActiva) => set({ zonaActiva }),
    setNOrg: (nOrganizaciones) => set({ nOrganizaciones }),
    quitarVersion: (id) => {
      get().versiones.find((v) => v.id === id)?.paginas.forEach(revocarPagina);
      set((s) => ({ versiones: s.versiones.filter((v) => v.id !== id) }));
    },
    seleccionar: (seleccion) => set({ seleccion }),

    setCampoNumerico: (campo, valor) => {
      const antes = get().acta?.[campo];
      if (antes === valor) return;
      mutarActa((a) => ({ ...a, [campo]: valor, confianza_campos: { ...a.confianza_campos, [campo]: 1 } }));
      log('EDICION_CAMPO', [{ campo, antes, despues: valor }]);
    },

    setCampoTexto: (campo, valor) => {
      const antes = get().acta?.[campo];
      if (antes === valor) return;
      mutarActa((a) => ({ ...a, [campo]: valor }));
      log('EDICION_CAMPO', [{ campo, antes, despues: valor }]);
    },

    setMiembro: (rol, patch) => {
      const previo = get().acta?.miembros_mesa.find((m) => m.rol === rol);
      if (!previo) return;
      const cambios: CambioAuditoria[] = (Object.keys(patch) as (keyof MiembroMesa)[])
        .filter((k) => previo[k] !== patch[k])
        .map((k) => ({ campo: `${rol}.${k}`, antes: previo[k], despues: patch[k] }));
      if (!cambios.length) return;
      mutarActa((a) => ({ ...a, miembros_mesa: a.miembros_mesa.map((m) => (m.rol === rol ? { ...m, ...patch } : m)) }));
      log('EDICION_MIEMBRO', cambios);
    },

    actualizarOrg: (id, patch) => {
      const previo = get().acta?.organizaciones.find((o) => o.id === id);
      if (!previo) return;
      const cambios: CambioAuditoria[] = (Object.keys(patch) as ('codigo' | 'nombre_partido')[])
        .filter((k) => previo[k] !== patch[k])
        .map((k) => ({ campo: `org[${previo.codigo || previo.id.slice(0, 4)}].${k}`, antes: previo[k], despues: patch[k] }));
      if (!cambios.length) return;
      mutarActa((a) => ({ ...a, organizaciones: a.organizaciones.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
      log('EDICION_ORGANIZACION', cambios);
    },

    actualizarCelda: (id, e, patch, motivo) => {
      const org = get().acta?.organizaciones.find((o) => o.id === id);
      if (!org) return;
      const previo = org[e];
      const efectivo: Partial<CeldaVoto> = { ...patch };
      if (!('verificada' in patch) && ('valor' in patch || 'estado' in patch)) efectivo.verificada = true;
      if ('valor' in patch && patch.valor !== previo.valor) efectivo.aprendida = false;
      // La lectura automática original (valor_ocr, estado_ocr, texto_ocr) NUNCA se sobrescribe: es la evidencia.
      // Quién fijó el valor vigente: la persona solo si difiere de lo leído automáticamente.
      const tentativa = { ...previo, ...efectivo };
      efectivo.origen_valor = tentativa.valor !== tentativa.valor_ocr || tentativa.estado !== (tentativa.estado_ocr ?? tentativa.estado) ? 'HUMANO' : 'AUTO';
      const cambios: CambioAuditoria[] = (Object.keys(efectivo) as (keyof CeldaVoto)[])
        .filter((k) => k !== 'aprendida' && previo[k] !== efectivo[k])
        .map((k) => ({ campo: `org[${org.codigo}].${e}.${k}`, antes: previo[k], despues: efectivo[k], ...(motivo ? { motivo } : {}) }));
      if (!cambios.length) return;
      let nueva: CeldaVoto = { ...previo, ...efectivo };
      // Aprendizaje local: una celda verificada por una persona enseña sus dígitos al clasificador
      // (etiquetados con el hash del acta, para poder excluirla al evaluar).
      if (nueva.verificada && !nueva.aprendida && aprenderCelda(nueva, get().archivo?.hash)) nueva = { ...nueva, aprendida: true };
      mutarActa((a) => ({ ...a, organizaciones: a.organizaciones.map((o) => (o.id === id ? { ...o, [e]: nueva } : o)) }));
      log('EDICION_CELDA', cambios);
    },

    // Confirmar una lectura AMBIGUA con candidato la convierte en lectura humana (MANUSCRITO); sin candidato no se puede confirmar.
    confirmarCelda: (id, e, motivo) => {
      const c = get().acta?.organizaciones.find((o) => o.id === id)?.[e];
      if (!c) return;
      if (c.estado === 'AMBIGUA' && c.valor !== null) get().actualizarCelda(id, e, { estado: 'MANUSCRITO', verificada: true }, motivo ?? 'candidato de la lectura ambigua confirmado por una persona');
      else if (c.estado === 'AMBIGUA' || c.estado === 'ERROR') return;
      else get().actualizarCelda(id, e, { verificada: true }, motivo);
    },

    // Una persona revisó la rejilla sobre la imagen y la da por buena (levanta el error de «alineación no verificada»).
    confirmarAlineacion: () => {
      const a = get().acta;
      if (!a?.lectura_meta || a.lectura_meta.alineacion_confirmada) return;
      mutarActa((x) => ({ ...x, lectura_meta: { ...x.lectura_meta!, alineacion_confirmada: true } }));
      log('ALINEACION_CONFIRMADA', [{ campo: 'lectura_meta.alineacion_confirmada', antes: false, despues: true, motivo: `rejilla revisada visualmente; problemas: ${a.lectura_meta.geometria.problemas.join(' | ') || 'ninguno'}` }]);
    },

    // Alterna entre la imagen enderezada y la original (solo antes de leer: cambian las coordenadas).
    usarImagenOriginal: (usar) => {
      const s = get();
      const p = s.paginas[s.paginaActual];
      if (!p?.original || !p.enderezada || s.acta) return;
      const img = usar ? p.original : p.enderezada;
      const paginas = s.paginas.map((x, i) => (i === s.paginaActual ? { ...x, ...img, usando_original: usar } : x));
      set({ paginas, zonas: null });
      log('IMAGEN_DE_TRABAJO', [{ campo: 'imagen', antes: usar ? 'enderezada' : 'original', despues: usar ? 'original' : 'enderezada' }]);
    },

    agregarOrg: () => {
      const nueva: VotoOrganizacion = {
        id: crypto.randomUUID(), codigo: '', nombre_partido: '',
        provincial: { ...celdaNueva(), confianza: 1, verificada: true },
        distrital: { ...celdaNueva(), confianza: 1, verificada: true },
      };
      mutarActa((a) => ({ ...a, organizaciones: [...a.organizaciones, nueva] }));
      log('FILA_AGREGADA', [{ campo: 'organizaciones', antes: null, despues: nueva.id }]);
    },

    eliminarOrg: (id) => {
      const o = get().acta?.organizaciones.find((x) => x.id === id);
      if (!o) return;
      mutarActa((a) => ({ ...a, organizaciones: a.organizaciones.filter((x) => x.id !== id) }));
      set((s) => (s.seleccion?.id === id ? { seleccion: null } : {}));
      log('FILA_ELIMINADA', [{ campo: `org[${o.codigo}]`, antes: `${o.nombre_partido}: prov ${o.provincial.valor} / dist ${o.distrital.valor}`, despues: null }]);
    },
  };
});
