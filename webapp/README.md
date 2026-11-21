# Simulador Híbrido PySAM

*(English summary below.)*

Aplicação web local para simular e dimensionar **inversores híbridos com bateria e painéis solares** usando o
[NREL PySAM](https://github.com/NREL/pysam) ([documentação](https://nrel-pysam.readthedocs.io/en/latest/)).
Inclui:
- faturamento pelas regras brasileiras (**Lei 14.300/2022**, Fio B escalonado, GD I/II, Tarifa Branca);
- operação **off-grid com gerador a diesel**;
- **otimização de dimensionamento** com comparação contra o `microgrid_optimizer.m` deste repositório.

| Fase | Conteúdo |
|---|---|
| F0–F1 | Cadeia `Pvsamv1 → Grid → Cashloan`, inversor híbrido (bateria acoplada em CC), validação elétrica |
| F2 | Clima: PVGIS, EPW/CSV, sintético e CSV do Octave · Carga: perfis EPE, CSV e CSV do Octave |
| F3 | Tarifas do Brasil: SCEE/Lei 14.300, Tarifa Branca, custo de disponibilidade, banco de créditos |
| F4 | Interface React + Vite + TypeScript com gráficos Plotly e exportações |
| F5 | Off-grid, backup em quedas de rede, gerador a diesel, custo presente líquido (NPC) |
| F6 | Otimização FV × bateria × gerador em paralelo, mapa de calor, comparação com o Octave |
| F7 | Docker, scripts de execução, testes automatizados, documentação |

## Como executar

### Opção 1 — local (Python + Node)

Requisitos: **Python 3.10+** e **Node.js 18+**, este último só para compilar a interface.

```bash
cd webapp
./run.sh            # Linux/macOS   (Windows: run.bat)
```

Na primeira vez, o script:
1. cria o ambiente `.venv` e instala as dependências Python;
2. compila a interface React (`frontend/dist`);
3. inicia o servidor em **http://127.0.0.1:8000**.

Outros comandos:
- `./run.sh dev`: modo desenvolvimento. A API recarrega sozinha a cada alteração e o Vite serve a interface em
  http://127.0.0.1:5173.
- `./run.sh test`: roda os testes (cerca de 1 min, pois executam o PySAM de verdade).

### Opção 2 — Docker (sem instalar Python nem Node)

```bash
cd webapp
docker compose up --build
```

Depois abra http://127.0.0.1:8000. A imagem é única e contém:
- a interface compilada;
- a API FastAPI e o PySAM;
- os CSVs do Octave.

Por padrão, a porta só aceita acesso local. Para expor o serviço na rede, troque `127.0.0.1:8000:8000` por
`8000:8000` no `docker-compose.yml`.

### Instalação manual

```bash
cd webapp
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
(cd frontend && npm ci && npm run build)
uvicorn app.main:app --port 8000
```

A documentação interativa da API fica em http://127.0.0.1:8000/docs.

## Uso

### Aba Simulação

1. **Recurso solar e carga**
   - Clima:
     - *Sintético* (offline, padrão Pelotas/RS);
     - *PVGIS* (internet);
     - *Arquivo* (EPW, CSV do SAM/NSRDB, CSV do PVGIS ou CSV com GHI);
     - *CSV do Octave*.
   - Carga:
     - *Sintética* (perfis EPE do Octave);
     - *Arquivo* (8760 h em kW);
     - *CSV do Octave*.
2. **Parâmetros**, organizados em abas: Local, Operação (on-grid/off-grid), Módulo FV, Arranjo FV, Inversor
   híbrido, Bateria, Despacho, Backup, Gerador, Tarifa e Financeiro. Passe o mouse sobre um campo para ver a
   variável PySAM correspondente.
   - **Validar dimensionamento** verifica: Voc no frio × tensão CC máxima, faixa de MPPT, corrente por MPPT,
     relação CC/CA, taxa C, pico de carga × inversor/gerador e a exigência de bateria no off-grid.
3. **Simular** (10 a 30 s para 25 anos × 8760 h). Os resultados trazem:
   - indicadores: VPL, TIR, payback, NPC, custo nivelado de atendimento, LCOE e LCOS do SAM, autoconsumo,
     autossuficiência, fração renovável, autonomia e gerador;
   - gráficos: operação horária por semana, SOC, balanço mensal, destino da FV (com o desperdício no off-grid),
     fatura, fluxo de caixa e capacidade da bateria;
   - tabelas: perdas, faturamento mensal e eventos de queda de rede;
   - exportações: dossiê `.txt`, série horária `.csv`, fluxo de caixa `.csv` e entradas `.json`.

### Aba Otimização

- Informe listas de **FV alvo (kWp)**, **bateria (kWh)** e **gerador (kW)**.
- Os demais parâmetros vêm da aba Simulação.
- Cada combinação roda a cadeia PySAM completa, em paralelo em todos os núcleos da CPU (no máximo 225).
- O kWp alvo vira módulos por string × strings dentro dos limites de tensão do inversor. A quantidade de
  inversores é ajustada pela relação CC/CA máxima, e a potência da bateria mantém a taxa C da configuração base.
- Critério de escolha: **maior VPL**, **menor custo nivelado de atendimento** ou **menor NPC**. No off-grid só
  são elegíveis as soluções com atendimento ≥ a confiabilidade mínima (aba Operação).
- Resultado: mapa de calor, tabela ordenada e o botão **Abrir na simulação**, que carrega a configuração na aba
  Simulação. Também é possível exportar em CSV.
- **Comparação com o Octave**:
  - lê `relatorio_completo_on_grid.csv` / `relatorio_completo_off_grid.csv` e cruza com as combinações iguais
    (o botão *Usar grade do Octave* preenche as listas do script);
  - o LCOE do Octave inclui compras da rede e combustível, então deve ser comparado com o **custo nivelado de
    atendimento** do PySAM;
  - as premissas precisam ser equivalentes para a comparação fazer sentido.

## Modelo de cálculo

```
Pvsamv1 (FV + inversor + bateria + despacho)  →  Grid  →  tarifa brasileira (Python)  →  Cashloan
          ↓ carga crítica não atendida
     gerador a diesel (pós-processamento)  →  custos no O&M  →  NPC / custo nivelado de atendimento
```

- **Inversor híbrido** = bateria **acoplada em CC** (`batt_ac_or_dc = 0`): fica no barramento CC do inversor e
  compartilha a conversão CC/CA. A opção CA representa uma bateria com conversor próprio, para comparação.
- **Tarifa** (`app/tariff_br.py`):
  - substitui as contas do `Utilityrate5`, que modela tarifas dos EUA e só é executado para preencher entradas
    exigidas pelo `Cashloan`;
  - GD II: Fio B de 15% (2023) até 90% (2028) e, a partir de 2029, o percentual configurado. A fatura é o maior
    valor entre o custo de disponibilidade e (consumo não compensado + Fio B);
  - GD I: compensação integral até 2045, sem abater abaixo do custo de disponibilidade;
  - Tarifa Branca: créditos convertidos entre postos pela razão tarifária;
  - sem compensação: excedente vendido pela tarifa de venda.
- **Off-grid**:
  - a rede fica indisponível as 8760 h (`grid_outage`) e toda a carga é crítica (`crit_load`);
  - a carga não atendida pela FV + bateria vai para o gerador;
  - o excedente que o SAM contabiliza como injeção é tratado como FV desperdiçada (curtailment);
  - VPL, TIR e payback são calculados em relação a um cenário **só com gerador a diesel**.
- **Gerador** (`app/genset_finance.py`):
  - mesma curva do Octave: `L/h = A·E + B·P_nominal`, com carga mínima opcional;
  - trocas por horas de uso;
  - combustível corrigido por inflação + aumento real;
  - não carrega a bateria (como no Octave).
- **NPC e custo nivelado de atendimento**, em termos reais: `NPC = CAPEX + Σ custos/(1+i)^t/(1+r)^t` e
  `custo = NPC / Σ energia atendida/(1+r)^t`. No on-grid, NPC da referência − NPC do sistema é igual ao VPL do
  `Cashloan`; um teste automatizado confere isso.
- Impostos e incentivos dos EUA são zerados no `Cashloan`. Informe as tarifas **com impostos**.

### Principais entradas → variáveis PySAM

| Grupo | Variáveis PySAM |
|---|---|
| Clima | `solar_resource_data` (GHI, DNI, DHI, temperatura, vento) |
| Módulo | `module_model=2`, `sixpar_*` (CEC 6 parâmetros a partir do datasheet) |
| Arranjo | `subarray1_*` (strings, inclinação, azimute 0 = Norte, perdas), `acwiring_loss`, `dc_degradation` |
| Inversor | `inverter_model=1`, `inv_ds_*`, `mppt_low/hi_inverter`, `inverter_count` |
| Bateria | `batt_chem`, `BatteryTools.battery_model_sizing`, `batt_*_SOC`, `batt_*_efficiency`, `batt_replacement_*` |
| Despacho | `batt_dispatch_choice` = 5 (autoconsumo), 3 (ponta/manual), 0 (peak shaving); `dispatch_manual_*` |
| Backup / off-grid | `grid_outage`, `crit_load` → saída `crit_load_unmet` |
| Financeiro | `total_installed_cost`, `om_*`, `real_discount_rate`, `inflation_rate`, `loan_*` |

### Principais saídas

- **Hora a hora**:
  - fluxos: `gen`, `system_to_load`, `system_to_batt`, `system_to_grid`, `batt_to_load`, `grid_to_load`;
  - bateria: `batt_SOC`, `batt_capacity_percent`;
  - inversor e backup: `inv_cliploss`, `crit_load_unmet`.
- **Totais anuais**: `annual_energy`, `kwh_per_kw`, `performance_ratio`, perdas `annual_*_loss_percent`,
  `average_battery_roundtrip_efficiency`, `batt_bank_replacement`.
- **Financeiras** (`Cashloan`): `npv`, `irr`, `payback`, `discounted_payback`, `lcoe_real`, `lcos_real` e o
  fluxo de caixa `cf_*`.

## Simplificações conhecidas

- Faturamento:
  - créditos sem validade (a lei prevê 60 meses);
  - bandeiras tarifárias não modeladas;
  - feriados não considerados na Tarifa Branca.
- Arranjo: um único subarranjo modelado (uma entrada MPPT no SAM). O número de MPPTs do inversor entra apenas
  na validação.
- O gerador é despachado depois da simulação PySAM e não recarrega a bateria.
- Clima sintético e CSV do Octave: só GHI, com DNI/DHI estimados por Erbs e saneados pela posição solar.
- Valores padrão de tarifa e custos são **ilustrativos**: use os da sua distribuidora e orçamentos reais.

## Estrutura

```
webapp/
  app/main.py            API FastAPI (+ serve a interface compilada)
  app/engine.py          cadeia PySAM, validação, KPIs
  app/tariff_br.py       faturamento SCEE (Lei 14.300, GD I/II, Tarifa Branca)
  app/genset_finance.py  gerador a diesel, NPC, TIR, payback
  app/optimizer.py       otimização em paralelo + leitura dos CSVs do Octave
  app/weather.py         PVGIS, arquivos de clima, clima sintético, Erbs
  app/load_profiles.py   perfis de carga
  app/schemas.py         entradas (fonte única dos formulários)
  app/report.py          dossiê .txt e CSVs
  frontend/              React + Vite + TypeScript (src/components/*)
  tests/                 pytest (tarifa, gerador, motor, API, otimização)
  Dockerfile, docker-compose.yml, run.sh, run.bat
```

---

## English summary

Local web app that simulates **hybrid inverters with batteries and PV**. It runs NREL PySAM
(`Pvsamv1 → Grid → Cashloan`) with Brazilian net-metering billing (Law 14.300), off-grid operation with a
diesel genset, and a parallel PV × battery × genset sizing optimizer that compares its results with this
repository's Octave tool.

To run it, use `cd webapp && ./run.sh`, which needs Python 3.10+ and Node 18+, or `docker compose up --build`.
Then open http://127.0.0.1:8000.
