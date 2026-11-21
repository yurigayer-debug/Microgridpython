"""Entradas da simulação.

Este módulo é a *fonte única* dos parâmetros: o frontend monta os formulários a
partir do JSON Schema gerado aqui (título, unidade, ajuda, limites e opções).
Cada campo indica, em ``sam``, a variável PySAM correspondente.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


def F(default, title: str, unit: str = "", help: str = "", sam: str = "", labels: dict | None = None, **kw):
    extra = {"unit": unit, "help": help, "sam": sam}
    if labels:
        extra["labels"] = labels
    return Field(default, title=title, json_schema_extra=extra, **kw)


class Local(BaseModel):
    latitude: float = F(-31.77, "Latitude", "°", "Negativa no hemisfério sul (Pelotas/RS = -31,77).",
                        "solar_resource_data.lat", ge=-90, le=90)
    longitude: float = F(-52.34, "Longitude", "°", "Negativa a oeste de Greenwich.", "solar_resource_data.lon",
                         ge=-180, le=180)
    albedo: float = F(0.2, "Albedo do solo", "", "Refletância do solo (grama ≈ 0,2; telhado claro ≈ 0,3).",
                      "albedo", ge=0, le=1)


class Operacao(BaseModel):
    modo: Literal["on_grid", "off_grid"] = F(
        "on_grid", "Modo de operação", "",
        "On-grid: conectado à rede (com compensação). Off-grid: sistema isolado – a rede fica indisponível o ano "
        "todo e toda a carga é crítica; a falta de energia é coberta pelo gerador, se houver.",
        "grid_outage / crit_load",
        labels={"on_grid": "On-grid (conectado à rede)", "off_grid": "Off-grid (isolado)"})
    confiabilidade_min: float = F(99.0, "Confiabilidade mínima (off-grid)", "%",
                                  "Fração mínima da carga atendida para a solução ser viável (otimização).",
                                  "", ge=0, le=100)


class Gerador(BaseModel):
    habilitado: bool = F(False, "Usar gerador a diesel (GMG)", "",
                         "Cobre a carga não atendida pela FV+bateria (off-grid ou quedas de rede). Modelado após a "
                         "simulação PySAM, como no microgrid_optimizer.m (não carrega a bateria).", "")
    potencia_kw: float = F(10.0, "Potência do gerador", "kW", "", "", gt=0)
    carga_minima: float = F(0.0, "Carga mínima de operação", "% da nominal",
                            "Abaixo disso o gerador opera no mínimo (excedente descartado).", "", ge=0, le=100)
    consumo_a: float = F(0.240, "Curva de consumo – coef. A", "L/kWh", "Combustível = A·E + B·P_nominal·h.", "",
                         ge=0)
    consumo_b: float = F(0.010, "Curva de consumo – coef. B", "L/(kW·h)", "", "", ge=0)
    custo_kw: float = F(1700.0, "Custo do gerador", "R$/kW", "", "", ge=0)
    om_hora: float = F(2.0, "O&M do gerador", "R$/h de operação", "", "", ge=0)
    vida_horas: float = F(30000.0, "Vida útil do gerador", "h", "", "", gt=0)
    preco_diesel: float = F(6.50, "Preço do diesel", "R$/L", "", "", ge=0)
    reajuste_diesel_real: float = F(0.0, "Aumento real do diesel", "%/ano", "Acima da inflação.", "", ge=-10, le=20)


class Modulo(BaseModel):
    vmp: float = F(41.96, "Vmp (STC)", "V", "Tensão de máxima potência do datasheet.", "sixpar_vmp", gt=0)
    imp: float = F(13.11, "Imp (STC)", "A", "Corrente de máxima potência.", "sixpar_imp", gt=0)
    voc: float = F(49.90, "Voc (STC)", "V", "Tensão de circuito aberto.", "sixpar_voc", gt=0)
    isc: float = F(13.98, "Isc (STC)", "A", "Corrente de curto-circuito.", "sixpar_isc", gt=0)
    coef_voc: float = F(-0.27, "Coef. temp. Voc", "%/°C", "", "sixpar_bvoc (convertido para V/°C)")
    coef_isc: float = F(0.048, "Coef. temp. Isc", "%/°C", "", "sixpar_aisc (convertido para A/°C)")
    coef_pmax: float = F(-0.35, "Coef. temp. Pmax", "%/°C", "", "sixpar_gpmp")
    celulas_serie: int = F(72, "Células em série", "", "Módulo half-cell de 144 células = 72 em série.",
                           "sixpar_nser", ge=1)
    area: float = F(2.58, "Área do módulo", "m²", "", "sixpar_area", gt=0)
    tecnologia: Literal["mono", "multi", "cdte", "cis", "amorfo"] = F(
        "mono", "Tecnologia", "", "", "sixpar_celltech",
        labels={"mono": "Silício monocristalino", "multi": "Silício policristalino", "cdte": "CdTe",
                "cis": "CIS/CIGS", "amorfo": "Silício amorfo"})
    noct: float = F(45.0, "NOCT", "°C", "Temperatura nominal de operação da célula.", "sixpar_tnoct")
    montagem: Literal["telhado", "solo"] = F(
        "telhado", "Montagem", "", "Afeta a temperatura do módulo.", "sixpar_standoff / sixpar_mounting",
        labels={"telhado": "Sobre telhado (afastado ~10 cm)", "solo": "Solo / estrutura aberta"})


class Arranjo(BaseModel):
    modulos_por_string: int = F(10, "Módulos por string", "", "Módulos em série.",
                                "subarray1_modules_per_string", ge=1, le=60)
    n_strings: int = F(1, "Número de strings", "", "Strings em paralelo.", "subarray1_nstrings", ge=1, le=200)
    inclinacao: float = F(30.0, "Inclinação", "°", "Ângulo com a horizontal (≈ latitude maximiza o ano).",
                          "subarray1_tilt", ge=0, le=90)
    azimute: float = F(0.0, "Azimute", "°", "Convenção SAM: 0 = Norte, 90 = Leste, 180 = Sul, 270 = Oeste. "
                       "No hemisfério sul o ideal é 0 (Norte).", "subarray1_azimuth", ge=0, lt=360)
    sujeira: float = F(2.0, "Perda por sujeira", "%", "", "subarray1_soiling", ge=0, le=50)
    sombreamento: float = F(0.0, "Perda por sombreamento", "%", "Perda média anual por sombras de obstáculos.",
                            "subarray1_shading_* (fator constante)", ge=0, le=80)
    perda_cabos_cc: float = F(2.0, "Perda nos cabos CC", "%", "", "subarray1_dcwiring_loss", ge=0, le=20)
    perda_mismatch: float = F(1.0, "Descasamento (mismatch)", "%", "", "subarray1_mismatch_loss", ge=0, le=20)
    perda_cabos_ca: float = F(1.0, "Perda nos cabos CA", "%", "", "acwiring_loss", ge=0, le=20)
    degradacao_anual: float = F(0.5, "Degradação anual dos módulos", "%/ano", "", "dc_degradation", ge=0, le=5)
    disponibilidade: float = F(99.0, "Disponibilidade do sistema", "%", "Desconta paradas para manutenção.",
                               "adjust_constant", ge=50, le=100)


class InversorHibrido(BaseModel):
    potencia_ca_kw: float = F(5.0, "Potência nominal CA", "kW", "Potência de saída CA do inversor híbrido.",
                              "inv_ds_paco", gt=0)
    eficiencia: float = F(97.6, "Eficiência máxima / europeia", "%", "", "inv_ds_eff", gt=50, le=100)
    vdc_nominal: float = F(360.0, "Tensão CC nominal", "V", "", "inv_ds_vdco", gt=0)
    vdc_max: float = F(550.0, "Tensão CC máxima", "V", "Voc da string no frio não pode passar deste valor.",
                       "inv_ds_vdcmax", gt=0)
    mppt_min: float = F(120.0, "Faixa MPPT – mínimo", "V", "", "mppt_low_inverter", gt=0)
    mppt_max: float = F(500.0, "Faixa MPPT – máximo", "V", "", "mppt_hi_inverter", gt=0)
    corrente_max_mppt: float = F(16.0, "Corrente máx. por MPPT", "A", "Usada apenas para validação.", "")
    n_mppt: int = F(2, "Número de MPPTs", "", "Usado na validação (strings ≤ MPPTs × entradas).", "", ge=1, le=12)
    consumo_operacao_w: float = F(40.0, "Autoconsumo em operação", "W", "Potência para o inversor começar a "
                                  "converter (Pso).", "inv_ds_pso", ge=0)
    consumo_noturno_w: float = F(10.0, "Consumo noturno / standby", "W", "", "inv_ds_pnt", ge=0)
    quantidade: int = F(1, "Quantidade de inversores", "", "", "inverter_count", ge=1, le=50)


class Bateria(BaseModel):
    habilitada: bool = F(True, "Usar bateria", "", "", "en_batt")
    acoplamento: Literal["cc", "ca"] = F(
        "cc", "Acoplamento", "", "CC = bateria no barramento CC do inversor híbrido (sem dupla conversão). "
        "CA = bateria com conversor próprio (retrofit).", "batt_ac_or_dc",
        labels={"cc": "CC – inversor híbrido", "ca": "CA – conversor separado"})
    quimica: Literal["lfpgraphite", "nmcgraphite", "leadacid", "lmolto"] = F(
        "lfpgraphite", "Química", "", "", "batt_chem + parâmetros de célula (BatteryTools)",
        labels={"lfpgraphite": "Lítio LFP (LiFePO4)", "nmcgraphite": "Lítio NMC",
                "leadacid": "Chumbo-ácido", "lmolto": "Lítio LMO/LTO"})
    capacidade_kwh: float = F(10.0, "Capacidade nominal", "kWh", "Energia nominal do banco (lado CC).",
                              "batt_computed_bank_capacity", gt=0)
    potencia_kw: float = F(5.0, "Potência máx. de carga/descarga", "kW", "Limitada pelo inversor híbrido.",
                           "batt_power_discharge_max_kwdc", gt=0)
    tensao_nominal_v: float = F(51.2, "Tensão nominal do banco", "V", "Baixa tensão (48/51,2 V) ou alta tensão.",
                                "batt_Vnom (via série de células)", gt=0)
    soc_min: float = F(10.0, "SOC mínimo", "%", "Profundidade de descarga = 100 − SOC mín.", "batt_minimum_SOC",
                       ge=0, le=90)
    soc_max: float = F(100.0, "SOC máximo", "%", "", "batt_maximum_SOC", ge=10, le=100)
    soc_inicial: float = F(50.0, "SOC inicial", "%", "", "batt_initial_SOC", ge=0, le=100)
    eficiencia_cc_cc: float = F(98.0, "Eficiência CC-CC (carregador)", "%", "Conversor CC-CC do híbrido.",
                                "batt_dc_dc_efficiency", gt=50, le=100)
    eficiencia_ca_cc: float = F(96.0, "Eficiência CA→CC", "%", "Somente acoplamento CA.", "batt_ac_dc_efficiency",
                                gt=50, le=100)
    eficiencia_cc_ca: float = F(96.0, "Eficiência CC→CA", "%", "Somente acoplamento CA.", "batt_dc_ac_efficiency",
                                gt=50, le=100)
    substituir_em: float = F(70.0, "Substituir quando a capacidade cair a", "%", "0 = nunca substituir.",
                             "batt_replacement_capacity", ge=0, le=100)
    temperatura_ambiente: float = F(25.0, "Temperatura do ambiente da bateria", "°C", "",
                                    "batt_room_temperature_celsius")


class Despacho(BaseModel):
    estrategia: Literal["autoconsumo", "ponta", "peak_shaving"] = F(
        "autoconsumo", "Estratégia de despacho", "",
        "Autoconsumo: carrega com excedente FV e descarrega quando falta. Ponta: guarda energia para o horário "
        "de ponta (tarifa branca). Peak shaving: reduz o pico de demanda da rede.", "batt_dispatch_choice",
        labels={"autoconsumo": "Autoconsumo (5 – SelfConsumption)", "ponta": "Horário de ponta (3 – Manual)",
                "peak_shaving": "Redução de pico (0 – PeakShaving)"})
    carregar_pela_rede: bool = F(False, "Permitir carregar pela rede", "", "Na estratégia de ponta, carrega fora "
                                 "da ponta com energia da rede.", "batt_dispatch_auto_can_gridcharge / "
                                 "dispatch_manual_gridcharge")
    descarga_na_ponta: float = F(100.0, "Descarga permitida na ponta", "%", "Estratégia de ponta.",
                                 "dispatch_manual_percent_discharge", ge=0, le=100)
    limite_injecao_kw: float = F(0.0, "Limite de injeção na rede", "kW", "0 = sem limite (zero grid → use 0,01).",
                                 "grid_interconnection_limit_kwac", ge=0)


class Backup(BaseModel):
    simular_quedas: bool = F(False, "Simular quedas de energia", "", "Usa a saída de backup (EPS) do inversor "
                             "híbrido para atender a carga crítica.", "grid_outage")
    fracao_carga_critica: float = F(50.0, "Carga crítica", "% da carga", "Parcela da carga ligada ao backup.",
                                    "crit_load", ge=0, le=100)
    quedas: str = F("15/06 18:00 4; 10/08 08:00 8", "Eventos de queda", "",
                    "Lista 'dd/mm hh:mm duração_h' separada por ';'.", "grid_outage")


class Tarifa(BaseModel):
    modalidade: Literal["convencional", "branca"] = F(
        "convencional", "Modalidade tarifária", "", "", "",
        labels={"convencional": "Convencional (B1/B2/B3)", "branca": "Tarifa Branca (ponta/intermediário/fora)"})
    regime: Literal["gd2", "gd1", "sem_compensacao"] = F(
        "gd2", "Regime de compensação", "",
        "GD II: Lei 14.300 (pagamento gradual do Fio B sobre a energia compensada). GD I: direito adquirido "
        "(protocolado até 07/01/2023, compensação integral até 2045). Sem compensação: excedente vendido pela "
        "tarifa de venda.", "",
        labels={"gd2": "GD II – Lei 14.300 (Fio B escalonado)", "gd1": "GD I – compensação integral até 2045",
                "sem_compensacao": "Sem compensação (venda do excedente)"})
    tipo_ligacao: Literal["mono", "bi", "tri"] = F(
        "bi", "Tipo de ligação", "", "Define o custo de disponibilidade (30/50/100 kWh).", "",
        labels={"mono": "Monofásica (30 kWh)", "bi": "Bifásica (50 kWh)", "tri": "Trifásica (100 kWh)"})
    tarifa_kwh: float = F(1.00, "Tarifa convencional (TE+TUSD c/ impostos)", "R$/kWh", "", "", ge=0)
    fio_b_kwh: float = F(0.28, "Componente Fio B (convencional)", "R$/kWh", "Parcela da TUSD Fio B com impostos.",
                         "", ge=0)
    tarifa_ponta: float = F(1.95, "Tarifa Branca – ponta", "R$/kWh", "", "", ge=0)
    tarifa_intermediaria: float = F(1.25, "Tarifa Branca – intermediário", "R$/kWh", "", "", ge=0)
    tarifa_fora_ponta: float = F(0.82, "Tarifa Branca – fora de ponta", "R$/kWh", "", "", ge=0)
    fio_b_ponta: float = F(0.75, "Fio B – ponta", "R$/kWh", "", "", ge=0)
    fio_b_intermediario: float = F(0.48, "Fio B – intermediário", "R$/kWh", "", "", ge=0)
    fio_b_fora_ponta: float = F(0.20, "Fio B – fora de ponta", "R$/kWh", "", "", ge=0)
    inicio_ponta: int = F(18, "Início do horário de ponta", "h", "Ponta de 3 h; intermediário 1 h antes e depois.",
                          "", ge=0, le=23)
    tarifa_venda: float = F(0.40, "Tarifa de venda do excedente", "R$/kWh", "Somente 'sem compensação'.", "",
                            ge=0)
    fio_b_pos_2029: float = F(100.0, "Fio B pago a partir de 2029", "%", "Lei 14.300: 15% (2023) → 90% (2028); "
                              "depois, conforme regra da ANEEL.", "", ge=0, le=100)
    reajuste_anual: float = F(5.0, "Reajuste tarifário anual (nominal)", "%/ano", "", "rate_escalation", ge=-5,
                              le=30)
    ano_inicio: int = F(2026, "Ano de início de operação", "", "Define o percentual de Fio B de cada ano.", "",
                        ge=2020, le=2060)


class Financeiro(BaseModel):
    anos_analise: int = F(25, "Horizonte de análise", "anos", "", "analysis_period", ge=1, le=40)
    custo_fv_kwp: float = F(2800.0, "Custo FV (módulos + estrutura + instalação)", "R$/kWp", "",
                            "total_installed_cost", ge=0)
    custo_inversor: float = F(9000.0, "Custo por inversor híbrido", "R$", "", "total_installed_cost", ge=0)
    custo_bateria_kwh: float = F(2500.0, "Custo da bateria", "R$/kWh", "", "total_installed_cost", ge=0)
    custo_fixo: float = F(3000.0, "Custos fixos (projeto, homologação, frete)", "R$", "", "total_installed_cost",
                          ge=0)
    om_fv_kwp_ano: float = F(30.0, "O&M FV", "R$/kWp/ano", "", "om_capacity", ge=0)
    om_bateria_kwh_ano: float = F(10.0, "O&M bateria", "R$/kWh/ano", "", "om_batt_capacity_cost", ge=0)
    om_fixo_ano: float = F(300.0, "O&M fixo", "R$/ano", "", "om_fixed", ge=0)
    custo_reposicao_bateria_kwh: float = F(1800.0, "Custo de reposição da bateria", "R$/kWh",
                                           "Valor de hoje; corrigido pela inflação.", "om_batt_replacement_cost",
                                           ge=0)
    ano_troca_inversor: int = F(12, "Ano de troca do inversor", "ano", "0 = não trocar.", "om_fixed (ano N)",
                                ge=0, le=40)
    taxa_desconto_real: float = F(8.0, "Taxa de desconto real", "%/ano", "", "real_discount_rate", ge=0, le=50)
    inflacao: float = F(4.5, "Inflação", "%/ano", "Corrige O&M e reposições.", "inflation_rate", ge=0, le=50)
    fracao_financiada: float = F(0.0, "Parcela financiada", "%", "", "debt_fraction", ge=0, le=100)
    juros_financiamento: float = F(12.0, "Juros do financiamento", "%/ano", "", "loan_rate", ge=0, le=100)
    prazo_financiamento: int = F(5, "Prazo do financiamento", "anos", "", "loan_term", ge=1, le=30)


class SimulationInput(BaseModel):
    weather_id: str = Field("", description="Identificador do clima carregado (/api/clima/*).")
    load_id: str = Field("", description="Identificador da carga carregada (/api/carga/*).")
    local: Local = Local()
    operacao: Operacao = Operacao()
    modulo: Modulo = Modulo()
    arranjo: Arranjo = Arranjo()
    inversor: InversorHibrido = InversorHibrido()
    bateria: Bateria = Bateria()
    despacho: Despacho = Despacho()
    backup: Backup = Backup()
    gerador: Gerador = Gerador()
    tarifa: Tarifa = Tarifa()
    financeiro: Financeiro = Financeiro()


GROUPS = [
    ("local", "Local", Local),
    ("operacao", "Operação", Operacao),
    ("modulo", "Módulo FV", Modulo),
    ("arranjo", "Arranjo FV", Arranjo),
    ("inversor", "Inversor híbrido", InversorHibrido),
    ("bateria", "Bateria", Bateria),
    ("despacho", "Despacho", Despacho),
    ("backup", "Backup", Backup),
    ("gerador", "Gerador", Gerador),
    ("tarifa", "Tarifa", Tarifa),
    ("financeiro", "Financeiro", Financeiro),
]


def form_schema() -> list[dict]:
    """Descrição simplificada dos campos para o frontend montar os formulários."""
    out = []
    for key, title, model in GROUPS:
        fields = []
        for name, f in model.model_fields.items():
            extra = f.json_schema_extra or {}
            ann = f.annotation
            if ann is bool:
                kind = "bool"
            elif getattr(ann, "__origin__", None) is Literal:
                kind = "select"
            elif ann is int:
                kind = "int"
            elif ann is str:
                kind = "text"
            else:
                kind = "float"
            item = {"name": name, "title": f.title, "type": kind, "default": f.default,
                    "unit": extra.get("unit", ""), "help": extra.get("help", ""), "sam": extra.get("sam", "")}
            if kind == "select":
                opts = list(ann.__args__)
                labels = extra.get("labels", {})
                item["options"] = [{"value": o, "label": labels.get(o, o)} for o in opts]
            for m in f.metadata:
                for attr in ("ge", "gt", "le", "lt"):
                    if hasattr(m, attr):
                        item[attr] = getattr(m, attr)
            fields.append(item)
        out.append({"key": key, "title": title, "fields": fields})
    return out
