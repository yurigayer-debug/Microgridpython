import time

import pytest
from fastapi.testclient import TestClient

from app import optimizer
from app.main import app
from app.schemas import SimulationInput


def test_layout_respeita_tensoes():
    inp = SimulationInput()
    for kwp in (2, 5.5, 8.8, 15, 30):
        mps, ns = optimizer.string_layout(inp, kwp, 5)
        assert mps * inp.modulo.voc * (1 + inp.modulo.coef_voc / 100 * (5 - 25)) <= inp.inversor.vdc_max
        assert abs(mps * ns * 0.55 - kwp) / kwp < 0.12


def test_build_case_ajusta_inversor_e_bateria():
    spec = optimizer.OtimizacaoSpec()
    c = optimizer.build_case(SimulationInput(), spec, 15, 20, 0)
    inp = c["inp"]
    assert inp.inversor.quantidade == 3  # 14,85 kWp / (5 kW × 1,3)
    assert inp.bateria.capacidade_kwh == 20 and inp.bateria.potencia_kw == 10  # mantém taxa C de 0,5
    assert optimizer.build_case(SimulationInput(), spec, 5, 0, 0)["inp"].bateria.habilitada is False


def test_job_otimizacao_api():
    c = TestClient(app)
    s = c.get("/api/esquema").json()
    wid = c.post("/api/clima/sintetico", json={"latitude": -31.77, "longitude": -52.34}).json()["id"]
    lid = c.post("/api/carga/sintetica", json={"consumo_mensal_kwh": 600}).json()["id"]
    base = dict(s["padrao"], weather_id=wid, load_id=lid)
    base["financeiro"]["anos_analise"] = 5
    r = c.post("/api/otimizar", json={"base": base, "spec": {"pv_kwp": [3.3, 5.5], "bateria_kwh": [0, 5]}})
    assert r.status_code == 200, r.text
    jid = r.json()["id"]
    for _ in range(300):
        st = c.get(f"/api/otimizar/{jid}").json()
        if st["status"] not in ("na_fila", "executando"):
            break
        time.sleep(1)
    assert st["status"] == "concluido" and st["concluidos"] == 4
    assert all(x["ok"] for x in st["resultados"])
    assert st["melhor"]["kpis"]["vpl_rs"] == max(x["kpis"]["vpl_rs"] for x in st["resultados"])
    assert "PV_alvo_kWp" in c.get(f"/api/otimizar/{jid}/resultados.csv").text


def test_leitura_octave():
    linhas = optimizer.read_octave(optimizer.Path(__file__).resolve().parents[2], "off_grid")
    assert linhas and {"pv_kwp", "bateria_kwh", "lcoe"} <= set(linhas[0])
