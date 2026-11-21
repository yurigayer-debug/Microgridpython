"""Otimização de dimensionamento (F6): varredura FV × bateria × gerador com o PySAM.

Cada combinação executa a cadeia completa (``engine.run``) em um processo separado
(``ProcessPoolExecutor``). O job roda em segundo plano e o frontend consulta o
progresso. O critério de escolha é configurável (VPL, LCOE de atendimento ou NPC);
no modo off-grid só são elegíveis as soluções que atendem a confiabilidade mínima.
"""
from __future__ import annotations

import itertools
import math
import multiprocessing
import os
import threading
import time
import uuid
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
from typing import Literal

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field

from . import engine
from .schemas import SimulationInput

KPI_KEYS = [
    "potencia_fv_kwp", "potencia_inversor_kw", "bateria_kwh", "geracao_fv_ano1_kwh", "autoconsumo_pct",
    "autossuficiencia_pct", "fracao_renovavel_pct", "atendimento_pct", "nao_atendida_ano1_kwh",
    "importado_rede_kwh", "exportado_rede_kwh", "gerador_energia_ano1_kwh", "gerador_horas_ano1",
    "gerador_litros_ano1", "fv_nao_aproveitada_ano1_kwh", "autonomia_h", "capex_rs", "economia_ano1_rs",
    "vpl_rs", "tir_pct", "payback_anos", "npc_rs", "lcoe_atendimento_rs_kwh", "lcoe_real_rs_kwh",
    "lcos_real_rs_kwh", "bateria_substituicoes",
]


class OtimizacaoSpec(BaseModel):
    pv_kwp: list[float] = Field(default_factory=lambda: [3.3, 4.4, 5.5, 6.6, 8.8], min_length=1, max_length=15)
    bateria_kwh: list[float] = Field(default_factory=lambda: [0, 5, 10, 15, 20], min_length=1, max_length=15)
    gerador_kw: list[float] = Field(default_factory=lambda: [0], min_length=1, max_length=8)
    inversor_automatico: bool = Field(True, description="Ajusta a quantidade de inversores para CC/CA ≤ limite.")
    relacao_cc_ca_max: float = Field(1.3, gt=0.5, le=3)
    criterio: Literal["vpl", "lcoe_atendimento", "npc"] = "vpl"
    processos: int = Field(0, ge=0, le=64, description="0 = número de núcleos da CPU.")


class OtimizacaoReq(BaseModel):
    base: SimulationInput
    spec: OtimizacaoSpec = OtimizacaoSpec()


def string_layout(inp: SimulationInput, kwp: float, tmin: float = 0.0) -> tuple[int, int]:
    """Escolhe módulos/string e nº de strings que mais se aproximam de ``kwp`` respeitando a
    tensão CC máxima (Voc no frio) e o MPPT mínimo (Vmp a 70 °C)."""
    md, iv = inp.modulo, inp.inversor
    kv = md.coef_voc / 100.0
    tmin = min(tmin, 5.0)
    mps_max = max(1, int(iv.vdc_max // (md.voc * (1 + kv * (tmin - 25)))))
    mps_min = max(1, math.ceil(iv.mppt_min / (md.vmp * (1 + kv * 45))))
    if mps_min > mps_max:
        mps_min = mps_max
    pmod = md.vmp * md.imp / 1000.0
    alvo = max(1, round(kwp / pmod))
    combos = [(abs(mps * ns - alvo), ns, -mps) for mps in range(mps_min, mps_max + 1) for ns in range(1, 61)]
    tol = max(min(c[0] for c in combos), round(0.03 * alvo))
    # dentro da tolerância de 3%: menos strings (menos corrente por MPPT) e strings mais longas
    err, ns, neg_mps = min((c for c in combos if c[0] <= tol), key=lambda c: (c[1], c[2], c[0]))
    return -neg_mps, ns


def build_case(base: SimulationInput, spec: OtimizacaoSpec, kwp: float, kwh: float, gkw: float,
               tmin: float = 0.0) -> dict:
    inp = base.model_copy(deep=True)
    md, ar, iv, bt = inp.modulo, inp.arranjo, inp.inversor, inp.bateria
    pmod = md.vmp * md.imp / 1000.0
    ar.modulos_por_string, ar.n_strings = string_layout(inp, kwp, tmin)
    pdc = ar.n_strings * ar.modulos_por_string * pmod
    if spec.inversor_automatico:
        iv.quantidade = max(1, math.ceil(pdc / (iv.potencia_ca_kw * spec.relacao_cc_ca_max) - 1e-9))
    pac = iv.potencia_ca_kw * iv.quantidade
    c_rate = base.bateria.potencia_kw / max(1e-9, base.bateria.capacidade_kwh)
    if kwh > 0:
        bt.habilitada = True
        bt.capacidade_kwh = kwh
        bt.potencia_kw = round(min(kwh * c_rate, pac), 2)
    else:
        bt.habilitada = False
    inp.gerador.habilitado = gkw > 0
    if gkw > 0:
        inp.gerador.potencia_kw = gkw
    return {"inp": inp, "alvo": {"pv_kwp": kwp, "bateria_kwh": kwh, "gerador_kw": gkw}}


def _run_case(payload: dict, weather, load) -> dict:
    inp = SimulationInput.model_validate(payload["inp"])
    t0 = time.time()
    try:
        r = engine.run(inp, weather, load)
    except Exception as e:  # noqa: BLE001
        return {"alvo": payload["alvo"], "ok": False, "erro": str(e)}
    if not r.get("ok"):
        erros = [m["texto"] for m in r.get("validacao", []) if m["nivel"] == "erro"]
        return {"alvo": payload["alvo"], "ok": False, "erro": "; ".join(erros) or r.get("erro")}
    k = r["kpis"]
    return {
        "alvo": payload["alvo"],
        "ok": True,
        "tempo_s": round(time.time() - t0, 1),
        "config": {"modulos_por_string": inp.arranjo.modulos_por_string, "n_strings": inp.arranjo.n_strings, "inversores": inp.inversor.quantidade,
                   "bateria_habilitada": inp.bateria.habilitada, "bateria_kwh": inp.bateria.capacidade_kwh,
                   "bateria_kw": inp.bateria.potencia_kw, "gerador_habilitado": inp.gerador.habilitado,
                   "gerador_kw": inp.gerador.potencia_kw},
        "kpis": {key: k.get(key) for key in KPI_KEYS},
    }


class Job:
    def __init__(self, req: OtimizacaoReq, weather, load):
        self.id = uuid.uuid4().hex[:10]
        self.req = req
        self.weather, self.load = weather, load
        combos = list(itertools.product(sorted(set(req.spec.pv_kwp)), sorted(set(req.spec.bateria_kwh)),
                                        sorted(set(req.spec.gerador_kw))))
        if req.base.operacao.modo == "off_grid":
            combos = [c for c in combos if c[1] > 0]  # off-grid exige bateria
        tmin = float(np.nanmin(weather.tdry))
        self.cases = [build_case(req.base, req.spec, *c, tmin=tmin) for c in combos]
        self.total = len(self.cases)
        self.resultados: list[dict] = []
        self.status = "na_fila"
        self.erro = ""
        self.inicio = time.time()
        self.fim: float | None = None
        self._cancel = threading.Event()

    def start(self):
        threading.Thread(target=self._run, daemon=True).start()

    def cancel(self):
        self._cancel.set()

    def _run(self):
        self.status = "executando"
        workers = self.req.spec.processos or os.cpu_count() or 2
        workers = max(1, min(workers, self.total))
        try:
            with ProcessPoolExecutor(max_workers=workers, mp_context=multiprocessing.get_context("spawn")) as pool:
                futs = [pool.submit(_run_case, {"inp": c["inp"].model_dump(), "alvo": c["alvo"]},
                                    self.weather, self.load) for c in self.cases]
                for fut in as_completed(futs):
                    if self._cancel.is_set():
                        for f2 in futs:
                            f2.cancel()
                        self.status = "cancelado"
                        break
                    self.resultados.append(fut.result())
            if self.status != "cancelado":
                self.status = "concluido"
        except Exception as e:  # noqa: BLE001
            self.status = "erro"
            self.erro = str(e)
        self.fim = time.time()

    def ranking(self) -> dict:
        spec, base = self.req.spec, self.req.base
        ok = [r for r in self.resultados if r["ok"]]
        off = base.operacao.modo == "off_grid"
        for r in ok:
            k = r["kpis"]
            r["viavel"] = (k.get("atendimento_pct") or 0) >= base.operacao.confiabilidade_min if off else True
        cand = [r for r in ok if r["viavel"]]
        key = {"vpl": "vpl_rs", "lcoe_atendimento": "lcoe_atendimento_rs_kwh", "npc": "npc_rs"}[spec.criterio]
        sign = -1 if spec.criterio == "vpl" else 1

        def score(r):
            v = r["kpis"].get(key)
            return math.inf if v is None else sign * v

        cand.sort(key=score)
        melhor = cand[0] if cand else None
        decorrido = (self.fim or time.time()) - self.inicio
        return {
            "id": self.id,
            "status": self.status,
            "erro": self.erro,
            "total": self.total,
            "concluidos": len(self.resultados),
            "decorrido_s": round(decorrido, 1),
            "criterio": spec.criterio,
            "modo": base.operacao.modo,
            "confiabilidade_min": base.operacao.confiabilidade_min,
            "melhor": melhor,
            "resultados": sorted(self.resultados, key=lambda r: (r["alvo"]["pv_kwp"], r["alvo"]["bateria_kwh"],
                                                                  r["alvo"]["gerador_kw"])),
        }

    def to_csv(self) -> str:
        rows = []
        for r in self.ranking()["resultados"]:
            row = {"PV_alvo_kWp": r["alvo"]["pv_kwp"], "Bateria_kWh": r["alvo"]["bateria_kwh"],
                   "Gerador_kW": r["alvo"]["gerador_kw"], "ok": r["ok"], "viavel": r.get("viavel"),
                   "erro": r.get("erro", "")}
            row.update(r.get("config", {}))
            row.update(r.get("kpis", {}))
            rows.append(row)
        return pd.DataFrame(rows).to_csv(index=False)


# --------------------------------------------------------------------- comparação com o Octave
OCTAVE_COLS = {
    "PV_kWp": "pv_kwp", "Bateria_kWh": "bateria_kwh", "Gerador_kW": "gerador_kw", "LCOE_R$/kWh": "lcoe",
    "Penetr.Renov_%": "penetracao_renovavel_pct", "Autonomia_h": "autonomia_h", "CAPEX_R$": "capex",
    "OPEX_Anual_R$": "opex_anual", "LCC_R$": "lcc", "Combustivel_Anual_L": "combustivel_l",
    "Horas_Gerador_h": "horas_gerador", "Curtailment_kWh": "curtailment_kwh",
    "Carga_Nao_Atendida_kWh": "nao_atendida_kwh", "Energia_Importada_kWh": "importada_kwh",
    "Energia_Exportada_kWh": "exportada_kwh", "Autoconsumo_%": "autoconsumo_pct", "LCOS_R$/kWh": "lcos",
}


def read_octave(repo_dir: Path, modo: str) -> list[dict]:
    path = repo_dir / f"relatorio_completo_{'on_grid' if modo == 'on_grid' else 'off_grid'}.csv"
    if not path.exists():
        return []
    df = pd.read_csv(path).rename(columns=OCTAVE_COLS)
    df = df.replace([np.inf, -np.inf], np.nan)
    return [{k: (None if pd.isna(v) else float(v)) for k, v in row.items()} for row in df.to_dict("records")]
