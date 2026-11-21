import { useMemo, useState } from "react";
import { brl, MESES, nf, type Resultado } from "../api";
import { useTheme } from "../theme";
import { baseLayout, Plot, type Trace } from "./Plot";

function Tile({ label, value, unit = "", sub = "", tone = "" }:
  { label: string; value: string; unit?: string; sub?: string; tone?: "" | "pos" | "neg" }) {
  return (
    <div className={`tile ${tone}`}>
      <div className="lbl">{label}</div>
      <div className="val">{value}{unit && <small>{unit}</small>}</div>
      {sub && <div className="sub2">{sub}</div>}
    </div>
  );
}

const num = (v: unknown) => (typeof v === "number" ? v : null);

function hoursToDates(a: number, b: number) {
  const base = Date.UTC(2019, 0, 1);
  const xs: string[] = [];
  for (let i = a; i < b; i++) xs.push(new Date(base + i * 3600000).toISOString().slice(0, 16).replace("T", " "));
  return xs;
}

function fmtHora(h: number) {
  const d = new Date(Date.UTC(2019, 0, 1) + h * 3600000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:00`;
}

export function Results({ r }: { r: Resultado }) {
  const { colors: c } = useTheme();
  const k = r.kpis;
  const off = k.modo === "off_grid";
  const temGerador = (num(k.gerador_energia_ano1_kwh) ?? 0) > 0;
  const [semana, setSemana] = useState("2019-06-15");

  const op = useMemo(() => {
    const h = r.horario;
    let h0 = Math.round((new Date(semana + "T00:00:00Z").getTime() - Date.UTC(2019, 0, 1)) / 3600000);
    h0 = Math.max(0, Math.min(8760 - 168, Number.isNaN(h0) ? 0 : h0));
    const a = h0, b = h0 + 168, x = hoursToDates(a, b);
    const sl = (key: string) => (h[key] || []).slice(a, b);
    const area = (key: string, name: string, color: string): Trace => ({
      type: "scatter", mode: "lines", stackgroup: "carga", x, y: sl(key), name,
      line: { width: 0.5, color: c.surface, shape: "hv" }, fillcolor: color,
      hovertemplate: `${name}: %{y:.2f} kW<extra></extra>`,
    });
    const traces: Trace[] = [
      area("fv_para_carga", "FV → carga", c.fv),
      area("bateria_para_carga", "Bateria → carga", c.bat),
    ];
    if (!off) traces.push(area("rede_para_carga", "Rede → carga", c.rede));
    if (temGerador) traces.push(area("gerador", "Gerador → carga", c.gerador));
    traces.push(
      { type: "scatter", mode: "lines", x, y: sl("carga"), name: "Carga", line: { color: c.text, width: 2, shape: "hv" },
        hovertemplate: "Carga: %{y:.2f} kW<extra></extra>" },
      { type: "scatter", mode: "lines", x, y: sl("fv_ca"), name: "Geração FV total",
        line: { color: c.fv, width: 2, dash: "dot", shape: "hv" }, hovertemplate: "FV total: %{y:.2f} kW<extra></extra>" },
    );
    if (!off) traces.push({ type: "scatter", mode: "lines", x, y: sl("fv_para_rede").map((v) => -v),
      name: "Injeção na rede (−)", line: { color: c.exp, width: 2, shape: "hv" },
      hovertemplate: "Injeção: %{y:.2f} kW<extra></extra>" });
    const outs = sl("queda_rede");
    const shapes = off ? [] : outs.flatMap((v, i) => v > 0 ? [{ type: "rect", xref: "x", yref: "paper", x0: x[i],
      x1: x[Math.min(i + 1, x.length - 1)], y0: 0, y1: 1, fillcolor: c.critical, opacity: 0.12, line: { width: 0 } }] : []);
    return {
      main: { data: traces, layout: baseLayout(c, { hovermode: "x unified", shapes,
        yaxis: { title: { text: "kW" }, zeroline: true, zerolinecolor: c.muted }, xaxis: { type: "date" } }) },
      soc: { data: [{ type: "scatter", mode: "lines", x, y: sl("soc"), name: "SOC", line: { color: c.bat, width: 2 },
        fill: "tozeroy", fillcolor: c.bat + "22", hovertemplate: "SOC: %{y:.1f} %<extra></extra>" }],
        layout: baseLayout(c, { hovermode: "x unified", showlegend: false, shapes, margin: { l: 60, r: 14, t: 6, b: 30 },
          yaxis: { title: { text: "SOC %" }, range: [0, 100] }, xaxis: { type: "date" } }) },
    };
  }, [r, semana, c, off, temGerador]);

  const mensal = useMemo(() => {
    const m = r.mensal;
    const bar = (y: number[], name: string, color: string): Trace => ({ type: "bar", x: MESES, y, name,
      marker: { color, line: { color: c.surface, width: 1 } }, hovertemplate: `${name}: %{y:,.0f} kWh<extra></extra>` });
    const origem = [bar(m.fv_para_carga, "FV → carga", c.fv), bar(m.bateria_para_carga, "Bateria → carga", c.bat)];
    if (!off) origem.push(bar(m.rede_para_carga, "Rede → carga", c.rede));
    if (temGerador) origem.push(bar(m.gerador, "Gerador → carga", c.gerador));
    const destino = [bar(m.fv_para_carga, "Consumo direto", c.fv), bar(m.fv_para_bateria, "Carga da bateria", c.bat)];
    if (!off) destino.push(bar(m.fv_para_rede, "Injeção na rede", c.exp));
    else destino.push(bar(m.fv_nao_aproveitada, "Não aproveitada (curtailment)", c.neutral));
    const lay = baseLayout(c, { barmode: "stack", bargap: 0.3, hovermode: "x unified", yaxis: { title: { text: "kWh" } } });
    return { origem, destino, lay };
  }, [r, c, off, temGerador]);

  const fatura = useMemo(() => {
    const t = r.tarifa_mensal_ano1;
    return {
      data: [
        { type: "bar", x: MESES, y: t.map((v) => v.fatura_sem_sistema_rs), name: "Sem sistema", marker: { color: c.neutral },
          hovertemplate: "Sem sistema: R$ %{y:,.2f}<extra></extra>" },
        { type: "bar", x: MESES, y: t.map((v) => v.fatura_com_sistema_rs), name: "Com sistema", marker: { color: c.rede },
          hovertemplate: "Com sistema: R$ %{y:,.2f}<extra></extra>" },
      ],
      layout: baseLayout(c, { barmode: "group", bargap: 0.3, bargroupgap: 0.08, hovermode: "x unified",
        yaxis: { title: { text: "R$" } } }),
    };
  }, [r, c]);

  const caixa = useMemo(() => {
    const f = r.fluxo;
    const fl = f.fluxo_caixa as number[];
    return {
      data: [
        { type: "bar", x: f.ano, y: fl, name: "Fluxo anual", marker: { color: fl.map((v) => (v >= 0 ? c.rede : c.exp)) },
          hovertemplate: "Ano %{x}: R$ %{y:,.0f}<extra>Fluxo anual</extra>" },
        { type: "scatter", mode: "lines+markers", x: f.ano, y: f.acumulado, name: "Acumulado",
          line: { color: c.text, width: 2 }, marker: { size: 6 }, hovertemplate: "Ano %{x}: R$ %{y:,.0f}<extra>Acumulado</extra>" },
        { type: "scatter", mode: "lines", x: f.ano, y: f.acumulado_descontado, name: "Acumulado descontado",
          line: { color: c.neutral, width: 2, dash: "dash" }, hovertemplate: "Ano %{x}: R$ %{y:,.0f}<extra>Descontado</extra>" },
      ],
      layout: baseLayout(c, { hovermode: "x unified", legend: { orientation: "h", y: -0.3, font: { color: c.text2 } },
        yaxis: { title: { text: "R$" }, zeroline: true, zerolinecolor: c.muted }, xaxis: { title: { text: "ano" } } }),
    };
  }, [r, c]);

  const bateria = useMemo(() => {
    const f = r.fluxo;
    const cap = f.capacidade_bateria_pct || [];
    if (!cap.length) return null;
    const repl = (f.substituicoes_bateria || []).map((v, i) => ((v ?? 0) > 0 ? i : null)).filter((v) => v !== null);
    return {
      data: [{ type: "scatter", mode: "lines+markers", x: f.ano.slice(1), y: cap.slice(1), name: "Capacidade mínima no ano",
        line: { color: c.bat, width: 2 }, marker: { size: 6 }, hovertemplate: "Ano %{x}: %{y:.1f} %<extra></extra>" }],
      layout: baseLayout(c, { showlegend: false, yaxis: { title: { text: "% da capacidade nominal" }, range: [0, 105] },
        xaxis: { title: { text: "ano" } },
        annotations: repl.map((y) => ({ x: y, y: 100, text: "troca", showarrow: true, arrowhead: 0, ay: -20,
          font: { color: c.text2, size: 11 } })) }),
    };
  }, [r, c]);

  const p = r.perdas;
  const perdas: [string, string][] = [
    ["Irradiação no plano (nominal)", nf(p.irradiacao_poa_nominal_kwh) + " kWh"],
    ["Sombreamento", nf(p.sombreamento_pct, 2) + " %"],
    ["Sujeira", nf(p.sujeira_pct, 2) + " %"],
    ["Reflexão (ângulo de incidência)", nf(p.reflexao_pct, 2) + " %"],
    ["Energia CC nominal", nf(p.cc_nominal_kwh) + " kWh"],
    ["Módulo (temperatura/irradiância)", nf(p.modulo_temperatura_pct, 2) + " %"],
    ["Limite MPPT", nf(p.mppt_clipping_pct, 2) + " %"],
    ["Descasamento + diodos", nf((p.mismatch_pct ?? 0) + (p.diodos_pct ?? 0), 2) + " %"],
    ["Cabos CC", nf(p.cabos_cc_pct, 2) + " %"],
    ["Energia CC líquida", nf(p.cc_liquida_kwh) + " kWh"],
    ["Inversor – eficiência", nf(p.inversor_eficiencia_pct, 2) + " %"],
    ["Inversor – clipping", nf(p.inversor_clipping_pct, 2) + " %"],
    ["Inversor – autoconsumo", nf(p.inversor_autoconsumo_pct, 2) + " %"],
    ["Bateria (conversão/perdas)", nf(p.bateria_pct, 2) + " %"],
    ["Cabos CA", nf(p.cabos_ca_pct, 2) + " %"],
    ["Indisponibilidade", nf(p.disponibilidade_pct, 2) + " %"],
    ["Energia CA entregue (líquida da bateria)", nf(p.ca_entregue_kwh) + " kWh"],
  ];

  const vpl = num(k.vpl_rs);
  const ref = off ? "vs. só gerador a diesel" : "vs. sem sistema";

  return (
    <section className="card">
      <div className="row-between">
        <h2><span className="step">3</span> Resultados <span className="badge">{off ? "off-grid" : "on-grid"}</span></h2>
        <div className="actions">
          <a href={`/api/resultado/${r.id}/dossie.txt`}><button className="ghost">Dossiê (.txt)</button></a>
          <a href={`/api/resultado/${r.id}/horario.csv`}><button className="ghost">Série horária (.csv)</button></a>
          <a href={`/api/resultado/${r.id}/fluxo_caixa.csv`}><button className="ghost">Fluxo de caixa (.csv)</button></a>
          <a href={`/api/resultado/${r.id}/entradas.json`}><button className="ghost">Entradas (.json)</button></a>
        </div>
      </div>

      <h3 className="section-label">Economia</h3>
      <div className="tiles">
        <Tile label={`VPL ${ref}`} value={brl(k.vpl_rs)} tone={vpl === null ? "" : vpl >= 0 ? "pos" : "neg"}
          sub={`taxa nominal ${nf(k.taxa_desconto_nominal_pct, 2)} %`} />
        <Tile label="TIR" value={nf(k.tir_pct, 1)} unit="%" />
        <Tile label="Payback simples" value={nf(k.payback_anos, 1)} unit="anos"
          sub={`descontado: ${k.payback_descontado_anos ? nf(k.payback_descontado_anos, 1) + " anos" : "não atinge"}`} />
        <Tile label="CAPEX" value={brl(k.capex_rs)} />
        <Tile label="Custo presente líquido (NPC)" value={brl(k.npc_rs)} sub={`referência ${k.referencia}: ${brl(k.ref_npc_rs)}`} />
        <Tile label="Custo nivelado de atendimento" value={"R$ " + nf(k.lcoe_atendimento_rs_kwh, 3)} unit="/kWh"
          sub={`referência: R$ ${nf(k.ref_lcoe_rs_kwh, 3)}/kWh (comparável ao LCOE do Octave)`} />
        {!off && <Tile label="Economia no ano 1" value={brl(k.economia_ano1_rs)}
          sub={`fatura ${brl(k.fatura_sem_sistema_ano1_rs)} → ${brl(k.fatura_com_sistema_ano1_rs)}`} />}
        {!off && <Tile label="Fio B pago no ano 1" value={brl(k.fio_b_ano1_rs)} />}
        <Tile label="LCOE real (SAM)" value={"R$ " + nf(k.lcoe_real_rs_kwh, 3)} unit="/kWh"
          sub={`custo do sistema ÷ energia gerada · nominal R$ ${nf(k.lcoe_nominal_rs_kwh, 3)}`} />
        <Tile label="LCOS real" value={k.lcos_real_rs_kwh === null ? "–" : "R$ " + nf(k.lcos_real_rs_kwh, 3)}
          unit={k.lcos_real_rs_kwh === null ? "" : "/kWh"} sub="custo nivelado do armazenamento" />
      </div>

      <h3 className="section-label">Energia (ano 1)</h3>
      <div className="tiles">
        <Tile label="Potência FV" value={nf(k.potencia_fv_kwp, 2)} unit="kWp"
          sub={`inversor ${nf(k.potencia_inversor_kw, 1)} kW · CC/CA ${nf(k.relacao_cc_ca, 2)}`} />
        <Tile label="Geração FV (CA)" value={nf(k.geracao_fv_ano1_kwh)} unit="kWh"
          sub={`${nf(k.produtividade_kwh_kwp)} kWh/kWp · PR ${nf(k.performance_ratio, 2)}`} />
        {off ? <>
          <Tile label="Carga atendida" value={nf(k.atendimento_pct, 2)} unit="%"
            sub={`não atendida ${nf(k.nao_atendida_ano1_kwh, 1)} kWh`} />
          <Tile label="Fração renovável" value={nf(k.fracao_renovavel_pct, 1)} unit="%" sub="FV + bateria" />
          <Tile label="FV não aproveitada" value={nf(k.fv_nao_aproveitada_ano1_kwh)} unit="kWh" sub="excedente sem rede nem bateria livre" />
        </> : <>
          <Tile label="Autoconsumo" value={nf(k.autoconsumo_pct, 1)} unit="%" sub="da geração usada no local" />
          <Tile label="Autossuficiência" value={nf(k.autossuficiencia_pct, 1)} unit="%" sub="da carga sem a rede" />
          <Tile label="Importado da rede" value={nf(k.importado_rede_kwh)} unit="kWh" sub={`consumo ${nf(k.consumo_anual_kwh)} kWh`} />
          <Tile label="Injetado na rede" value={nf(k.exportado_rede_kwh)} unit="kWh" />
        </>}
        <Tile label="Bateria" value={nf(k.bateria_kwh, 1)} unit="kWh"
          sub={`${nf(k.bateria_ciclos_equivalentes_ano1)} ciclos eq./ano · η ${nf(k.bateria_eficiencia_ciclo_pct, 1)} %`} />
        <Tile label="Autonomia" value={nf(k.autonomia_h, 1)} unit="h" sub="energia útil ÷ carga média" />
        <Tile label="Trocas de bateria" value={nf(k.bateria_substituicoes)} sub="na vida útil" />
        {(temGerador || off) && <Tile label="Gerador" value={nf(k.gerador_energia_ano1_kwh)} unit="kWh"
          sub={`${nf(k.gerador_horas_ano1)} h · ${nf(k.gerador_litros_ano1)} L · ${brl(k.gerador_custo_ano1_rs)}/ano`} />}
        <Tile label="Clipping do inversor" value={nf(k.perda_clipping_pct, 2)} unit="%" />
      </div>
      {off && <p className="note">Referência off-grid: gerador a diesel de {nf(k.ref_potencia_gerador_kw, 0)} kW atendendo
        toda a carga ({nf(k.ref_litros_ano1)} L/ano). VPL, TIR e payback são do investimento em FV + bateria em relação
        a essa referência.</p>}

      <div className="chart-block">
        <div className="row-between">
          <h3>Operação horária — atendimento da carga</h3>
          <label className="inline">Semana iniciando em
            <input type="date" value={semana} min="2019-01-01" max="2019-12-25" onChange={(e) => setSemana(e.target.value)} />
          </label>
        </div>
        <Plot data={op.main.data} layout={op.main.layout} />
        <h3>Estado de carga da bateria (SOC)</h3>
        <Plot className="chart short" data={op.soc.data} layout={op.soc.layout} />
      </div>

      <div className="two-col">
        <div className="chart-block"><h3>Balanço mensal — origem da energia consumida</h3>
          <Plot data={mensal.origem} layout={mensal.lay} /></div>
        <div className="chart-block"><h3>Destino da geração FV</h3>
          <Plot data={mensal.destino} layout={mensal.lay} /></div>
      </div>
      <div className="two-col">
        {!off && <div className="chart-block"><h3>Fatura mensal (ano 1)</h3><Plot data={fatura.data} layout={fatura.layout} /></div>}
        <div className="chart-block"><h3>Fluxo de caixa {off ? "(incremental vs. só diesel)" : ""}</h3>
          <Plot data={caixa.data} layout={caixa.layout} /></div>
        {off && bateria && <div className="chart-block"><h3>Capacidade da bateria ao longo da vida útil</h3>
          <Plot data={bateria.data} layout={bateria.layout} /></div>}
      </div>
      <div className="two-col">
        {!off && <div className="chart-block"><h3>Capacidade da bateria ao longo da vida útil</h3>
          {bateria ? <Plot data={bateria.data} layout={bateria.layout} /> : <p className="muted">Sem bateria nesta simulação.</p>}
        </div>}
        <div className="chart-block"><h3>Perdas do sistema (ano 1)</h3>
          <table><thead><tr><th>Etapa</th><th>Valor</th></tr></thead>
            <tbody>{perdas.map(([a, b]) => <tr key={a}><td>{a}</td><td>{b}</td></tr>)}</tbody></table>
        </div>
      </div>

      {r.backup && <div className="chart-block">
        <h3>Backup — quedas de rede</h3>
        <p>{nf(r.backup.horas_queda)} h de queda · carga crítica {nf(r.backup.carga_critica_kwh, 1)} kWh · gerador{" "}
          {nf(r.backup.gerador_kwh, 1)} kWh · não atendida {nf(r.backup.nao_atendida_kwh, 1)} kWh ·{" "}
          <b>{nf(r.backup.atendida_pct, 1)} % atendida</b></p>
        <div className="table-wrap"><table>
          <thead><tr><th>Início</th><th>Duração (h)</th><th>SOC no início (%)</th><th>Carga crítica (kWh)</th>
            <th>Não atendida (kWh)</th><th>Atendida (%)</th></tr></thead>
          <tbody>{r.backup.eventos.map((e) => (
            <tr key={e.inicio_hora}><td>{fmtHora(e.inicio_hora)}</td><td>{e.duracao_h}</td><td>{nf(e.soc_inicio_pct, 1)}</td>
              <td>{nf(e.carga_critica_kwh, 2)}</td><td>{nf(e.nao_atendida_kwh, 2)}</td><td>{nf(e.atendida_pct, 1)}</td></tr>
          ))}</tbody>
        </table></div>
      </div>}

      {!off && <div className="chart-block">
        <h3>Faturamento mensal detalhado (ano 1)</h3>
        <div className="table-wrap"><table>
          <thead><tr><th>Mês</th><th>Rede (kWh)</th><th>Injetado (kWh)</th><th>Compensado (kWh)</th>
            <th>Crédito acumulado (kWh)</th><th>Fio B (R$)</th><th>Fatura sem sistema (R$)</th>
            <th>Fatura com sistema (R$)</th><th>Mínimo?</th></tr></thead>
          <tbody>{r.tarifa_mensal_ano1.map((m, i) => (
            <tr key={i}><td>{MESES[i]}</td><td>{nf(m.consumo_rede_kwh)}</td><td>{nf(m.injetado_kwh)}</td>
              <td>{nf(m.compensado_kwh)}</td><td>{nf(m.credito_acumulado_kwh)}</td><td>{nf(m.fio_b_rs, 2)}</td>
              <td>{nf(m.fatura_sem_sistema_rs, 2)}</td><td>{nf(m.fatura_com_sistema_rs, 2)}</td>
              <td>{m.minimo_aplicado ? "sim" : ""}</td></tr>
          ))}</tbody>
        </table></div>
      </div>}

      <div className="chart-block">
        <h3>Fluxo de caixa anual</h3>
        <CashTable r={r} off={off} />
      </div>
    </section>
  );
}

function CashTable({ r, off }: { r: Resultado; off: boolean }) {
  const f = r.fluxo;
  const g = (key: string, i: number) => (f[key] && f[key][i] !== undefined ? f[key][i] : null);
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>Ano</th><th>Energia atendida (kWh)</th>
        {!off && <><th>Fatura sem (R$)</th><th>Fatura com (R$)</th><th>Economia (R$)</th><th>Fio B</th></>}
        <th>O&amp;M (R$)</th><th>Gerador (R$)</th><th>Reposição bateria (R$)</th><th>Fluxo (R$)</th><th>Acumulado (R$)</th>
        <th>Cap. bateria</th></tr></thead>
      <tbody>{f.ano.map((_, i) => (
        <tr key={i}><td>{i}</td><td>{nf(g("energia_atendida_kwh", i))}</td>
          {!off && <><td>{nf(g("fatura_sem", i))}</td><td>{nf(g("fatura_com", i))}</td><td>{nf(g("economia", i))}</td>
            <td>{g("percentual_fio_b", i) === null ? "" : nf(g("percentual_fio_b", i)) + " %"}</td></>}
          <td>{nf(g("om", i))}</td><td>{nf(g("custo_gerador", i))}</td><td>{nf(g("reposicao_bateria", i))}</td>
          <td>{nf(g("fluxo_caixa", i))}</td><td>{nf(g("acumulado", i))}</td>
          <td>{g("capacidade_bateria_pct", i) === null ? "" : nf(g("capacidade_bateria_pct", i), 1) + " %"}</td></tr>
      ))}</tbody>
    </table></div>
  );
}
