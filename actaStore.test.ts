import { beforeEach, describe, expect, it, vi } from 'vitest';

const registro: { accion: string; cambios: { campo: string; origen?: string; motivo?: string; antes: unknown; despues: unknown }[] }[] = [];
vi.mock('../hooks/useAuditoria', () => ({
  registrarAuditoria: vi.fn(async (e: (typeof registro)[number]) => { registro.push(e); return 1; }),
  listarAuditoria: vi.fn(async () => []),
}));
vi.mock('../utils/aprendizaje', () => ({ aprenderCelda: vi.fn(() => false), cargarMuestras: vi.fn(async () => 0) }));

import { useActaStore } from './actaStore';
import { validarActa } from '../utils/validaciones';
import type { ActaElectoral, CeldaVoto } from '../types/acta';

const celda = (p: Partial<CeldaVoto>): CeldaVoto => ({ estado: 'VACIA', valor: null, valor_ocr: null, confianza: 0.95, tinta: 0, oscuro: 0, verificada: false, origen_valor: 'AUTO', ...p });
const base = (prov: CeldaVoto): ActaElectoral => ({
  mesa: '1', departamento: '', provincia: '', distrito: '', electores_habiles: 300, ciudadanos_votaron: 57,
  blanco_provincial: 0, nulos_provincial: 0, impugnados_provincial: 0, emitidos_escrito_provincial: 0,
  blanco_distrital: 0, nulos_distrital: 0, impugnados_distrital: 0, emitidos_escrito_distrital: 0,
  miembros_mesa: [], organizaciones: [{ id: 'o1', codigo: '01', nombre_partido: 'X', provincial: prov, distrital: celda({ estado_ocr: 'VACIA' }) }],
  hash_sha256: 'h', estado_acta: 'ENVIADA_A_JURADO', observaciones: [], observaciones_escritas: false, nombre_archivo: 'a.png', confianza_campos: {},
});
const cargar = (a: ActaElectoral) => useActaStore.setState({ acta: a, archivo: { nombre: 'a.png', hash: 'h' }, usuario: 'tester' });
const prov = () => useActaStore.getState().acta!.organizaciones[0].provincial;

beforeEach(() => { registro.length = 0; });

describe('actualizarCelda', () => {
  it('conserva la lectura automática original y marca el valor como humano', () => {
    cargar(base(celda({ estado: 'MANUSCRITO', estado_ocr: 'MANUSCRITO', valor: 12, valor_ocr: 12 })));
    useActaStore.getState().actualizarCelda('o1', 'provincial', { estado: 'MANUSCRITO', valor: 17 }, 'el 2 es un 7');
    expect(prov()).toMatchObject({ valor: 17, valor_ocr: 12, estado_ocr: 'MANUSCRITO', origen_valor: 'HUMANO', verificada: true });
  });

  it('registra origen HUMANO y el motivo en la auditoría, con el antes y el después', () => {
    cargar(base(celda({ estado: 'MANUSCRITO', estado_ocr: 'MANUSCRITO', valor: 12, valor_ocr: 12 })));
    useActaStore.getState().actualizarCelda('o1', 'provincial', { estado: 'MANUSCRITO', valor: 17 }, 'el 2 es un 7');
    const c = registro.find((r) => r.accion === 'EDICION_CELDA')!.cambios.find((x) => x.campo.endsWith('.valor'))!;
    expect(c).toMatchObject({ antes: 12, despues: 17, origen: 'HUMANO', motivo: 'el 2 es un 7' });
  });

  it('confirmar la misma lectura no la convierte en «humana»', () => {
    cargar(base(celda({ estado: 'MANUSCRITO', estado_ocr: 'MANUSCRITO', valor: 12, valor_ocr: 12 })));
    useActaStore.getState().confirmarCelda('o1', 'provincial');
    expect(prov()).toMatchObject({ verificada: true, origen_valor: 'AUTO' });
  });
});

describe('celdas ambiguas', () => {
  const ambigua = () => celda({ estado: 'AMBIGUA', estado_ocr: 'AMBIGUA', valor: 57, valor_ocr: 57, confianza: 0.5, motivos: ['candidatos cercanos'] });

  it('mientras está ambigua no suma y la validación lo señala', () => {
    cargar(base(ambigua()));
    const v = validarActa(useActaStore.getState().acta!);
    expect(v.celdas_ambiguas).toBe(1);
    expect(v.por_eleccion.provincial.validos).toBe(0);
  });

  it('confirmar el candidato es una decisión humana y pasa a MANUSCRITO', () => {
    cargar(base(ambigua()));
    useActaStore.getState().confirmarCelda('o1', 'provincial');
    expect(prov()).toMatchObject({ estado: 'MANUSCRITO', valor: 57, origen_valor: 'HUMANO', estado_ocr: 'AMBIGUA' });
    expect(validarActa(useActaStore.getState().acta!).celdas_ambiguas).toBe(0);
  });

  it('sin candidato no se puede «confirmar» (no se inventa un valor)', () => {
    cargar(base(celda({ estado: 'AMBIGUA', estado_ocr: 'AMBIGUA', valor: null, confianza: 0.5 })));
    useActaStore.getState().confirmarCelda('o1', 'provincial');
    expect(prov()).toMatchObject({ estado: 'AMBIGUA', valor: null, verificada: false });
  });
});

describe('confirmarAlineacion', () => {
  it('levanta el error de alineación y queda auditado como acción humana', () => {
    const a = base(celda({}));
    a.lectura_meta = {
      version_algoritmo: 't', tinta_dominante: 'AZUL', alineacion_confirmada: false,
      geometria: { provincial: {} as never, distrital: {} as never, columnas: { desfase_izq_px: null, desfase_der_px: null, separacion_px: 0 }, recortes_invalidos: [], problemas: ['x'], confiable: false },
    };
    cargar(a);
    expect(validarActa(useActaStore.getState().acta!).alineacion_ok).toBe(false);
    useActaStore.getState().confirmarAlineacion();
    expect(validarActa(useActaStore.getState().acta!).alineacion_ok).toBe(true);
    expect(registro.find((r) => r.accion === 'ALINEACION_CONFIRMADA')!.cambios[0].origen).toBe('HUMANO');
  });
});
