import numpy as np
import pytest

from app import tariff_br
from app.schemas import Tarifa


def month(cons, inj, regime="gd2", pct=0.6, disp=50.0, bank=0.0, rates=(1.0, 1.0, 1.0), fiob=(0.3, 0.3, 0.3)):
    return tariff_br.bill_month(np.array(cons, float), np.array(inj, float), np.array(rates, float),
                                np.array(fiob, float), bank, pct, regime, disp, 0.4)


def test_fio_b_transicao():
    assert tariff_br.fio_b_percent(2023, "gd2", 100) == 0.15
    assert tariff_br.fio_b_percent(2026, "gd2", 100) == 0.60
    assert tariff_br.fio_b_percent(2028, "gd2", 100) == 0.90
    assert tariff_br.fio_b_percent(2030, "gd2", 100) == 1.0
    assert tariff_br.fio_b_percent(2040, "gd1", 100) == 0.0
    assert tariff_br.fio_b_percent(2046, "gd1", 100) == 1.0


def test_gd2_compensa_e_cobra_fio_b():
    r, bank = month([300, 0, 0], [200, 0, 0], pct=0.6)
    # 200 kWh compensados; 100 kWh pagos integralmente; Fio B = 200 × 0,30 × 0,6 = 36
    assert r["compensado_kwh"] == pytest.approx(200)
    assert r["fio_b"] == pytest.approx(36)
    assert r["fatura"] == pytest.approx(100 + 36)
    assert bank == 0


def test_gd2_minimo_disponibilidade():
    r, bank = month([100, 0, 0], [500, 0, 0], pct=0.15)
    # Fio B = 100 × 0,3 × 0,15 = 4,5 < custo de disponibilidade (50 kWh × 1,0)
    assert r["fatura"] == pytest.approx(50)
    assert bank == pytest.approx(400)


def test_gd1_nao_compensa_abaixo_da_disponibilidade():
    r, bank = month([300, 0, 0], [500, 0, 0], regime="gd1", pct=0.0)
    assert r["compensado_kwh"] == pytest.approx(250)
    assert r["fatura"] == pytest.approx(50)
    assert bank == pytest.approx(250)


def test_banco_de_creditos_usado_no_mes_seguinte():
    _, bank = month([0, 0, 0], [300, 0, 0])
    r, bank2 = month([200, 0, 0], [0, 0, 0], bank=bank)
    assert r["compensado_kwh"] == pytest.approx(200)
    assert bank2 == pytest.approx(100)


def test_branca_converte_creditos_entre_postos():
    # excedente fora de ponta (tarifa 0,8) compensa ponta (tarifa 2,0) na razão 0,8/2,0
    r, _ = month([0, 0, 10], [100, 0, 0], rates=(0.8, 1.2, 2.0), fiob=(0, 0, 0), pct=0.0)
    assert r["compensado_kwh"] == pytest.approx(10)


def test_sem_compensacao_vende_excedente():
    r, _ = month([300, 0, 0], [100, 0, 0], regime="sem_compensacao")
    assert r["fatura"] == pytest.approx(300 - 100 * 0.4)


def test_posto_horario_branca():
    p = tariff_br.posto_horario(2026, 18)
    # 1/1/2026 é quinta-feira: 18-20h ponta, 17h e 21h intermediário
    assert list(p[17:22]) == [1, 2, 2, 2, 1]
    # 3/1/2026 é sábado: tudo fora de ponta
    assert p[2 * 24 : 3 * 24].sum() == 0


def test_annual_bills_economia_positiva():
    t = Tarifa()
    load = np.full((2, 8760), 1.0)
    imp = np.full((2, 8760), 0.5)
    exp = np.zeros((2, 8760))
    r = tariff_br.annual_bills(imp, exp, load, t)
    assert r["fatura_sem_sistema"][0] == pytest.approx(8760 * t.tarifa_kwh, rel=1e-6)
    assert r["economia"][0] > 0
    assert r["fatura_sem_sistema"][1] > r["fatura_sem_sistema"][0]  # reajuste
