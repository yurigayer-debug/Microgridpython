"""API web (FastAPI) – simulação de inversor híbrido + bateria + FV com NREL PySAM.

Executar:  uvicorn app.main:app --reload   (a partir da pasta webapp/)
"""
from __future__ import annotations

import os
import threading
import uuid
from collections import OrderedDict
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import engine, load_profiles, optimizer, report, weather
from .schemas import SimulationInput, form_schema

BASE = Path(__file__).resolve().parent
REPO_CSV = BASE.parent.parent / "perfil_carga_e_solar.csv"

app = FastAPI(title="Simulador Híbrido PySAM", version="1.0.0",
              description="Inversor híbrido + bateria + FV com NREL PySAM e tarifa brasileira (Lei 14.300).")


class Store:
    """Cache em memória (uso local, um usuário)."""

    def __init__(self, limit: int = 20):
        self.limit = limit
        self.data: OrderedDict[str, object] = OrderedDict()
        self.lock = threading.Lock()

    def put(self, obj) -> str:
        key = uuid.uuid4().hex[:10]
        with self.lock:
            self.data[key] = obj
            while len(self.data) > self.limit:
                self.data.popitem(last=False)
        return key

    def get(self, key: str):
        with self.lock:
            if key not in self.data:
                raise HTTPException(404, "Item não encontrado (talvez expirado). Carregue novamente.")
            return self.data[key]


WEATHER, LOADS, RESULTS = Store(), Store(), Store(10)


def _weather_reply(w: weather.WeatherData) -> dict:
    wid = WEATHER.put(w)
    month = w.month - 1
    # perfil médio diário de GHI por mês (para o gráfico de pré-visualização)
    prof = np.zeros((12, 24))
    for mo in range(12):
        sel = month == mo
        prof[mo] = w.ghi[sel].reshape(-1, 24).mean(axis=0)
    return {"id": wid, "resumo": w.summary(), "ghi_perfil_mensal": np.round(prof, 1).tolist()}


def _load_reply(load: np.ndarray, fonte: str) -> dict:
    lid = LOADS.put(load)
    return {"id": lid, "resumo": load_profiles.summary(load, fonte)}


# ------------------------------------------------------------------- páginas e esquema
FRONTEND = BASE.parent / "frontend" / "dist"
SEM_FRONTEND = """<!doctype html><meta charset="utf-8"><title>Simulador Híbrido PySAM</title>
<body style="font-family:system-ui;max-width:640px;margin:40px auto;padding:0 16px;line-height:1.5">
<h1>Interface não compilada</h1>
<p>A API está no ar, mas a interface React ainda não foi compilada. Na pasta <code>webapp/frontend</code> execute:</p>
<pre>npm install
npm run build</pre>
<p>ou use <code>./run.sh</code> / <code>docker compose up</code>, que fazem isso automaticamente.
A documentação da API está em <a href="/docs">/docs</a>.</p></body>"""


@app.get("/", include_in_schema=False)
def index():
    page = FRONTEND / "index.html"
    if page.exists():
        return FileResponse(page)
    return HTMLResponse(SEM_FRONTEND)


if (FRONTEND / "assets").exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND / "assets"), name="assets")


@app.get("/api/esquema")
def esquema():
    return {"grupos": form_schema(), "padrao": SimulationInput().model_dump(),
            "perfis_carga": list(load_profiles.PERFIS_EPE), "ghi_pelotas": weather.GHI_MENSAL_PELOTAS,
            "temp_pelotas": weather.TEMP_MENSAL_PELOTAS, "repositorio_csv": REPO_CSV.exists()}


# ------------------------------------------------------------------- clima
class PvgisReq(BaseModel):
    latitude: float
    longitude: float


class SinteticoReq(BaseModel):
    latitude: float
    longitude: float
    ghi_mensal: list[float] = Field(default_factory=lambda: list(weather.GHI_MENSAL_PELOTAS))
    temp_mensal: list[float] = Field(default_factory=lambda: list(weather.TEMP_MENSAL_PELOTAS))


@app.post("/api/clima/pvgis")
def clima_pvgis(req: PvgisReq):
    try:
        w = weather.from_pvgis(req.latitude, req.longitude)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Falha ao obter dados do PVGIS (verifique a internet): {e}") from e
    return _weather_reply(w)


@app.post("/api/clima/sintetico")
def clima_sintetico(req: SinteticoReq):
    try:
        w = weather.synthetic(req.latitude, req.longitude, req.ghi_mensal, req.temp_mensal)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return _weather_reply(w)


@app.post("/api/clima/arquivo")
async def clima_arquivo(arquivo: UploadFile = File(...), latitude: float | None = Form(None),
                        longitude: float | None = Form(None), fuso: float | None = Form(None)):
    content = await arquivo.read()
    try:
        w = weather.from_file(content, arquivo.filename or "clima.csv", latitude, longitude, fuso)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Não foi possível ler o arquivo de clima: {e}") from e
    return _weather_reply(w)


@app.post("/api/clima/repositorio")
def clima_repositorio(req: PvgisReq):
    if not REPO_CSV.exists():
        raise HTTPException(404, "perfil_carga_e_solar.csv não encontrado no repositório.")
    df = pd.read_csv(REPO_CSV)
    w = weather.from_ghi_series(df["Irradiacao_W_m2"].to_numpy(float), req.latitude, req.longitude,
                                source="perfil_carga_e_solar.csv (Octave)")
    return _weather_reply(w)


# ------------------------------------------------------------------- carga
class CargaReq(BaseModel):
    consumo_mensal_kwh: float = 600.0
    perfil: str = "residencial"
    consumo_mensal_lista: list[float] | None = None
    sazonalidade: float = 0.15
    aleatoriedade: float = 0.10


@app.post("/api/carga/sintetica")
def carga_sintetica(req: CargaReq):
    try:
        load = load_profiles.synthetic(req.consumo_mensal_kwh, req.perfil, req.sazonalidade, req.aleatoriedade,
                                       req.consumo_mensal_lista or None)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return _load_reply(load, f"Sintética ({req.perfil}, EPE)")


@app.post("/api/carga/arquivo")
async def carga_arquivo(arquivo: UploadFile = File(...), coluna: str | None = Form(None)):
    content = await arquivo.read()
    try:
        load = load_profiles.from_file(content, arquivo.filename or "carga.csv", coluna)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Não foi possível ler o arquivo de carga: {e}") from e
    return _load_reply(load, f"Arquivo: {arquivo.filename}")


@app.post("/api/carga/repositorio")
def carga_repositorio():
    if not REPO_CSV.exists():
        raise HTTPException(404, "perfil_carga_e_solar.csv não encontrado no repositório.")
    load = load_profiles.from_file(REPO_CSV.read_bytes(), REPO_CSV.name, "Carga_kW")
    return _load_reply(load, "perfil_carga_e_solar.csv (Octave)")


# ------------------------------------------------------------------- simulação
@app.post("/api/simular")
def simular(inp: SimulationInput):
    w = WEATHER.get(inp.weather_id)
    load = LOADS.get(inp.load_id)
    try:
        res = engine.run(inp, w, load)
    except engine.SimulationError as e:
        raise HTTPException(422, str(e)) from e
    if res.get("ok"):
        res["id"] = RESULTS.put((inp, res))
    return res


@app.post("/api/validar")
def validar(inp: SimulationInput):
    w = WEATHER.get(inp.weather_id) if inp.weather_id else None
    load = LOADS.get(inp.load_id) if inp.load_id else None
    return {"validacao": engine.validate_design(inp, w, load)}


def _result(rid: str):
    return RESULTS.get(rid)


@app.get("/api/resultado/{rid}/horario.csv")
def export_horario(rid: str):
    _, res = _result(rid)
    return Response(report.hourly_csv(res), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="horario_{rid}.csv"'})


@app.get("/api/resultado/{rid}/fluxo_caixa.csv")
def export_fluxo(rid: str):
    _, res = _result(rid)
    return Response(report.cashflow_csv(res), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="fluxo_caixa_{rid}.csv"'})


@app.get("/api/resultado/{rid}/dossie.txt", response_class=PlainTextResponse)
def export_dossie(rid: str):
    inp, res = _result(rid)
    return PlainTextResponse(report.dossie(inp, res),
                             headers={"Content-Disposition": f'attachment; filename="dossie_{rid}.txt"'})


@app.get("/api/resultado/{rid}/entradas.json")
def export_entradas(rid: str):
    inp, _ = _result(rid)
    return Response(inp.model_dump_json(indent=2), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="entradas_{rid}.json"'})


# ------------------------------------------------------------------- otimização (F6)
JOBS: dict[str, optimizer.Job] = {}


@app.post("/api/otimizar")
def otimizar(req: optimizer.OtimizacaoReq):
    w = WEATHER.get(req.base.weather_id)
    load = LOADS.get(req.base.load_id)
    if any(j.status in ("na_fila", "executando") for j in JOBS.values()):
        raise HTTPException(409, "Já existe uma otimização em execução. Aguarde ou cancele.")
    job = optimizer.Job(req, w, load)
    if job.total == 0:
        raise HTTPException(400, "Nenhuma combinação para simular.")
    if job.total > 225:
        raise HTTPException(400, f"{job.total} combinações: reduza a grade (máx. 225).")
    JOBS[job.id] = job
    while len(JOBS) > 5:
        JOBS.pop(next(iter(JOBS)))
    job.start()
    return job.ranking()


@app.get("/api/otimizar/{jid}")
def otimizar_status(jid: str):
    if jid not in JOBS:
        raise HTTPException(404, "Otimização não encontrada.")
    return JOBS[jid].ranking()


@app.post("/api/otimizar/{jid}/cancelar")
def otimizar_cancelar(jid: str):
    if jid not in JOBS:
        raise HTTPException(404, "Otimização não encontrada.")
    JOBS[jid].cancel()
    return {"ok": True}


@app.get("/api/otimizar/{jid}/resultados.csv")
def otimizar_csv(jid: str):
    if jid not in JOBS:
        raise HTTPException(404, "Otimização não encontrada.")
    return Response(JOBS[jid].to_csv(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="otimizacao_{jid}.csv"'})


@app.get("/api/octave/{modo}")
def octave(modo: str):
    if modo not in ("on_grid", "off_grid"):
        raise HTTPException(400, "Modo deve ser on_grid ou off_grid.")
    return {"modo": modo, "linhas": optimizer.read_octave(REPO_CSV.parent, modo)}


def main():  # pragma: no cover
    import uvicorn  # noqa: PLC0415

    port = int(os.environ.get("PORT", "8000"))
    print(f"\n  Simulador Híbrido PySAM → http://127.0.0.1:{port}\n")
    uvicorn.run("app.main:app", host="127.0.0.1", port=port)


if __name__ == "__main__":  # pragma: no cover
    main()
