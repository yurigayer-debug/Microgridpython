"""Faturamento de energia no Brasil (Grupo B) com micro/minigeração distribuída.

Substitui o ``Utilityrate5`` do SAM (que modela tarifas dos EUA) na cadeia PySAM:
as contas anuais com e sem sistema calculadas aqui alimentam o ``Cashloan``.

Regras implementadas (simplificações documentadas)
--------------------------------------------------
* Faturamento mensal; energia importada e injetada vêm da simulação hora a hora,
  portanto o consumo simultâneo (autoconsumo instantâneo) já está descontado.
* **GD II – Lei 14.300/2022**: a energia injetada compensa o consumo kWh a kWh,
  mas sobre a energia compensada paga-se um percentual da TUSD Fio B:
  15% (2023), 30% (2024), 45% (2025), 60% (2026), 75% (2027), 90% (2028) e, a
  partir de 2029, o percentual configurado (padrão 100%). A fatura é o
  **maior valor** entre o custo de disponibilidade e (consumo não compensado +
  Fio B sobre o compensado) — REN ANEEL 1.059/2023.
* **GD I** (direito adquirido): compensação integral até 2045; o consumo faturado
  nunca é menor que o custo de disponibilidade (créditos não abatem abaixo dele).
  A partir de 2046 passa às regras de GD II com 100% do Fio B.
* **Tarifa Branca**: créditos compensam primeiro no mesmo posto; o excedente de um
  posto compensa outros postos convertido pela razão entre as tarifas.
* Créditos excedentes acumulam em kWh equivalentes (fora de ponta) sem prazo de
  validade (a validade legal de 60 meses é ignorada).
* Sem compensação: importação paga pela tarifa cheia e excedente vendido pela
  tarifa de venda informada.
* Tarifas informadas já com impostos (ICMS/PIS/COFINS) e reajustadas por
  ``reajuste_anual`` a cada ano. Bandeiras tarifárias não são modeladas (inclua
  um adicional médio na tarifa, se desejar).
"""
from __future__ import annotations

import calendar
import datetime as dt

import numpy as np

HOURS = 8760
DISPONIBILIDADE_KWH = {"mono": 30.0, "bi": 50.0, "tri": 100.0}
FIO_B_TRANSICAO = {2023: 0.15, 2024: 0.30, 2025: 0.45, 2026: 0.60, 2027: 0.75, 2028: 0.90}

MONTH_OF_HOUR = np.repeat(np.arange(12), [d * 24 for d in (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)])


def fio_b_percent(year: int, regime: str, pos_2029: float) -> float:
    if regime == "gd1":
        return 0.0 if year <= 2045 else 1.0
    if year < 2023:
        return 0.0
    return FIO_B_TRANSICAO.get(year, pos_2029 / 100.0)


def posto_horario(ano: int, inicio_ponta: int) -> np.ndarray:
    """0 = fora de ponta, 1 = intermediário, 2 = ponta (dias úteis; fins de semana fora de ponta).

    Feriados nacionais não são considerados.
    """
    start = dt.date(ano, 1, 1)
    days = [start + dt.timedelta(days=i) for i in range(365)]
    posto = np.zeros(HOURS, dtype=int)
    for d_i, day in enumerate(days):
        if day.weekday() >= 5:
            continue
        base = d_i * 24
        for h in range(24):
            rel = (h - inicio_ponta) % 24
            if rel < 3:
                posto[base + h] = 2
            elif rel == 3 or rel == 23:
                posto[base + h] = 1
    return posto


def _rates(t) -> tuple[np.ndarray, np.ndarray]:
    if t.modalidade == "branca":
        return (np.array([t.tarifa_fora_ponta, t.tarifa_intermediaria, t.tarifa_ponta], float),
                np.array([t.fio_b_fora_ponta, t.fio_b_intermediario, t.fio_b_ponta], float))
    return np.array([t.tarifa_kwh] * 3, float), np.array([t.fio_b_kwh] * 3, float)


def bill_month(cons: np.ndarray, inj: np.ndarray, rates: np.ndarray, fiob: np.ndarray, credit_bank: float,
               pct_fiob: float, regime: str, disp_kwh: float, venda: float) -> tuple[dict, float]:
    """Calcula a fatura de um mês. ``cons``/``inj``: kWh por posto (3). ``credit_bank`` em kWh fora de ponta."""
    ref = rates[0] if rates[0] > 0 else 1.0
    min_charge = disp_kwh * rates[0]
    if regime == "sem_compensacao":
        energia = float((cons * rates).sum())
        fatura = max(energia, min_charge) - float(inj.sum()) * venda
        return {"fatura": fatura, "compensado_kwh": 0.0, "fio_b": 0.0, "credito_final_kwh": credit_bank,
                "minimo_aplicado": energia < min_charge}, credit_bank

    cons = cons.astype(float).copy()
    inj = inj.astype(float).copy()
    compensado = np.zeros(3)
    # GD I: não compensa abaixo do custo de disponibilidade
    compensavel_total = max(0.0, cons.sum() - disp_kwh) if regime == "gd1" and pct_fiob == 0 else cons.sum()

    def use(p, kwh):
        nonlocal compensavel_total
        kwh = min(kwh, cons[p], compensavel_total)
        cons[p] -= kwh
        compensado[p] += kwh
        compensavel_total -= kwh
        return kwh

    # 1) mesmo posto
    for p in (2, 1, 0):
        inj[p] -= use(p, inj[p])
    # 2) excedente de outros postos (convertido por razão tarifária), priorizando a ponta
    for p in (2, 1, 0):
        for q in (0, 1, 2):
            if q == p or inj[q] <= 0 or cons[p] <= 0:
                continue
            fator = rates[q] / rates[p] if rates[p] > 0 else 1.0
            usado = use(p, inj[q] * fator)
            inj[q] -= usado / fator
    # 3) sobra vai para o banco (equivalente fora de ponta)
    credit_bank += float((inj * rates).sum() / ref)
    # 4) banco de créditos abate consumo restante
    for p in (2, 1, 0):
        if credit_bank <= 0:
            break
        fator = ref / rates[p] if rates[p] > 0 else 1.0
        usado = use(p, credit_bank * fator)
        credit_bank -= usado / fator

    energia = float((cons * rates).sum())
    fio_b = float((compensado * fiob).sum()) * pct_fiob
    if regime == "gd1" and pct_fiob == 0:
        fatura = max(energia, min_charge)
    else:
        fatura = max(energia + fio_b, min_charge)
    return {"fatura": fatura, "compensado_kwh": float(compensado.sum()), "fio_b": fio_b,
            "credito_final_kwh": credit_bank, "minimo_aplicado": fatura == min_charge}, credit_bank


def annual_bills(importacao: np.ndarray, exportacao: np.ndarray, carga: np.ndarray, t) -> dict:
    """Faturas anuais com e sem sistema.

    importacao, exportacao: (anos, 8760) kWh da rede / para a rede com o sistema.
    carga: (anos, 8760) kWh que seria importado sem o sistema.
    """
    n_years = importacao.shape[0]
    rates0, fiob0 = _rates(t)
    disp = DISPONIBILIDADE_KWH[t.tipo_ligacao]
    branca = t.modalidade == "branca"
    com, sem, fio_b_total, compensado_total, credito_fim = [], [], [], [], []
    mensal_ano1 = []
    bank = 0.0
    for y in range(n_years):
        ano = t.ano_inicio + y
        esc = (1 + t.reajuste_anual / 100.0) ** y
        rates, fiob = rates0 * esc, fiob0 * esc
        venda = t.tarifa_venda * esc
        pct = fio_b_percent(ano, t.regime, t.fio_b_pos_2029)
        posto = posto_horario(ano, t.inicio_ponta) if branca else np.zeros(HOURS, dtype=int)
        key = MONTH_OF_HOUR * 3 + posto
        imp_m = np.bincount(key, weights=importacao[y], minlength=36).reshape(12, 3)
        exp_m = np.bincount(key, weights=exportacao[y], minlength=36).reshape(12, 3)
        load_m = np.bincount(key, weights=carga[y], minlength=36).reshape(12, 3)
        total_com = total_sem = fb = comp = 0.0
        for m in range(12):
            r, bank = bill_month(imp_m[m], exp_m[m], rates, fiob, bank, pct, t.regime, disp, venda)
            s, _ = bill_month(load_m[m], np.zeros(3), rates, fiob, 0.0, pct, t.regime, disp, venda)
            total_com += r["fatura"]
            total_sem += s["fatura"]
            fb += r["fio_b"]
            comp += r["compensado_kwh"]
            if y == 0:
                mensal_ano1.append({
                    "mes": calendar.month_abbr[m + 1],
                    "consumo_rede_kwh": round(float(imp_m[m].sum()), 1),
                    "injetado_kwh": round(float(exp_m[m].sum()), 1),
                    "compensado_kwh": round(r["compensado_kwh"], 1),
                    "credito_acumulado_kwh": round(r["credito_final_kwh"], 1),
                    "fio_b_rs": round(r["fio_b"], 2),
                    "fatura_com_sistema_rs": round(r["fatura"], 2),
                    "fatura_sem_sistema_rs": round(s["fatura"], 2),
                    "minimo_aplicado": bool(r["minimo_aplicado"]),
                })
        com.append(total_com)
        sem.append(total_sem)
        fio_b_total.append(fb)
        compensado_total.append(comp)
        credito_fim.append(bank)
    return {
        "fatura_com_sistema": com,
        "fatura_sem_sistema": sem,
        "economia": [s - c for s, c in zip(sem, com)],
        "fio_b_pago": fio_b_total,
        "energia_compensada_kwh": compensado_total,
        "credito_final_kwh": credito_fim,
        "mensal_ano1": mensal_ano1,
        "percentual_fio_b": [fio_b_percent(t.ano_inicio + y, t.regime, t.fio_b_pos_2029) for y in range(n_years)],
    }
