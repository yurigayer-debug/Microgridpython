"""Gerador a diesel (pós-processamento) e indicadores de custo presente líquido.

O ``Pvsamv1`` não modela gerador em sistemas atrás do medidor. Assim como no
``microgrid_optimizer.m``, o gerador é despachado *depois* da simulação PySAM,
cobrindo hora a hora a carga crítica não atendida (``crit_load_unmet``) durante
as quedas de rede (ou o ano inteiro, no modo off-grid). Ele não carrega a bateria.

Consumo de combustível (curva linear do Octave):
    L/h = A · E_gerada + B · P_nominal      (A em L/kWh, B em L/(kW·h))

Indicadores (em termos reais, R$ de hoje):
* NPC – custo presente líquido = CAPEX + Σ custos_t / (1+i)^t / (1+r)^t
* LCOE de atendimento = NPC / Σ energia_atendida_t / (1+r)^t
  (mesma ideia do LCOE do script Octave: inclui compras da rede e combustível).
"""
from __future__ import annotations

import math

import numpy as np

HOURS = 8760


def dispatch(unmet: np.ndarray, g) -> dict:
    """Despacha o gerador sobre a energia não atendida (anos × 8760, kWh)."""
    N = unmet.shape[0]
    if not g.habilitado or g.potencia_kw <= 0:
        z = np.zeros_like(unmet)
        return {"energia": z, "residual": unmet, "horas": np.zeros(N), "litros": np.zeros(N),
                "energia_ano": np.zeros(N), "substituicoes": np.zeros(N)}
    P = g.potencia_kw
    need = np.clip(unmet, 0, None)
    run = need > 1e-3
    energia = np.minimum(need, P)
    saida = np.where(run, np.maximum(energia, P * g.carga_minima / 100.0), 0.0)
    litros_h = np.where(run, g.consumo_a * saida + g.consumo_b * P, 0.0)
    horas = run.sum(axis=1).astype(float)
    acum = np.cumsum(horas)
    subst = np.diff(np.floor(acum / g.vida_horas), prepend=0.0)
    return {"energia": energia, "residual": need - energia, "horas": horas, "litros": litros_h.sum(axis=1),
            "energia_ano": energia.sum(axis=1), "substituicoes": subst}


def genset_costs_nominal(gs: dict, g, inflacao: float) -> np.ndarray:
    """Custos anuais nominais do gerador (combustível + O&M + reposições), anos 1..N."""
    N = len(gs["horas"])
    if not g.habilitado:
        return np.zeros(N)
    y = np.arange(N)
    infl = (1 + inflacao / 100.0) ** y
    diesel = g.preco_diesel * infl * (1 + g.reajuste_diesel_real / 100.0) ** y
    return gs["litros"] * diesel + g.om_hora * gs["horas"] * infl + gs["substituicoes"] * g.potencia_kw * g.custo_kw * infl


def diesel_only_reference(load_y: np.ndarray, g, inflacao: float) -> dict:
    """Cenário de referência off-grid: só gerador atendendo toda a carga."""
    P = max(g.potencia_kw if g.habilitado else 0.0, math.ceil(float(load_y.max()) * 1.25))
    N = load_y.shape[0]
    saida = np.maximum(load_y, P * g.carga_minima / 100.0)
    run = load_y > 1e-3
    litros = (np.where(run, g.consumo_a * saida + g.consumo_b * P, 0.0)).sum(axis=1)
    horas = run.sum(axis=1).astype(float)
    subst = np.diff(np.floor(np.cumsum(horas) / g.vida_horas), prepend=0.0)
    y = np.arange(N)
    infl = (1 + inflacao / 100.0) ** y
    diesel = g.preco_diesel * infl * (1 + g.reajuste_diesel_real / 100.0) ** y
    custos = litros * diesel + g.om_hora * horas * infl + subst * P * g.custo_kw * infl
    return {"potencia_kw": P, "capex": P * g.custo_kw, "custos_nominais": custos, "litros_ano1": float(litros[0])}


def npc(capex: float, custos_nominais: np.ndarray, taxa_real: float, inflacao: float) -> float:
    t = np.arange(1, len(custos_nominais) + 1)
    fator = (1 + inflacao / 100.0) ** t * (1 + taxa_real / 100.0) ** t
    return float(capex + (np.asarray(custos_nominais, float) / fator).sum())


def levelized(npc_value: float, energia_ano: np.ndarray, taxa_real: float) -> float | None:
    t = np.arange(1, len(energia_ano) + 1)
    e = float((np.asarray(energia_ano, float) / (1 + taxa_real / 100.0) ** t).sum())
    return npc_value / e if e > 0 else None


def irr(flows: list[float]) -> float | None:
    """TIR por bisseção (fluxos anuais, ano 0 primeiro). Retorna % ou None."""
    f = np.asarray(flows, float)

    def npv(rate):
        return float((f / (1 + rate) ** np.arange(len(f))).sum())

    lo, hi = -0.99, 10.0
    if npv(lo) * npv(hi) > 0:
        return None
    for _ in range(200):
        mid = (lo + hi) / 2
        if npv(lo) * npv(mid) <= 0:
            hi = mid
        else:
            lo = mid
    return 100 * (lo + hi) / 2


def payback(flows: list[float], rate: float = 0.0) -> float | None:
    cum = 0.0
    for t, v in enumerate(flows):
        dv = v / (1 + rate) ** t
        if cum < 0 <= cum + dv and t > 0:
            return t - 1 + (-cum / dv if dv else 0)
        cum += dv
    return None
