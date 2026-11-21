"""Exportação de resultados: CSV horário, CSV de fluxo de caixa e dossiê em texto."""
from __future__ import annotations

import csv
import datetime as dt
import io

import pandas as pd

from .schemas import GROUPS, SimulationInput

HOURLY_LABELS = {
    "carga": "Carga_kW",
    "fv_ca": "FV_CA_kW",
    "fv_para_carga": "FV_para_carga_kW",
    "fv_para_bateria": "FV_para_bateria_kW",
    "fv_para_rede": "FV_para_rede_kW",
    "bateria_para_carga": "Bateria_para_carga_kW",
    "bateria_para_rede": "Bateria_para_rede_kW",
    "rede_para_carga": "Rede_para_carga_kW",
    "rede_para_bateria": "Rede_para_bateria_kW",
    "soc": "SOC_%",
    "potencia_bateria": "Potencia_bateria_kW(+desc/-carga)",
    "clipping": "Clipping_inversor_kW",
    "poa": "Irradiancia_POA_W_m2",
    "temp_celula": "Temp_celula_C",
    "queda_rede": "Queda_rede(0/1)",
    "gerador": "Gerador_para_carga_kW",
    "nao_atendida": "Carga_nao_atendida_kW",
}


def hourly_csv(result: dict) -> str:
    h = result["horario"]
    idx = pd.date_range("2019-01-01", periods=8760, freq="h")
    df = pd.DataFrame({"Hora": range(1, 8761), "Mes": idx.month, "Dia": idx.day, "Hora_do_dia": idx.hour})
    for k, label in HOURLY_LABELS.items():
        if k in h:
            df[label] = h[k]
    return df.to_csv(index=False)


def cashflow_csv(result: dict) -> str:
    f = result["fluxo"]
    cols = [("ano", "Ano"), ("energia_entregue_kwh", "Energia_entregue_kWh"), ("fatura_sem", "Fatura_sem_sistema_R$"),
            ("fatura_com", "Fatura_com_sistema_R$"), ("economia", "Economia_R$"), ("percentual_fio_b", "Fio_B_%"),
            ("fio_b", "Fio_B_pago_R$"), ("om", "O&M_R$"), ("custo_gerador", "Gerador_R$"), ("reposicao_bateria", "Reposicao_bateria_R$"),
            ("fluxo_caixa", "Fluxo_caixa_R$"), ("acumulado", "Acumulado_R$"),
            ("acumulado_descontado", "Acumulado_descontado_R$"), ("capacidade_bateria_pct", "Capacidade_bateria_%")]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([c[1] for c in cols])
    n = len(f["ano"])
    for i in range(n):
        w.writerow([(f.get(k) or [None] * n)[i] if i < len(f.get(k) or []) else "" for k, _ in cols])
    return buf.getvalue()


def _fmt(v, nd=2):
    if v is None:
        return "-"
    if isinstance(v, float):
        s = f"{v:,.{nd}f}"
        return s.replace(",", "X").replace(".", ",").replace("X", ".")
    return str(v)


def dossie(inp: SimulationInput, result: dict) -> str:
    k = result["kpis"]
    L = []
    line = "=" * 72
    L += [line, "  DOSSIÊ DO PROJETO – INVERSOR HÍBRIDO + BATERIA + FV (PySAM)", line,
          f"  Gerado em {dt.datetime.now():%d/%m/%Y %H:%M}", ""]
    L.append("--- PREMISSAS DE ENTRADA ---")
    clima = result.get("clima", {})
    L.append(f"  Clima: {clima.get('fonte')} | GHI anual {_fmt(clima.get('ghi_anual_kwh_m2'), 0)} kWh/m²")
    data = inp.model_dump()
    for key, title, model in GROUPS:
        L.append(f"\n  [{title}]")
        for name, f in model.model_fields.items():
            unit = (f.json_schema_extra or {}).get("unit", "")
            L.append(f"   - {f.title}: {data[key][name]} {unit}".rstrip())
    L += ["", "--- VALIDAÇÃO DO DIMENSIONAMENTO ---"]
    for m in result["validacao"]:
        L.append(f"  [{m['nivel'].upper()}] {m['texto']}")
    L += ["", "--- RESULTADOS TÉCNICOS (ANO 1) ---",
          f"  Potência FV: {_fmt(k['potencia_fv_kwp'])} kWp | Inversor: {_fmt(k['potencia_inversor_kw'])} kW | "
          f"CC/CA: {_fmt(k['relacao_cc_ca'])}",
          f"  Bateria instalada: {_fmt(k['bateria_kwh'])} kWh",
          f"  Geração FV (CA): {_fmt(k['geracao_fv_ano1_kwh'], 0)} kWh | Produtividade: "
          f"{_fmt(k['produtividade_kwh_kwp'], 0)} kWh/kWp | PR: {_fmt(k['performance_ratio'], 3)}",
          f"  Consumo: {_fmt(k['consumo_anual_kwh'], 0)} kWh | Importado: {_fmt(k['importado_rede_kwh'], 0)} kWh | "
          f"Exportado: {_fmt(k['exportado_rede_kwh'], 0)} kWh",
          f"  Autoconsumo: {_fmt(k['autoconsumo_pct'], 1)} % | Autossuficiência: {_fmt(k['autossuficiencia_pct'], 1)} %",
          f"  Clipping do inversor: {_fmt(k['perda_clipping_pct'])} % | Perda de eficiência do inversor: "
          f"{_fmt(k['perda_eficiencia_inversor_pct'])} %",
          f"  Bateria: {_fmt(k['bateria_ciclos_equivalentes_ano1'], 0)} ciclos equivalentes/ano | Eficiência de ciclo "
          f"{_fmt(k['bateria_eficiencia_ciclo_pct'], 1)} % | Substituições na vida útil: {k['bateria_substituicoes']}",
          "", "--- RESULTADOS ECONÔMICOS ---",
          f"  CAPEX: R$ {_fmt(k['capex_rs'], 0)}",
          f"  Fatura ano 1 sem sistema: R$ {_fmt(k['fatura_sem_sistema_ano1_rs'], 0)} | com sistema: R$ "
          f"{_fmt(k['fatura_com_sistema_ano1_rs'], 0)} | economia: R$ {_fmt(k['economia_ano1_rs'], 0)}",
          f"  Fio B pago no ano 1: R$ {_fmt(k['fio_b_ano1_rs'], 0)}",
          f"  VPL: R$ {_fmt(k['vpl_rs'], 0)} | TIR: {_fmt(k['tir_pct'])} % | Payback: {_fmt(k['payback_anos'], 1)} anos"
          f" | Payback descontado: {_fmt(k['payback_descontado_anos'], 1)} anos",
          f"  LCOE real: R$ {_fmt(k['lcoe_real_rs_kwh'], 4)}/kWh | LCOE nominal: R$ "
          f"{_fmt(k['lcoe_nominal_rs_kwh'], 4)}/kWh | LCOS real: R$ {_fmt(k['lcos_real_rs_kwh'], 4)}/kWh"]
    L += ["", "--- CUSTO PRESENTE LÍQUIDO (TERMOS REAIS) ---",
          f"  Modo: {'OFF-GRID' if k.get('modo') == 'off_grid' else 'ON-GRID'} | Referência: {k.get('referencia')}",
          f"  NPC do sistema: R$ {_fmt(k.get('npc_rs'), 0)} | NPC da referência: R$ {_fmt(k.get('ref_npc_rs'), 0)}",
          f"  Custo nivelado de atendimento: R$ {_fmt(k.get('lcoe_atendimento_rs_kwh'), 4)}/kWh | referência: R$ "
          f"{_fmt(k.get('ref_lcoe_rs_kwh'), 4)}/kWh",
          f"  Carga atendida: {_fmt(k.get('atendimento_pct'))} % | Não atendida: {_fmt(k.get('nao_atendida_ano1_kwh'), 1)} "
          f"kWh | Fração renovável: {_fmt(k.get('fracao_renovavel_pct'), 1)} % | Autonomia: {_fmt(k.get('autonomia_h'), 1)} h"]
    if (k.get("gerador_energia_ano1_kwh") or 0) > 0 or k.get("modo") == "off_grid":
        L += [f"  Gerador: {_fmt(k.get('gerador_energia_ano1_kwh'), 0)} kWh/ano | {_fmt(k.get('gerador_horas_ano1'), 0)} h | "
              f"{_fmt(k.get('gerador_litros_ano1'), 0)} L | R$ {_fmt(k.get('gerador_custo_ano1_rs'), 0)}/ano | "
              f"substituições: {k.get('gerador_substituicoes')}",
              f"  FV não aproveitada (off-grid): {_fmt(k.get('fv_nao_aproveitada_ano1_kwh'), 0)} kWh"]
    if result.get("backup"):
        b = result["backup"]
        L += ["", "--- BACKUP (QUEDAS DE REDE) ---",
              f"  Horas de queda: {b['horas_queda']} | Carga crítica: {_fmt(b['carga_critica_kwh'])} kWh | "
              f"Não atendida: {_fmt(b['nao_atendida_kwh'])} kWh | Atendida: {_fmt(b['atendida_pct'], 1)} %"]
    if result["tarifa_mensal_ano1"]:
        L += ["", "--- FATURAMENTO MENSAL (ANO 1) ---",
              f"  {'Mês':<5}{'Rede kWh':>10}{'Injet. kWh':>12}{'Comp. kWh':>11}{'Créd. kWh':>11}{'Fio B R$':>10}"
              f"{'Com sist. R$':>14}{'Sem sist. R$':>14}"]
    for r in result["tarifa_mensal_ano1"]:
        L.append(f"  {r['mes']:<5}{r['consumo_rede_kwh']:>10.0f}{r['injetado_kwh']:>12.0f}{r['compensado_kwh']:>11.0f}"
                 f"{r['credito_acumulado_kwh']:>11.0f}{r['fio_b_rs']:>10.2f}{r['fatura_com_sistema_rs']:>14.2f}"
                 f"{r['fatura_sem_sistema_rs']:>14.2f}")
    L += ["", "Motor: NREL PySAM (Pvsamv1 → Grid → Utilityrate5 → Cashloan) + tarifa brasileira (Lei 14.300).",
          line]
    return "\n".join(L)
