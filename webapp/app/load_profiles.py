"""Perfis de carga horária (8760 h) em kW."""
from __future__ import annotations

import io

import numpy as np
import pandas as pd

HOURS = 8760

# Perfis diários típicos normalizados (base EPE) — os mesmos do microgrid_optimizer.m
PERFIS_EPE = {
    "residencial": [0.35, 0.30, 0.28, 0.25, 0.28, 0.45, 0.65, 0.70, 0.60, 0.55, 0.50, 0.55,
                    0.58, 0.55, 0.50, 0.55, 0.65, 0.85, 1.00, 0.95, 0.80, 0.70, 0.55, 0.45],
    "comercial": [0.20, 0.18, 0.15, 0.15, 0.18, 0.25, 0.40, 0.70, 0.90, 0.95, 0.98, 0.95,
                  0.98, 1.00, 1.00, 0.98, 0.90, 0.80, 0.60, 0.40, 0.30, 0.25, 0.22, 0.20],
    "industrial": [0.30, 0.28, 0.28, 0.25, 0.28, 0.40, 0.70, 0.95, 1.00, 1.00, 1.00, 0.98,
                   0.95, 0.98, 1.00, 1.00, 1.00, 1.00, 0.98, 0.98, 0.95, 0.90, 0.60, 0.40],
}


def synthetic(consumo_mensal_kwh: float, perfil: str = "residencial", sazonalidade: float = 0.15,
              aleatoriedade: float = 0.10, consumo_mensal_lista: list[float] | None = None,
              seed: int = 7) -> np.ndarray:
    """Gera a carga horária a partir do consumo médio mensal (ou 12 valores mensais).

    Mesma lógica do script Octave: perfil diário EPE × fator sazonal (cosseno, pico
    no verão) × ruído aleatório, escalonado para o consumo anual desejado. Se
    ``consumo_mensal_lista`` for informado, cada mês é escalonado ao seu valor.
    """
    if perfil not in PERFIS_EPE:
        raise ValueError(f"Perfil desconhecido: {perfil}")
    base = np.tile(np.asarray(PERFIS_EPE[perfil], float), 365)
    t = np.arange(1, HOURS + 1)
    sazonal = 1.0 + sazonalidade * np.cos(2 * np.pi * t / HOURS)
    rng = np.random.default_rng(seed)
    ruido = 1.0 + aleatoriedade * (rng.random(HOURS) - 0.5)
    load = base * sazonal * ruido
    month = pd.date_range("2019-01-01", periods=HOURS, freq="h").month.values
    if consumo_mensal_lista:
        if len(consumo_mensal_lista) != 12:
            raise ValueError("Informe 12 valores de consumo mensal.")
        for m in range(1, 13):
            sel = month == m
            load[sel] *= consumo_mensal_lista[m - 1] / load[sel].sum()
    else:
        load *= consumo_mensal_kwh * 12 / load.sum()
    return load


def from_file(content: bytes, filename: str, coluna: str | None = None) -> np.ndarray:
    text = content.decode("utf-8", errors="replace")
    first = text.splitlines()[0] if text else ""
    sep = ";" if first.count(";") > first.count(",") else ","
    df = pd.read_csv(io.StringIO(text), sep=sep, decimal="," if sep == ";" else ".")
    if coluna and coluna in df.columns:
        col = coluna
    else:
        cands = [c for c in df.columns if any(k in c.lower() for k in ("carga", "load", "kw", "consumo", "demanda"))]
        cands = [c for c in cands if "irrad" not in c.lower()]
        num = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c]) and c.lower() not in ("hora", "hour")]
        col = cands[0] if cands else (num[-1] if num else None)
    if col is None:
        raise ValueError(f"Não encontrei a coluna de carga. Colunas: {list(df.columns)}")
    s = pd.to_numeric(df[col], errors="coerce").fillna(0).to_numpy(float)
    if len(s) == 8784:
        s = np.concatenate([s[: 59 * 24], s[60 * 24 :]])
    if len(s) == 35040:  # 15 min → horário (média de kW)
        s = s.reshape(-1, 4).mean(axis=1)
    if len(s) != HOURS:
        raise ValueError(f"A série de carga deve ter 8760 valores horários; encontrado {len(s)}.")
    return np.clip(s, 0, None)


def summary(load: np.ndarray, fonte: str) -> dict:
    month = pd.date_range("2019-01-01", periods=HOURS, freq="h").month.values
    monthly = np.bincount(month - 1, weights=load, minlength=12)
    return {
        "fonte": fonte,
        "consumo_anual_kwh": round(float(load.sum()), 1),
        "consumo_mensal_kwh": [round(float(v), 1) for v in monthly],
        "demanda_max_kw": round(float(load.max()), 2),
        "demanda_media_kw": round(float(load.mean()), 2),
        "fator_carga": round(float(load.mean() / max(load.max(), 1e-9)), 3),
        "perfil_medio_diario_kw": [round(float(v), 3) for v in load.reshape(365, 24).mean(axis=0)],
    }
