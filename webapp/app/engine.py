"""Motor de simulação: monta e executa a cadeia PySAM para inversor híbrido + bateria + FV.

Cadeia:  Pvsamv1 (FV + inversor + bateria + despacho)
      →  Grid (limites de conexão)
      →  Utilityrate5 (executado apenas para preencher entradas exigidas pelo Cashloan)
      →  tarifa brasileira (tariff_br) substitui as contas de energia
      →  Cashloan (VPL, TIR, payback, LCOE, LCOS, fluxo de caixa)
"""
from __future__ import annotations

import math
import re
import time

import numpy as np
import PySAM.BatteryTools as BatteryTools
import PySAM.Cashloan as Cashloan
import PySAM.Grid as Grid
import PySAM.Pvsamv1 as Pvsamv1
import PySAM.Utilityrate5 as Utilityrate5
from PySAM.PySSC import PySSC

from . import genset_finance, tariff_br
from .schemas import SimulationInput
from .weather import WeatherData

CONFIG = "PVBatteryResidential"
HOURS = 8760
CELLTECH = {"mono": 0, "multi": 1, "cdte": 2, "cis": 3, "amorfo": 5}
DISPATCH = {"peak_shaving": 0, "ponta": 3, "autoconsumo": 5}


class SimulationError(Exception):
    pass


# --------------------------------------------------------------------------- utilidades
def _fill_defaults(model, module):
    """Completa um modelo criado com ``from_existing`` usando os padrões do SAM,
    sem sobrescrever o que já foi calculado/definido pelos módulos anteriores."""
    for _group, values in module.default(CONFIG).export().items():
        for key, val in values.items():
            try:
                model.value(key)
            except Exception:
                model.value(key, val)
    return model


def _set_array(model, name: str, values: list[float]):
    """Grava um vetor diretamente na tabela de dados SSC (inclui variáveis de saída de outro módulo)."""
    PySSC().data_set_array(model.get_data_ptr(), name.encode(), values)


def parse_outages(text: str) -> np.ndarray:
    """'dd/mm hh:mm dur; ...' → vetor 0/1 de 8760 h."""
    out = np.zeros(HOURS, dtype=int)
    if not text:
        return out
    days_before = np.cumsum([0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30])
    for part in re.split(r"[;\n]+", text):
        part = part.strip()
        if not part:
            continue
        m = re.match(r"(\d{1,2})/(\d{1,2})\s+(\d{1,2})(?::(\d{2}))?\s+(\d+(?:[.,]\d+)?)", part)
        if not m:
            raise SimulationError(f"Evento de queda inválido: '{part}'. Use 'dd/mm hh:mm duração_h'.")
        d, mo, h = int(m.group(1)), int(m.group(2)), int(m.group(3))
        dur = int(math.ceil(float(m.group(5).replace(",", "."))))
        if not (1 <= mo <= 12 and 1 <= d <= 31 and 0 <= h <= 23):
            raise SimulationError(f"Data/hora inválida no evento '{part}'.")
        start = (days_before[mo - 1] + d - 1) * 24 + h
        out[start : min(HOURS, start + dur)] = 1
    return out


def validate_design(inp: SimulationInput, weather: WeatherData | None,
                    load_kw: np.ndarray | None = None) -> list[dict]:
    """Verificações elétricas de projeto (string × inversor × bateria)."""
    mod, arr, inv, bat = inp.modulo, inp.arranjo, inp.inversor, inp.bateria
    msgs = []
    tmin = float(np.nanmin(weather.tdry)) if weather is not None else 0.0
    tmin = min(tmin, 5.0)
    ns = arr.modulos_por_string
    kv = mod.coef_voc / 100.0
    voc_frio = ns * mod.voc * (1 + kv * (tmin - 25))
    vmp_quente = ns * mod.vmp * (1 + kv * (70 - 25))
    vmp_frio = ns * mod.vmp * (1 + kv * (tmin - 25))
    pdc = ns * arr.n_strings * mod.vmp * mod.imp / 1000.0
    pac = inv.potencia_ca_kw * inv.quantidade
    ratio = pdc / pac if pac else 0
    strings_por_mppt = math.ceil(arr.n_strings / (inv.n_mppt * inv.quantidade))
    i_mppt = strings_por_mppt * mod.isc

    def add(level, text):
        msgs.append({"nivel": level, "texto": text})

    if voc_frio > inv.vdc_max:
        add("erro", f"Voc da string a {tmin:.0f} °C = {voc_frio:.0f} V excede a tensão CC máxima do inversor "
                    f"({inv.vdc_max:.0f} V). Reduza módulos por string.")
    else:
        add("ok", f"Voc da string a {tmin:.0f} °C = {voc_frio:.0f} V (máx. {inv.vdc_max:.0f} V).")
    if vmp_quente < inv.mppt_min:
        add("alerta", f"Vmp da string com célula a 70 °C = {vmp_quente:.0f} V abaixo do MPPT mínimo "
                      f"({inv.mppt_min:.0f} V): perdas em dias quentes.")
    if vmp_frio > inv.mppt_max:
        add("alerta", f"Vmp da string no frio = {vmp_frio:.0f} V acima do MPPT máximo ({inv.mppt_max:.0f} V).")
    if inv.mppt_min <= vmp_quente and vmp_frio <= inv.mppt_max:
        add("ok", f"Faixa de Vmp da string {vmp_quente:.0f}–{vmp_frio:.0f} V dentro do MPPT "
                  f"({inv.mppt_min:.0f}–{inv.mppt_max:.0f} V).")
    if i_mppt > inv.corrente_max_mppt * 1.05:
        add("alerta", f"{strings_por_mppt} string(s) por MPPT → Isc {i_mppt:.1f} A acima de "
                      f"{inv.corrente_max_mppt:.1f} A (o inversor limitará a corrente).")
    if ratio > 1.5:
        add("alerta", f"Relação CC/CA = {ratio:.2f}: alto risco de perdas por clipping.")
    elif ratio < 0.8:
        add("alerta", f"Relação CC/CA = {ratio:.2f}: inversor subutilizado.")
    else:
        add("ok", f"Relação CC/CA = {ratio:.2f} ({pdc:.2f} kWp / {pac:.2f} kW).")
    if bat.habilitada:
        c_rate = bat.potencia_kw / bat.capacidade_kwh
        if bat.potencia_kw > pac * 1.05:
            add("alerta", f"Potência da bateria ({bat.potencia_kw:.1f} kW) maior que a potência CA do inversor "
                          f"({pac:.1f} kW): no híbrido a descarga fica limitada pelo inversor.")
        if c_rate > 1.0:
            add("alerta", f"Taxa C = {c_rate:.2f}: acima de 1C reduz a vida útil da maioria das baterias.")
        if bat.soc_min >= bat.soc_max:
            add("erro", "SOC mínimo deve ser menor que o SOC máximo.")
        if bat.quimica == "leadacid" and bat.soc_min < 40:
            add("alerta", "Chumbo-ácido com SOC mínimo < 40% (DoD > 60%) reduz muito a vida útil.")
    off = inp.operacao.modo == "off_grid"
    if off and not bat.habilitada:
        add("erro", "O modo off-grid exige bateria: o inversor híbrido precisa dela para formar a rede isolada.")
    if load_kw is not None and len(load_kw):
        pico = float(np.max(load_kw))
        if off and pac < pico:
            add("alerta", f"Pico de carga {pico:.1f} kW maior que a potência do inversor ({pac:.1f} kW): parte da "
                          "carga não será atendida pelo inversor.")
        if inp.gerador.habilitado and (off or inp.backup.simular_quedas):
            alvo = pico if off else pico * inp.backup.fracao_carga_critica / 100.0
            if inp.gerador.potencia_kw < alvo:
                add("alerta", f"Gerador de {inp.gerador.potencia_kw:.1f} kW menor que o pico a atender "
                              f"({alvo:.1f} kW).")
    if off and not inp.gerador.habilitado:
        add("alerta", "Off-grid sem gerador: a carga não atendida pela FV+bateria fica sem suprimento.")
    return msgs


# --------------------------------------------------------------------------- montagem do Pvsamv1
def build_pvsam(inp: SimulationInput, weather: WeatherData, load_kw: np.ndarray) -> Pvsamv1.Pvsamv1:
    m = Pvsamv1.default(CONFIG)
    N = inp.financeiro.anos_analise

    # Recurso solar
    wd = weather.to_sam()
    wd["lat"], wd["lon"] = inp.local.latitude, inp.local.longitude
    m.SolarResource.solar_resource_data = wd
    m.SolarResource.use_wf_albedo = 0
    m.SolarResource.albedo = [inp.local.albedo] * 12

    # Vida útil
    m.Lifetime.analysis_period = N
    m.Lifetime.system_use_lifetime_output = 1
    m.Lifetime.dc_degradation = [inp.arranjo.degradacao_anual]
    m.Lifetime.inflation_rate = inp.financeiro.inflacao

    # Módulo – modelo CEC com parâmetros do datasheet (6 parâmetros)
    md = inp.modulo
    m.Module.module_model = 2
    c = m.CECPerformanceModelWithUserEnteredSpecifications
    c.sixpar_celltech = CELLTECH[md.tecnologia]
    c.sixpar_vmp, c.sixpar_imp, c.sixpar_voc, c.sixpar_isc = md.vmp, md.imp, md.voc, md.isc
    c.sixpar_bvoc = md.coef_voc / 100.0 * md.voc
    c.sixpar_aisc = md.coef_isc / 100.0 * md.isc
    c.sixpar_gpmp = md.coef_pmax
    c.sixpar_nser = md.celulas_serie
    c.sixpar_area = md.area
    c.sixpar_tnoct = md.noct
    c.sixpar_standoff = 2 if md.montagem == "telhado" else 6
    c.sixpar_mounting = 0
    c.sixpar_is_bifacial = 0

    # Arranjo
    ar = inp.arranjo
    sd = m.SystemDesign
    sd.subarray1_modules_per_string = ar.modulos_por_string
    sd.subarray1_nstrings = ar.n_strings
    sd.subarray1_tilt = ar.inclinacao
    sd.subarray1_azimuth = ar.azimute
    sd.subarray1_track_mode = 0
    sd.subarray1_mppt_input = 1
    sd.inverter_count = inp.inversor.quantidade
    sd.system_capacity = ar.modulos_por_string * ar.n_strings * md.vmp * md.imp / 1000.0
    for k in (2, 3, 4):
        setattr(sd, f"subarray{k}_enable", 0)

    # Perdas
    ls = m.Losses
    ls.subarray1_soiling = [ar.sujeira] * 12
    ls.subarray1_dcwiring_loss = ar.perda_cabos_cc
    ls.subarray1_mismatch_loss = ar.perda_mismatch
    ls.acwiring_loss = ar.perda_cabos_ca
    ls.dcoptimizer_loss = 0
    ls.subarray1_rack_shading = 0
    sh = m.Shading
    if ar.sombreamento > 0:
        sh.subarray1_shading_en_mxh = 1
        sh.subarray1_shading_mxh = [[ar.sombreamento] * 24 for _ in range(12)]
        sh.subarray1_shading_en_diff = 1
        sh.subarray1_shading_diff = ar.sombreamento
    else:
        sh.subarray1_shading_en_mxh = 0
        sh.subarray1_shading_en_diff = 0
    m.AdjustmentFactors.adjust_constant = 100.0 - ar.disponibilidade

    # Inversor híbrido – modelo de datasheet
    iv = inp.inversor
    m.Inverter.inverter_model = 1
    ds = m.InverterDatasheet
    ds.inv_ds_paco = iv.potencia_ca_kw * 1000.0
    ds.inv_ds_eff = iv.eficiencia
    ds.inv_ds_pso = iv.consumo_operacao_w
    ds.inv_ds_pnt = iv.consumo_noturno_w
    ds.inv_ds_vdco = iv.vdc_nominal
    ds.inv_ds_vdcmax = iv.vdc_max
    m.Inverter.mppt_low_inverter = iv.mppt_min
    m.Inverter.mppt_hi_inverter = iv.mppt_max
    m.Inverter.inv_num_mppt = 1  # um subarranjo → uma entrada MPPT modelada

    # Carga
    m.Load.load = [float(x) for x in load_kw]
    m.Load.load_escalation = [0.0]
    bk = inp.backup
    if inp.operacao.modo == "off_grid":
        outage = np.ones(HOURS, dtype=int)
        crit_frac = 1.0
    else:
        outage = parse_outages(bk.quedas) if bk.simular_quedas else np.zeros(HOURS, dtype=int)
        crit_frac = bk.fracao_carga_critica / 100.0
    m.Load.grid_outage = [int(x) for x in outage]
    m.Load.crit_load = [float(x) * crit_frac for x in load_kw]
    m.Load.run_resiliency_calcs = 0

    # Limite de injeção
    dp = inp.despacho
    if dp.limite_injecao_kw > 0:
        m.GridLimits.enable_interconnection_limit = 1
        m.GridLimits.grid_interconnection_limit_kwac = dp.limite_injecao_kw
    else:
        m.GridLimits.enable_interconnection_limit = 0

    # Bateria
    b = inp.bateria
    bs = m.BatterySystem
    if b.habilitada:
        bs.en_batt = 1
        bs.batt_ac_or_dc = 0 if b.acoplamento == "cc" else 1
        BatteryTools.battery_model_change_chemistry(m, b.quimica)
        BatteryTools.battery_model_sizing(m, b.potencia_kw, b.capacidade_kwh, b.tensao_nominal_v)
        bs.batt_dc_dc_efficiency = b.eficiencia_cc_cc
        bs.batt_ac_dc_efficiency = b.eficiencia_ca_cc
        bs.batt_dc_ac_efficiency = b.eficiencia_cc_ca
        bc = m.BatteryCell
        bc.batt_minimum_SOC = b.soc_min
        bc.batt_maximum_SOC = b.soc_max
        bc.batt_initial_SOC = b.soc_inicial
        bc.batt_room_temperature_celsius = [b.temperatura_ambiente]
        if b.substituir_em > 0:
            bs.batt_replacement_option = 1
            bs.batt_replacement_capacity = b.substituir_em
        else:
            bs.batt_replacement_option = 0
        _set_dispatch(m, inp)
    else:
        bs.en_batt = 0
    return m


def _set_dispatch(m, inp: SimulationInput):
    dp, tf = inp.despacho, inp.tarifa
    bd = m.BatteryDispatch
    bd.batt_dispatch_choice = DISPATCH[dp.estrategia]
    bd.batt_dispatch_auto_can_charge = 1
    bd.batt_dispatch_auto_can_clipcharge = 1
    bd.batt_dispatch_auto_can_gridcharge = 1 if dp.carregar_pela_rede else 0
    bd.batt_dispatch_auto_btm_can_discharge_to_grid = 0
    bd.batt_dispatch_wf_forecast_choice = 0
    bd.batt_dispatch_load_forecast_choice = 0
    if dp.estrategia == "ponta":
        # Período 1: fora de ponta (carrega com FV e, se permitido, com a rede)
        # Período 2: ponta + intermediário (descarrega)
        # Período 3: fins de semana (autoconsumo: carrega e descarrega)
        g = 1 if dp.carregar_pela_rede else 0
        bd.dispatch_manual_charge = [1, 1, 1, 0, 0, 0]
        bd.dispatch_manual_discharge = [0, 1, 1, 0, 0, 0]
        bd.dispatch_manual_gridcharge = [g, 0, 0, 0, 0, 0]
        bd.dispatch_manual_btm_discharge_to_grid = [0, 0, 0, 0, 0, 0]
        bd.dispatch_manual_percent_discharge = [0, dp.descarga_na_ponta, 100, 0, 0, 0]
        bd.dispatch_manual_percent_gridcharge = [100 if g else 0, 0, 0, 0, 0, 0]
        row = []
        for h in range(24):
            rel = (h - tf.inicio_ponta) % 24
            row.append(2 if (rel < 3 or rel == 3 or rel == 23) else 1)
        bd.dispatch_manual_sched = [row[:] for _ in range(12)]
        bd.dispatch_manual_sched_weekend = [[3] * 24 for _ in range(12)]
        bd.dispatch_manual_system_charge_first = 0
        bd.batt_dispatch_charge_only_system_exceeds_load = 1
        bd.batt_dispatch_discharge_only_load_exceeds_system = 1


# --------------------------------------------------------------------------- execução
def _yearly(arr, N) -> np.ndarray:
    a = np.asarray(arr, float)
    if a.size == N * HOURS:
        return a.reshape(N, HOURS)
    if a.size == HOURS:
        return np.tile(a, (N, 1))
    if a.size == 0 or a.size == 1:
        return np.zeros((N, HOURS))
    raise SimulationError(f"Tamanho inesperado de série: {a.size}")


def _r(x, n=2):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    if math.isnan(x) or math.isinf(x):
        return None
    return round(x, n)


def run(inp: SimulationInput, weather: WeatherData, load_kw: np.ndarray) -> dict:
    t0 = time.time()
    msgs = validate_design(inp, weather, load_kw)
    if any(m["nivel"] == "erro" for m in msgs):
        return {"ok": False, "validacao": msgs, "erro": "O projeto tem erros de dimensionamento."}

    N = inp.financeiro.anos_analise
    off = inp.operacao.modo == "off_grid"
    fn = inp.financeiro
    m = build_pvsam(inp, weather, load_kw)
    try:
        m.execute()
    except Exception as e:  # noqa: BLE001
        raise SimulationError(f"Erro no Pvsamv1: {e}") from e
    out = m.Outputs

    g = _fill_defaults(Grid.from_existing(m), Grid)
    g.execute()

    u = _fill_defaults(Utilityrate5.from_existing(m), Utilityrate5)
    u.Lifetime.analysis_period = N
    u.execute()

    # ---------------- séries anuais (vida útil)
    batt_on = inp.bateria.habilitada
    zeros = np.zeros((N, HOURS))

    def Y(name):
        try:
            return _yearly(getattr(out, name), N)
        except Exception:  # noqa: BLE001
            return zeros

    load = np.asarray(load_kw, float)
    load_y = np.tile(load, (N, 1))
    outage = np.asarray(m.Load.grid_outage, float)
    if outage.size != HOURS:
        outage = np.zeros(HOURS)
    crit = load * (1.0 if off else inp.backup.fracao_carga_critica / 100.0)

    if batt_on:
        grid_to_load = Y("grid_to_load")
        imp = grid_to_load + Y("grid_to_batt")
        exp = Y("system_to_grid") + Y("batt_to_grid")
        unmet = Y("crit_load_unmet") * outage
    else:
        gen = Y("gen")
        net = load_y * (1 - outage) - gen
        imp = np.clip(net, 0, None)
        exp = np.clip(-net, 0, None) * (1 - outage)
        grid_to_load = imp
        unmet = np.tile(crit * outage, (N, 1))  # sem bateria o inversor não opera ilhado
    if off:
        imp = exp = grid_to_load = zeros

    # ---------------- gerador (pós-processamento)
    gs = genset_finance.dispatch(unmet, inp.gerador)
    servida = load_y * (1 - outage) + (crit * outage - gs["residual"])

    # ---------------- faturamento
    if off:
        z = [0.0] * N
        bills = {"fatura_com_sistema": z, "fatura_sem_sistema": z, "economia": z, "fio_b_pago": z,
                 "energia_compensada_kwh": z, "credito_final_kwh": z, "mensal_ano1": [], "percentual_fio_b": z}
    else:
        bills = tariff_br.annual_bills(imp, exp, load_y * (1 - outage), inp.tarifa)

    # ---------------- custos
    pdc = float(m.SystemDesign.system_capacity)
    bat_kwh = float(out.batt_bank_installed_capacity) if batt_on else 0.0
    capex_fv = pdc * fn.custo_fv_kwp
    capex_inv = fn.custo_inversor * inp.inversor.quantidade
    capex_bat = inp.bateria.capacidade_kwh * fn.custo_bateria_kwh if batt_on else 0.0
    capex_gen = inp.gerador.potencia_kw * inp.gerador.custo_kw if inp.gerador.habilitado else 0.0
    capex = capex_fv + capex_inv + capex_bat + capex_gen + fn.custo_fixo
    escal = (1 + fn.inflacao / 100.0) ** np.arange(N)  # convenção SAM: ano 1 sem correção
    custo_gerador = genset_finance.genset_costs_nominal(gs, inp.gerador, fn.inflacao)
    om_fixed = fn.om_fixo_ano * escal + custo_gerador
    if 0 < fn.ano_troca_inversor <= N:
        om_fixed[fn.ano_troca_inversor - 1] += capex_inv * escal[fn.ano_troca_inversor - 1]

    ref = genset_finance.diesel_only_reference(load_y, inp.gerador, fn.inflacao) if off else None

    # ---------------- Cashloan
    f = _fill_defaults(Cashloan.from_existing(m), Cashloan)
    fp = f.FinancialParameters
    fp.analysis_period = N
    fp.federal_tax_rate = [0.0]
    fp.state_tax_rate = [0.0]
    fp.property_tax_rate = 0.0
    fp.insurance_rate = 0.0
    fp.real_discount_rate = fn.taxa_desconto_real
    fp.inflation_rate = fn.inflacao
    fp.debt_fraction = fn.fracao_financiada
    fp.loan_rate = fn.juros_financiamento
    fp.loan_term = fn.prazo_financiamento
    fp.market = 0
    fp.mortgage = 0
    fp.salvage_percentage = 0.0
    fp.system_capacity = pdc
    for k, v in f.TaxCreditIncentives.export().items():
        if "percent" in k and "deprbas" not in k and "maxvalue" not in k:
            f.value(k, [0.0] if isinstance(v, (list, tuple)) else 0.0)
        if k.endswith("_amount") and isinstance(v, (list, tuple)):
            f.value(k, [0.0])
    for k, v in f.PaymentIncentives.export().items():
        if k.endswith("_amount") or k.endswith("_percent"):
            f.value(k, [0.0] if isinstance(v, (list, tuple)) else 0.0)
    sc = f.SystemCosts
    sc.total_installed_cost = capex
    sc.om_capacity = [fn.om_fv_kwp_ano]
    sc.om_capacity_escal = 0.0
    sc.om_fixed = [float(x) for x in om_fixed]  # vetor anual: o SAM não corrige pela inflação
    sc.om_fixed_escal = 0.0
    sc.om_production = [0.0]
    sc.om_batt_capacity_cost = [fn.om_bateria_kwh_ano if batt_on else 0.0]
    sc.om_batt_fixed_cost = [0.0]
    sc.om_batt_variable_cost = [0.0]
    sc.om_batt_replacement_cost = [fn.custo_reposicao_bateria_kwh if batt_on else 0.0]
    sc.om_batt_nameplate = bat_kwh
    sc.om_replacement_cost_escal = 0.0
    f.BatterySystem.battery_per_kWh = fn.custo_bateria_kwh
    f.LCOS.battery_total_cost_lcos = capex_bat
    f.ElectricityRates.rate_escalation = [0.0]
    valor = ref["custos_nominais"] if off else np.asarray(bills["economia"])
    f.SystemOutput.annual_energy_value = [0.0] + [float(x) for x in valor]
    # Contas (saídas do Utilityrate5 compartilhadas na mesma tabela de dados) → tarifa brasileira
    _set_array(f, "utility_bill_w_sys", [0.0] + [float(x) for x in bills["fatura_com_sistema"]])
    _set_array(f, "utility_bill_wo_sys", [0.0] + [float(x) for x in bills["fatura_sem_sistema"]])
    try:
        f.execute()
    except Exception as e:  # noqa: BLE001
        raise SimulationError(f"Erro no Cashloan: {e}") from e
    fo = f.Outputs

    # ---------------- custo presente líquido (termos reais)
    opex = np.asarray(fo.cf_operating_expenses, float)[1 : N + 1]
    custos_sis = opex + np.asarray(bills["fatura_com_sistema"], float)
    npc_sis = genset_finance.npc(capex, custos_sis, fn.taxa_desconto_real, fn.inflacao)
    servida_ano = servida.sum(axis=1)
    fin = {
        "npc_rs": npc_sis,
        "lcoe_atendimento_rs_kwh": genset_finance.levelized(npc_sis, servida_ano, fn.taxa_desconto_real),
    }
    if off:
        npc_ref = genset_finance.npc(ref["capex"], ref["custos_nominais"], fn.taxa_desconto_real, fn.inflacao)
        fluxos = [-(capex - ref["capex"])] + list(ref["custos_nominais"] - custos_sis)
        taxa_nom = (1 + fn.taxa_desconto_real / 100) * (1 + fn.inflacao / 100) - 1
        fin.update({
            "referencia": "só gerador a diesel",
            "ref_potencia_kw": ref["potencia_kw"],
            "ref_npc_rs": npc_ref,
            "ref_lcoe_rs_kwh": genset_finance.levelized(npc_ref, load_y.sum(axis=1), fn.taxa_desconto_real),
            "ref_litros_ano1": ref["litros_ano1"],
            "vpl_rs": npc_ref - npc_sis,
            "tir_pct": genset_finance.irr(fluxos),
            "payback_anos": genset_finance.payback(fluxos),
            "payback_descontado_anos": genset_finance.payback(fluxos, taxa_nom),
            "fluxos": fluxos,
        })
    else:
        npc_ref = genset_finance.npc(0.0, np.asarray(bills["fatura_sem_sistema"], float), fn.taxa_desconto_real,
                                     fn.inflacao)
        fin.update({"referencia": "sem sistema (só rede)", "ref_npc_rs": npc_ref,
                    "ref_lcoe_rs_kwh": genset_finance.levelized(npc_ref, (load_y * (1 - outage)).sum(axis=1),
                                                                fn.taxa_desconto_real)})

    ctx = {"gs": gs, "servida": servida, "crit": crit, "unmet": unmet, "fin": fin, "off": off,
           "custo_gerador": custo_gerador}
    return _collect(inp, weather, load_kw, m, out, fo, bills, imp, exp, grid_to_load, outage, capex,
                    {"fv": capex_fv, "inversor": capex_inv, "bateria": capex_bat, "gerador": capex_gen,
                     "fixo": fn.custo_fixo}, msgs, time.time() - t0, ctx)


def _collect(inp, weather, load_kw, m, out, fo, bills, imp, exp, grid_to_load, outage, capex, capex_parts,
             msgs, elapsed, ctx) -> dict:
    N = inp.financeiro.anos_analise
    batt_on = inp.bateria.habilitada

    def h1(name):
        try:
            a = np.asarray(getattr(out, name), float)
            return a[:HOURS] if a.size >= HOURS else np.zeros(HOURS)
        except Exception:  # noqa: BLE001
            return np.zeros(HOURS)

    load = np.asarray(load_kw, float)
    gen = h1("gen")
    if batt_on:
        pv_to_load, pv_to_batt, pv_to_grid = h1("system_to_load"), h1("system_to_batt"), h1("system_to_grid")
        batt_to_load, batt_to_grid = h1("batt_to_load"), h1("batt_to_grid")
        grid_to_batt = h1("grid_to_batt")
        soc = h1("batt_SOC")
        batt_power = h1("batt_power")
        pv_ac = pv_to_load + pv_to_batt + pv_to_grid
    else:
        pv_ac = gen
        pv_to_load = np.minimum(gen, load * (1 - outage))
        pv_to_grid = gen - pv_to_load
        pv_to_batt = batt_to_load = batt_to_grid = grid_to_batt = soc = batt_power = np.zeros(HOURS)
    g2l = grid_to_load[0]
    imp1, exp1 = imp[0], exp[0]
    off, gs, fin = ctx["off"], ctx["gs"], ctx["fin"]
    gerador1 = gs["energia"][0]
    residual1 = gs["residual"][0]
    servida1 = ctx["servida"][0]
    if off:
        # sem rede, o que o SAM contabiliza como injeção é energia FV desperdiçada (curtailment)
        curtail_h = pv_to_grid + batt_to_grid
        pv_to_grid = np.zeros(HOURS)
        batt_to_grid = np.zeros(HOURS)
    else:
        curtail_h = np.zeros(HOURS)
    curtail = float(curtail_h.sum())

    month = np.repeat(np.arange(12), [d * 24 for d in (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)])

    def monthly(a):
        return [round(float(v), 1) for v in np.bincount(month, weights=a, minlength=12)]

    carga_total = float(load.sum())
    pv_total = float(pv_ac.sum())
    autoconsumo = (pv_total - float(pv_to_grid.sum())) / pv_total * 100 if pv_total > 0 else 0.0
    renovavel = float(servida1.sum() - g2l.sum() - gerador1.sum())
    autossuf = renovavel / carga_total * 100 if carga_total > 0 else 0.0
    usable = inp.bateria.capacidade_kwh * (inp.bateria.soc_max - inp.bateria.soc_min) / 100.0 if batt_on else 0.0

    def outv(name, default=0.0):
        try:
            return getattr(out, name)
        except Exception:  # noqa: BLE001
            return default

    def fov(name, default=None):
        try:
            return getattr(fo, name)
        except Exception:  # noqa: BLE001
            return default

    annual_energy = [float(x) for x in _yearly(out.gen, N).sum(axis=1)]
    cap_pct = []
    replacements = []
    if batt_on:
        cp = _yearly(out.batt_capacity_percent, N)
        cap_pct = [round(float(x), 2) for x in cp.min(axis=1)]
        replacements = [int(round(x)) for x in list(outv("batt_bank_replacement", []))[: N + 1]]
    pdc = float(m.SystemDesign.system_capacity)

    kpis = {
        "potencia_fv_kwp": _r(pdc, 2),
        "potencia_inversor_kw": _r(inp.inversor.potencia_ca_kw * inp.inversor.quantidade, 2),
        "relacao_cc_ca": _r(pdc / (inp.inversor.potencia_ca_kw * inp.inversor.quantidade), 2),
        "bateria_kwh": _r(outv("batt_bank_installed_capacity") if batt_on else 0, 2),
        "geracao_fv_ano1_kwh": _r(pv_total, 0),
        "energia_entregue_ano1_kwh": _r(out.annual_energy, 0),
        "produtividade_kwh_kwp": _r(out.kwh_per_kw, 0),
        "performance_ratio": _r(out.performance_ratio, 3),
        "fator_capacidade_pct": _r(out.capacity_factor, 2),
        "consumo_anual_kwh": _r(carga_total, 0),
        "importado_rede_kwh": _r(imp1.sum(), 0),
        "exportado_rede_kwh": _r(exp1.sum(), 0),
        "autoconsumo_pct": _r(autoconsumo, 1),
        "autossuficiencia_pct": _r(autossuf, 1),
        "perda_clipping_pct": _r(outv("annual_ac_inv_clip_loss_percent"), 2),
        "perda_eficiencia_inversor_pct": _r(outv("annual_ac_inv_eff_loss_percent"), 2),
        "bateria_ciclos_equivalentes_ano1": _r(
            (batt_to_load.sum() + batt_to_grid.sum())
            / max(1e-9, inp.bateria.capacidade_kwh * (inp.bateria.soc_max - inp.bateria.soc_min) / 100.0)
            if batt_on else 0, 0),
        "bateria_eficiencia_ciclo_pct": _r(outv("average_battery_roundtrip_efficiency") if batt_on else None, 1),
        "bateria_descarga_ano1_kwh": _r(batt_to_load.sum() + batt_to_grid.sum(), 0),
        "bateria_substituicoes": int(sum(replacements)) if replacements else 0,
        "capex_rs": _r(capex, 0),
        "fatura_sem_sistema_ano1_rs": _r(bills["fatura_sem_sistema"][0], 0),
        "fatura_com_sistema_ano1_rs": _r(bills["fatura_com_sistema"][0], 0),
        "economia_ano1_rs": _r(bills["economia"][0], 0),
        "fio_b_ano1_rs": _r(bills["fio_b_pago"][0], 0),
        "vpl_rs": _r(fov("npv"), 0),
        "tir_pct": _r(fov("irr"), 2),
        "payback_anos": _r(fov("payback"), 1),
        "payback_descontado_anos": _r(fov("discounted_payback"), 1),
        "lcoe_real_rs_kwh": _r((fov("lcoe_real") or 0) / 100.0, 4),
        "lcoe_nominal_rs_kwh": _r((fov("lcoe_nom") or 0) / 100.0, 4),
        "lcos_real_rs_kwh": _r((fov("lcos_real") or 0) / 100.0, 4) if batt_on else None,
        "taxa_desconto_nominal_pct": _r(fov("nominal_discount_rate"), 2),
        # operação, gerador e custo presente líquido
        "modo": inp.operacao.modo,
        "energia_atendida_ano1_kwh": _r(servida1.sum(), 0),
        "atendimento_pct": _r(100 * servida1.sum() / carga_total if carga_total else 100, 2),
        "nao_atendida_ano1_kwh": _r(residual1.sum(), 1),
        "fracao_renovavel_pct": _r(100 * renovavel / servida1.sum() if servida1.sum() else 0, 1),
        "fv_nao_aproveitada_ano1_kwh": _r(curtail, 0),
        "autonomia_h": _r(usable / max(1e-9, load.mean()), 1),
        "gerador_energia_ano1_kwh": _r(gerador1.sum(), 0),
        "gerador_horas_ano1": _r(gs["horas"][0], 0),
        "gerador_litros_ano1": _r(gs["litros"][0], 0),
        "gerador_custo_ano1_rs": _r(ctx["custo_gerador"][0], 0),
        "gerador_substituicoes": int(gs["substituicoes"].sum()),
        "npc_rs": _r(fin["npc_rs"], 0),
        "lcoe_atendimento_rs_kwh": _r(fin["lcoe_atendimento_rs_kwh"], 4),
        "referencia": fin["referencia"],
        "ref_npc_rs": _r(fin["ref_npc_rs"], 0),
        "ref_lcoe_rs_kwh": _r(fin["ref_lcoe_rs_kwh"], 4),
        "ref_potencia_gerador_kw": _r(fin.get("ref_potencia_kw"), 1),
        "ref_litros_ano1": _r(fin.get("ref_litros_ano1"), 0),
    }
    if off:  # VPL/TIR/payback em relação ao cenário "só gerador"
        for key in ("vpl_rs", "tir_pct", "payback_anos", "payback_descontado_anos"):
            kpis[key] = _r(fin[key], 0 if key == "vpl_rs" else 2)

    backup = None
    if not off and inp.backup.simular_quedas and outage.sum() > 0:
        crit = ctx["crit"]
        unmet = residual1  # após o gerador (se houver)
        crit_out = float((crit * outage).sum())
        unmet_out = float((unmet * outage).sum())
        events = []
        start = None
        for i in range(HOURS + 1):
            on = i < HOURS and outage[i] > 0
            if on and start is None:
                start = i
            if not on and start is not None:
                sl = slice(start, i)
                events.append({
                    "inicio_hora": start,
                    "duracao_h": i - start,
                    "carga_critica_kwh": _r(crit[sl].sum(), 2),
                    "nao_atendida_kwh": _r(unmet[sl].sum(), 2),
                    "atendida_pct": _r(100 * (1 - unmet[sl].sum() / crit[sl].sum()) if crit[sl].sum() > 0 else 100, 1),
                    "soc_inicio_pct": _r(soc[start - 1] if start > 0 else soc[0], 1),
                })
                start = None
        backup = {
            "gerador_kwh": _r(float((gerador1 * outage).sum()), 2),
            "horas_queda": int(outage.sum()),
            "carga_critica_kwh": _r(crit_out, 2),
            "nao_atendida_kwh": _r(unmet_out, 2),
            "atendida_pct": _r(100 * (1 - unmet_out / crit_out) if crit_out > 0 else 100, 1),
            "eventos": events,
        }

    perdas = {
        "irradiacao_poa_nominal_kwh": _r(outv("annual_poa_nom"), 0),
        "sombreamento_pct": _r(outv("annual_poa_shading_loss_percent"), 2),
        "sujeira_pct": _r(outv("annual_poa_soiling_loss_percent"), 2),
        "reflexao_pct": _r(outv("annual_poa_cover_loss_percent"), 2),
        "cc_nominal_kwh": _r(outv("annual_dc_nominal"), 0),
        "modulo_temperatura_pct": _r(outv("annual_dc_module_loss_percent"), 2),
        "mppt_clipping_pct": _r(outv("annual_dc_mppt_clip_loss_percent"), 2),
        "mismatch_pct": _r(outv("annual_dc_mismatch_loss_percent"), 2),
        "diodos_pct": _r(outv("annual_dc_diodes_loss_percent"), 2),
        "cabos_cc_pct": _r(outv("annual_dc_wiring_loss_percent"), 2),
        "cc_liquida_kwh": _r(outv("annual_dc_net"), 0),
        "inversor_eficiencia_pct": _r(outv("annual_ac_inv_eff_loss_percent"), 2),
        "inversor_clipping_pct": _r(outv("annual_ac_inv_clip_loss_percent"), 2),
        "inversor_autoconsumo_pct": _r((outv("annual_ac_inv_pso_loss_percent") or 0)
                                       + (outv("annual_ac_inv_pnt_loss_percent") or 0), 2),
        "bateria_pct": _r((outv("annual_dc_battery_loss_percent") or 0)
                          + (outv("annual_ac_battery_loss_percent") or 0), 2),
        "cabos_ca_pct": _r(outv("annual_ac_wiring_loss_percent"), 2),
        "disponibilidade_pct": _r(outv("annual_ac_perf_adj_loss_percent"), 2),
        "ca_entregue_kwh": _r(out.annual_energy, 0),
    }

    def arr(name, n=2):
        v = fov(name)
        return [_r(x, n) for x in v] if v is not None else []

    fluxo = {
        "ano": list(range(N + 1)),
        "economia": [0.0] + [_r(x) for x in bills["economia"]],
        "fatura_sem": [0.0] + [_r(x) for x in bills["fatura_sem_sistema"]],
        "fatura_com": [0.0] + [_r(x) for x in bills["fatura_com_sistema"]],
        "fio_b": [0.0] + [_r(x) for x in bills["fio_b_pago"]],
        "percentual_fio_b": [None] + [_r(100 * x, 0) for x in bills["percentual_fio_b"]],
        "om": arr("cf_operating_expenses"),
        "reposicao_bateria": arr("cf_battery_replacement_cost"),
        "fluxo_caixa": arr("cf_after_tax_cash_flow"),
        "acumulado": arr("cf_cumulative_payback_with_expenses"),
        "acumulado_descontado": arr("cf_discounted_cumulative_payback"),
        "energia_entregue_kwh": [0.0] + [_r(x, 0) for x in annual_energy],
        "capacidade_bateria_pct": [None] + cap_pct if cap_pct else [],
        "substituicoes_bateria": replacements,
        "custo_gerador": [0.0] + [_r(x) for x in ctx["custo_gerador"]],
        "energia_atendida_kwh": [0.0] + [_r(x, 0) for x in ctx["servida"].sum(axis=1)],
        "nao_atendida_kwh": [0.0] + [_r(x, 1) for x in gs["residual"].sum(axis=1)],
    }
    if off:  # fluxo incremental em relação ao cenário "só gerador"
        fl = np.asarray(fin["fluxos"], float)
        taxa_nom = (1 + inp.financeiro.taxa_desconto_real / 100) * (1 + inp.financeiro.inflacao / 100) - 1
        fluxo["fluxo_caixa"] = [_r(x) for x in fl]
        fluxo["acumulado"] = [_r(x) for x in np.cumsum(fl)]
        fluxo["acumulado_descontado"] = [_r(x) for x in np.cumsum(fl / (1 + taxa_nom) ** np.arange(len(fl)))]

    horario = {
        "carga": load,
        "fv_ca": pv_ac,
        "fv_para_carga": pv_to_load,
        "fv_para_bateria": pv_to_batt,
        "fv_para_rede": pv_to_grid,
        "bateria_para_carga": batt_to_load,
        "bateria_para_rede": batt_to_grid,
        "rede_para_carga": g2l,
        "rede_para_bateria": grid_to_batt,
        "soc": soc,
        "potencia_bateria": batt_power,
        "clipping": h1("inv_cliploss"),
        "poa": h1("poa_front"),
        "temp_celula": h1("subarray1_celltemp"),
        "queda_rede": outage,
        "gerador": gerador1,
        "nao_atendida": residual1,
    }
    horario = {k: [round(float(x), 3) for x in v] for k, v in horario.items()}

    mensal = {
        "carga": monthly(load),
        "fv_ca": monthly(pv_ac),
        "fv_para_carga": monthly(pv_to_load),
        "fv_para_bateria": monthly(pv_to_batt),
        "fv_para_rede": monthly(pv_to_grid),
        "bateria_para_carga": monthly(batt_to_load),
        "rede_para_carga": monthly(g2l),
        "rede_para_bateria": monthly(grid_to_batt),
        "importado": monthly(imp1),
        "exportado": monthly(exp1),
        "gerador": monthly(gerador1),
        "nao_atendida": monthly(residual1),
        "fv_nao_aproveitada": monthly(curtail_h),
    }

    return {
        "ok": True,
        "tempo_s": round(elapsed, 2),
        "validacao": msgs,
        "kpis": kpis,
        "capex": {k: _r(v, 0) for k, v in capex_parts.items()},
        "perdas": perdas,
        "backup": backup,
        "tarifa_mensal_ano1": bills["mensal_ano1"],
        "fluxo": fluxo,
        "mensal": mensal,
        "horario": horario,
        "clima": weather.summary(),
    }
