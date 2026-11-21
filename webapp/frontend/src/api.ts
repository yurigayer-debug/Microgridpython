// Cliente da API FastAPI e tipos compartilhados.

export type FieldType = "float" | "int" | "bool" | "select" | "text";

export interface FieldSpec {
  name: string;
  title: string;
  type: FieldType;
  default: unknown;
  unit: string;
  help: string;
  sam: string;
  options?: { value: string; label: string }[];
  ge?: number;
  gt?: number;
  le?: number;
  lt?: number;
}

export interface GroupSpec {
  key: string;
  title: string;
  fields: FieldSpec[];
}

export type Values = Record<string, Record<string, unknown>>;

export interface Esquema {
  grupos: GroupSpec[];
  padrao: Values;
  perfis_carga: string[];
  ghi_pelotas: number[];
  temp_pelotas: number[];
  repositorio_csv: boolean;
}

export interface ClimaResp {
  id: string;
  resumo: {
    fonte: string; lat: number; lon: number; tz: number; elev: number; ghi_anual_kwh_m2: number;
    ghi_mensal_kwh_m2_dia: number[]; temp_media_mensal_c: number[]; temp_min_c: number; temp_max_c: number;
  };
}

export interface CargaResp {
  id: string;
  resumo: {
    fonte: string; consumo_anual_kwh: number; consumo_mensal_kwh: number[]; demanda_max_kw: number;
    demanda_media_kw: number; fator_carga: number; perfil_medio_diario_kw: number[];
  };
}

export interface Msg { nivel: "ok" | "alerta" | "erro"; texto: string }

export type Kpis = Record<string, number | string | null>;

export interface Resultado {
  ok: boolean;
  id: string;
  erro?: string;
  tempo_s: number;
  validacao: Msg[];
  kpis: Kpis;
  capex: Record<string, number>;
  perdas: Record<string, number | null>;
  backup: null | {
    gerador_kwh: number; horas_queda: number; carga_critica_kwh: number; nao_atendida_kwh: number;
    atendida_pct: number;
    eventos: { inicio_hora: number; duracao_h: number; carga_critica_kwh: number; nao_atendida_kwh: number;
      atendida_pct: number; soc_inicio_pct: number }[];
  };
  tarifa_mensal_ano1: {
    mes: string; consumo_rede_kwh: number; injetado_kwh: number; compensado_kwh: number;
    credito_acumulado_kwh: number; fio_b_rs: number; fatura_com_sistema_rs: number;
    fatura_sem_sistema_rs: number; minimo_aplicado: boolean;
  }[];
  fluxo: Record<string, (number | null)[]>;
  mensal: Record<string, number[]>;
  horario: Record<string, number[]>;
  clima: ClimaResp["resumo"];
}

export interface CasoOtimizacao {
  alvo: { pv_kwp: number; bateria_kwh: number; gerador_kw: number };
  ok: boolean;
  erro?: string;
  viavel?: boolean;
  tempo_s?: number;
  config?: Record<string, number | boolean>;
  kpis: Kpis;
}

export interface Otimizacao {
  id: string;
  status: "na_fila" | "executando" | "concluido" | "cancelado" | "erro";
  erro: string;
  total: number;
  concluidos: number;
  decorrido_s: number;
  criterio: "vpl" | "lcoe_atendimento" | "npc";
  modo: "on_grid" | "off_grid";
  confiabilidade_min: number;
  melhor: CasoOtimizacao | null;
  resultados: CasoOtimizacao[];
}

export type LinhaOctave = Record<string, number | null>;

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const r = await fetch(path, opts);
  let body: unknown = null;
  try { body = await r.json(); } catch { /* corpo vazio */ }
  if (!r.ok) {
    const d = (body as { detail?: unknown } | null)?.detail;
    throw new Error(typeof d === "string" ? d : d ? JSON.stringify(d) : r.statusText);
  }
  return body as T;
}

export const get = <T>(path: string) => request<T>(path);
export const post = <T>(path: string, data: unknown) =>
  request<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
export const postForm = <T>(path: string, fd: FormData) => request<T>(path, { method: "POST", body: fd });

// ------------------------------------------------------------------ formatação pt-BR
export const nf = (v: unknown, d = 0): string => {
  if (v === null || v === undefined || typeof v !== "number" || Number.isNaN(v)) return "–";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
};
export const brl = (v: unknown, d = 0) => (typeof v === "number" ? "R$ " + nf(v, d) : "–");
export const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function parseList(text: string): number[] {
  return text.split(/[;\s]+/).map((s) => s.trim()).filter(Boolean).map((s) => Number(s.replace(",", ".")));
}
