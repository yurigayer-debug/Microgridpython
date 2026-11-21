# Simulador Híbrido PySAM (aplicação web local)

Aplicação web para simular **inversores híbridos com bateria e painéis solares** usando o
[NREL PySAM](https://github.com/NREL/pysam) ([documentação](https://nrel-pysam.readthedocs.io/en/latest/)),
com faturamento de energia pelas regras brasileiras (**Lei 14.300/2022**, Fio B escalonado, Tarifa Branca).

Complementa o `microgrid_optimizer.m` deste repositório: em vez do balanço energético simplificado do Octave,
usa os modelos físicos detalhados do SAM. O SAM modela o módulo, a temperatura de célula, o inversor, a química
e o desgaste da bateria, o despacho e a degradação ao longo da vida útil.

## Como executar (local)

Requer Python 3.10 ou mais recente.

```bash
cd webapp
./run.sh            # Linux/macOS  (Windows: run.bat)
```

Na primeira execução é criado um ambiente virtual `.venv` com as dependências.
Depois, abra **http://127.0.0.1:8000** no navegador.

Instalação manual:

```bash
cd webapp
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000
```

Testes: `python -m pytest -q` (executam o PySAM de verdade; levam cerca de 40 s).

## Fluxo de uso

1. **Recurso solar e carga**
   - **Clima** (8760 h):
     - *Sintético* (offline): parte das médias mensais de GHI; o padrão é Pelotas/RS.
     - *PVGIS*: TMY baixado pela latitude/longitude; requer internet.
     - *Arquivo*: EPW, CSV do SAM/NSRDB, CSV do PVGIS ou CSV simples com GHI.
     - *CSV do Octave*: o arquivo `perfil_carga_e_solar.csv` deste repositório.
   - **Carga**:
     - *Sintética*: perfis EPE, iguais aos do script Octave.
     - *Arquivo*: CSV com 8760 valores horários em kW.
     - *CSV do Octave*: o mesmo `perfil_carga_e_solar.csv`.
2. **Parâmetros**, organizados em abas: Local, Módulo FV, Arranjo FV, Inversor híbrido, Bateria, Despacho,
   Backup, Tarifa e Financeiro. Passe o mouse sobre um campo para ver a variável PySAM correspondente.
   O botão **Validar dimensionamento** verifica:
   - Voc da string no frio × tensão CC máxima;
   - faixa de MPPT;
   - corrente por MPPT;
   - relação CC/CA;
   - potência e taxa C da bateria.
3. **Simular**: cerca de 10 a 15 s para 25 anos × 8760 h.
4. **Resultados**:
   - indicadores: VPL, TIR, payback, LCOE, LCOS, autoconsumo e autossuficiência;
   - gráficos: operação horária por semana, SOC, balanço mensal, destino da geração FV, fatura mensal, fluxo
     de caixa e capacidade da bateria por ano;
   - tabela de perdas, faturamento mensal (créditos e Fio B) e eventos de queda de rede;
   - exportação: dossiê `.txt`, série horária `.csv`, fluxo de caixa `.csv` e entradas `.json`.

## Cadeia de modelos

```
Pvsamv1 (PVBatteryResidential)  →  Grid  →  [tarifa brasileira em Python]  →  Cashloan
 FV + inversor + bateria + despacho     limites      SCEE / Lei 14.300             VPL, TIR, LCOE, LCOS
```

- **Inversor híbrido** = bateria **acoplada em CC** (`batt_ac_or_dc = 0`). A bateria fica no barramento CC do
  inversor e compartilha a conversão CC/CA. A opção CA (`= 1`) representa uma bateria com conversor próprio,
  para comparação.
- O `Utilityrate5` (tarifas dos EUA) é executado apenas para preencher entradas exigidas pelo `Cashloan`.
  As contas com e sem sistema são substituídas pelo cálculo de `app/tariff_br.py`.
- Impostos e incentivos dos EUA são zerados no `Cashloan`. As tarifas devem ser informadas **com impostos**.

### Principais entradas → variáveis PySAM

| Grupo | Campos | Variáveis PySAM |
|---|---|---|
| Clima | GHI, DNI, DHI, temperatura, vento | `solar_resource_data` |
| Módulo | Vmp, Imp, Voc, Isc, coeficientes, células, área | `module_model=2`, `sixpar_*` (CEC 6 parâmetros) |
| Arranjo | módulos/string, strings, inclinação, azimute (0 = Norte), perdas | `subarray1_*`, `acwiring_loss`, `dc_degradation` |
| Inversor | Paco, eficiência, Vdc nominal/máx., MPPT, Pso/Pnt | `inverter_model=1`, `inv_ds_*`, `mppt_*_inverter` |
| Bateria | química, kWh, kW, V, SOC mín./máx., eficiências, troca | `batt_chem`, `BatteryTools.battery_model_sizing`, `batt_*_SOC`, `batt_replacement_*` |
| Despacho | autoconsumo, ponta (manual), peak shaving | `batt_dispatch_choice` = 5 / 3 / 0, `dispatch_manual_*` |
| Backup | quedas de rede, fração de carga crítica | `grid_outage`, `crit_load` |
| Financeiro | custos, O&M, troca do inversor, taxas | `total_installed_cost`, `om_*`, `real_discount_rate`, `inflation_rate`, `loan_*` |

### Principais saídas

- **Hora a hora** (`Pvsamv1`):
  - fluxos: `gen`, `system_to_load`, `system_to_batt`, `system_to_grid`, `batt_to_load`, `grid_to_load`,
    `grid_to_batt`;
  - bateria: `batt_SOC`, `batt_power`, `batt_capacity_percent`;
  - inversor e arranjo: `inv_cliploss`, `poa_front`, `subarray1_celltemp`;
  - backup: `crit_load_unmet`.
- **Totais anuais**: `annual_energy`, `kwh_per_kw`, `performance_ratio`, perdas `annual_*_loss_percent`,
  `average_battery_roundtrip_efficiency`, `batt_bank_replacement`.
- **Financeiras** (`Cashloan`): `npv`, `irr`, `payback`, `discounted_payback`, `lcoe_real`, `lcoe_nom`,
  `lcos_real` e o fluxo de caixa (`cf_*`).

## Simplificações conhecidas

- Faturamento:
  - créditos sem validade (a lei prevê 60 meses);
  - bandeiras tarifárias não modeladas;
  - feriados não considerados na Tarifa Branca;
  - em GD II, a fatura é o maior valor entre o custo de disponibilidade e (consumo não compensado + Fio B).
- Arranjo: um único subarranjo modelado (uma entrada MPPT no SAM). O número de MPPTs do inversor entra
  apenas na validação.
- Off-grid e gerador a diesel ainda não implementados (fases F5 e F6 do plano). As quedas de rede usam a
  saída de backup do inversor híbrido.
- Os valores padrão de tarifa e custos são **ilustrativos**. Use os da sua distribuidora e os orçamentos reais.

## Estrutura

```
webapp/
  app/main.py          API FastAPI e arquivos estáticos
  app/engine.py        montagem e execução da cadeia PySAM, KPIs, validação
  app/tariff_br.py     faturamento SCEE (Lei 14.300, GD I/II, Tarifa Branca)
  app/weather.py       PVGIS, arquivos de clima, clima sintético, decomposição Erbs
  app/load_profiles.py perfis de carga (EPE, arquivo)
  app/schemas.py       entradas (fonte única dos formulários)
  app/report.py        dossiê .txt e CSVs
  app/static/          interface (HTML/CSS/JS + Plotly local)
  tests/               testes (pytest)
```
