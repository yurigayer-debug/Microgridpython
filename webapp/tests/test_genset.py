import numpy as np
import pytest

from app import genset_finance as gf
from app.schemas import Gerador


def test_despacho_gerador_curva_octave():
    g = Gerador(habilitado=True, potencia_kw=5, consumo_a=0.24, consumo_b=0.01, vida_horas=3)
    unmet = np.zeros((2, 8760))
    unmet[0, :2] = [2.0, 8.0]
    unmet[1, :2] = [1.0, 1.0]
    r = gf.dispatch(unmet, g)
    assert r["energia"][0, :2].tolist() == [2.0, 5.0]
    assert r["residual"][0, 1] == pytest.approx(3.0)
    assert r["horas"].tolist() == [2, 2]
    assert r["litros"][0] == pytest.approx(0.24 * 7 + 0.01 * 5 * 2)
    assert r["substituicoes"].tolist() == [0, 1]  # 4 h acumuladas > vida de 3 h


def test_gerador_desabilitado_nao_atende():
    unmet = np.ones((1, 8760))
    r = gf.dispatch(unmet, Gerador(habilitado=False))
    assert r["energia"].sum() == 0 and r["residual"].sum() == 8760


def test_npc_e_lcoe():
    assert gf.npc(100.0, np.array([110.0]), 0.0, 10.0) == pytest.approx(200.0)
    assert gf.levelized(100.0, np.array([10.0, 10.0]), 0.0) == pytest.approx(5.0)


def test_tir_e_payback():
    assert gf.irr([-100, 110]) == pytest.approx(10.0, abs=1e-6)
    assert gf.payback([-100, 50, 50, 50]) == pytest.approx(2.0)
    assert gf.payback([-100, 10]) is None
