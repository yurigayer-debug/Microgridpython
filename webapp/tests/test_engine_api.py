"""Testes de integração: executam o PySAM de verdade (cada simulação leva ~5–15 s)."""
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import engine, load_profiles, weather
from app.main import app
from app.schemas import SimulationInput


@pytest.fixture(scope="module")
def dados():
    w = weather.synthetic(-31.77, -52.34, weather.GHI_MENSAL_PELOTAS)
    load = load_profiles.synthetic(600)
    return w, load


def test_clima_sintetico_respeita_medias():
    w = weather.synthetic(-31.77, -52.34, weather.GHI_MENSAL_PELOTAS)
    s = w.summary()
    assert s["ghi_mensal_kwh_m2_dia"] == pytest.approx(weather.GHI_MENSAL_PELOTAS, abs=0.02)
    assert np.all(w.dni >= 0) and np.all(w.dhi >= 0)


def test_carga_sintetica_escalonada():
    load = load_profiles.synthetic(1000)
    assert load.sum() == pytest.approx(12000)
    assert len(load) == 8760


def test_parse_quedas():
    o = engine.parse_outages("01/01 00:00 3; 15/06 18:00 2")
    assert o.sum() == 5 and o[0] == 1 and o[3] == 0


def test_validacao_detecta_tensao_excessiva(dados):
    inp = SimulationInput()
    inp.arranjo.modulos_por_string = 14
    msgs = engine.validate_design(inp, dados[0])
    assert any(m["nivel"] == "erro" for m in msgs)


def test_simulacao_hibrida_cc(dados):
    w, load = dados
    inp = SimulationInput()
    inp.backup.simular_quedas = True
    r = engine.run(inp, w, load)
    assert r["ok"]
    k = r["kpis"]
    assert 5000 < k["geracao_fv_ano1_kwh"] < 9000
    assert 0 < k["autoconsumo_pct"] <= 100
    assert k["bateria_kwh"] == pytest.approx(10, rel=0.1)
    assert k["vpl_rs"] is not None and k["payback_anos"] is not None
    assert len(r["horario"]["soc"]) == 8760
    assert len(r["fluxo"]["fluxo_caixa"]) == 26
    assert r["backup"]["horas_queda"] == 12
    # balanço de energia do ano 1: carga atendida = FV + bateria + rede (+ não atendida na queda)
    h = {k2: np.array(v) for k2, v in r["horario"].items()}
    atendida = h["fv_para_carga"] + h["bateria_para_carga"] + h["rede_para_carga"]
    assert atendida.sum() <= h["carga"].sum() + 1
    assert atendida.sum() >= 0.99 * (h["carga"] * (1 - h["queda_rede"])).sum()


def test_sem_bateria_e_ponta(dados):
    w, load = dados
    inp = SimulationInput()
    inp.bateria.habilitada = False
    r = engine.run(inp, w, load)
    assert r["ok"] and r["kpis"]["bateria_kwh"] == 0
    inp = SimulationInput()
    inp.despacho.estrategia = "ponta"
    inp.tarifa.modalidade = "branca"
    inp.bateria.acoplamento = "ca"
    r = engine.run(inp, w, load)
    assert r["ok"]


def test_api_fluxo_completo():
    c = TestClient(app)
    s = c.get("/api/esquema").json()
    assert any(g["key"] == "bateria" for g in s["grupos"])
    wid = c.post("/api/clima/sintetico", json={"latitude": -31.77, "longitude": -52.34}).json()["id"]
    lid = c.post("/api/carga/sintetica", json={"consumo_mensal_kwh": 500}).json()["id"]
    body = dict(s["padrao"], weather_id=wid, load_id=lid)
    body["financeiro"]["anos_analise"] = 10
    r = c.post("/api/simular", json=body)
    assert r.status_code == 200, r.text
    rid = r.json()["id"]
    assert c.get(f"/api/resultado/{rid}/horario.csv").text.startswith("Hora,")
    assert "DOSSIÊ" in c.get(f"/api/resultado/{rid}/dossie.txt").text
    assert c.get(f"/api/resultado/{rid}/fluxo_caixa.csv").status_code == 200
    assert c.get("/").status_code == 200


def test_pvgis_converte_utc_para_hora_local(monkeypatch):
    import pandas as pd

    idx = pd.date_range("2019-01-01", periods=8760, freq="h", tz="UTC")
    ghi = np.zeros(8760)
    ghi[15] = 800.0  # 15h UTC = 12h em UTC-3
    df = pd.DataFrame({"ghi": ghi, "dni": ghi, "dhi": ghi * 0, "temp_air": 20.0, "wind_speed": 2.0}, index=idx)
    meta = {"inputs": {"location": {"latitude": -31.77, "longitude": -52.34, "elevation": 7.0}}}
    monkeypatch.setattr(weather.pvlib.iotools, "get_pvgis_tmy", lambda *a, **k: (df, meta))
    w = weather.from_pvgis(-31.77, -52.34)
    assert w.tz == -3 and w.elev == 7.0
    assert w.ghi[12] == 800.0 and w.ghi.sum() == 800.0
