import { useEffect, useMemo, useRef, useState } from "react";
import { brl, type CasoOtimizacao, get, type LinhaOctave, nf, type Otimizacao, parseList, post, type Values } from "../api";
import { useTheme } from "../theme";
import { baseLayout, Plot, type Trace } from "./Plot";

type Criterio = "vpl" | "lcoe_atendimento" | "npc";
const CRIT: Record<Criterio, { key: string; label: string; better: "max" | "min"; fmt: (v: unknown) => string }> = {
  vpl: { key: "vpl_rs", label: "VPL (R$)", better: "max", fmt: (v) => brl(v) },
  lcoe_atendimento: { key: "lcoe_atendimento_rs_kwh", label: "Custo nivelado de atendimento (R$/kWh)", better: "min",
    fmt: (v) => "R$ " + nf(v, 3) },
  npc: { key: "npc_rs", label: "Custo presente líquido (R$)", better: "min", fmt: (v) => brl(v) },
};

const OCTAVE_GRADE = { pv: "11.2; 15; 20; 25; 30", bat: "20; 30; 40; 50; 60", ger: "10; 15; 20" };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

interface Props {
  values: Values;
  weatherId: string;
  loadId: string;
  onAplicar: (caso: CasoOtimizacao) => void;
}

export function Optimize({ values, weatherId, loadId, onAplicar }: Props) {
  const { colors: c } = useTheme();
  const off = values.operacao?.modo === "off_grid";
  const [pv, setPv] = useState("3.3; 4.4; 5.5; 6.6; 8.8");
  const [bat, setBat] = useState(off ? "5; 10; 15; 20" : "0; 5; 10; 15; 20");
  const [ger, setGer] = useState(off ? "3; 5" : "0");
  const [auto, setAuto] = useState(true);
  const [ccca, setCcca] = useState(1.3);
  const [criterio, setCriterio] = useState<Criterio>(off ? "lcoe_atendimento" : "vpl");
  const [job, setJob] = useState<Otimizacao | null>(null);
  const [erro, setErro] = useState("");
  const [gerSel, setGerSel] = useState<number | null>(null);
  const [octave, setOctave] = useState<LinhaOctave[]>([]);
  const timer = useRef<number | null>(null);

  const listas = { pv: parseList(pv), bat: parseList(bat), ger: parseList(ger) };
  const nComb = listas.pv.length * listas.bat.filter((b) => !off || b > 0).length * Math.max(1, listas.ger.length);
  const rodando = job?.status === "na_fila" || job?.status === "executando";

  useEffect(() => {
    get<{ linhas: LinhaOctave[] }>(`/api/octave/${off ? "off_grid" : "on_grid"}`).then((r) => setOctave(r.linhas))
      .catch(() => setOctave([]));
  }, [off]);
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

  function poll(id: string) {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(async () => {
      try {
        const st = await get<Otimizacao>(`/api/otimizar/${id}`);
        setJob(st);
        if (!["na_fila", "executando"].includes(st.status) && timer.current) window.clearInterval(timer.current);
      } catch (e) {
        setErro((e as Error).message);
        if (timer.current) window.clearInterval(timer.current);
      }
    }, 2000);
  }

  async function iniciar() {
    setErro("");
    if (!weatherId || !loadId) { setErro("Carregue clima e carga na aba Simulação."); return; }
    if ([listas.pv, listas.bat, listas.ger].some((l) => !l.length || l.some((v) => Number.isNaN(v) || v < 0))) {
      setErro("Listas inválidas: use números separados por ';'."); return;
    }
    try {
      const st = await post<Otimizacao>("/api/otimizar", {
        base: { ...values, weather_id: weatherId, load_id: loadId },
        spec: { pv_kwp: listas.pv, bateria_kwh: listas.bat, gerador_kw: listas.ger, inversor_automatico: auto,
          relacao_cc_ca_max: ccca, criterio },
      });
      setJob(st); setGerSel(null); poll(st.id);
    } catch (e) { setErro((e as Error).message); }
  }

  async function cancelar() {
    if (job) await post(`/api/otimizar/${job.id}/cancelar`, {});
  }

  const crit = CRIT[(job?.criterio as Criterio) || criterio];
  const gerList = useMemo(() => [...new Set((job?.resultados || []).map((r) => r.alvo.gerador_kw))].sort((a, b) => a - b),
    [job]);
  const gerAtual = gerSel ?? (job?.melhor?.alvo.gerador_kw ?? gerList[0] ?? 0);

  const heat = useMemo(() => {
    if (!job || !job.resultados.length) return null;
    const rs = job.resultados.filter((r) => near(r.alvo.gerador_kw, gerAtual));
    const xs = [...new Set(rs.map((r) => r.alvo.bateria_kwh))].sort((a, b) => a - b);
    const ys = [...new Set(rs.map((r) => r.alvo.pv_kwp))].sort((a, b) => a - b);
    const z: (number | null)[][] = ys.map(() => xs.map(() => null));
    const txt: string[][] = ys.map(() => xs.map(() => ""));
    for (const r of rs) {
      const i = ys.indexOf(r.alvo.pv_kwp), j = xs.indexOf(r.alvo.bateria_kwh);
      const v = r.ok ? r.kpis[crit.key] : null;
      z[i][j] = typeof v === "number" ? v : null;
      txt[i][j] = !r.ok ? "erro" : r.viavel === false ? "inviável" : crit.fmt(v);
    }
    const vals = z.flat().filter((v): v is number => v !== null);
    const diverging = crit.key === "vpl_rs" && vals.some((v) => v < 0) && vals.some((v) => v > 0);
    // sequencial (azul, claro→escuro) para magnitude; divergente azul↔vermelho com meio cinza para VPL ±
    const seq = [[0, "#cde2fb"], [0.5, "#5598e7"], [1, "#104281"]];
    const div = [[0, "#e34948"], [0.5, c.neutral], [1, "#2a78d6"]];
    const trace: Trace = {
      type: "heatmap", x: xs.map(String), y: ys.map(String), z, text: txt, texttemplate: "%{text}",
      textfont: { size: 11 }, colorscale: diverging ? div : seq,
      zmid: diverging ? 0 : undefined, xgap: 2, ygap: 2,
      colorbar: { title: { text: crit.label, side: "right" }, tickfont: { color: c.text2 }, outlinewidth: 0 },
      hovertemplate: "FV %{y} kWp · bateria %{x} kWh<br>%{text}<extra></extra>",
    };
    return {
      data: [trace],
      layout: baseLayout(c, { margin: { l: 70, r: 20, t: 10, b: 50 },
        xaxis: { title: { text: "Bateria (kWh)" }, type: "category" },
        yaxis: { title: { text: "FV alvo (kWp)" }, type: "category" } }),
    };
  }, [job, gerAtual, crit, c]);

  const ordenados = useMemo(() => {
    if (!job) return [];
    const sgn = crit.better === "max" ? -1 : 1;
    return [...job.resultados].sort((a, b) => {
      if (a.ok !== b.ok) return a.ok ? -1 : 1;
      if ((a.viavel ?? true) !== (b.viavel ?? true)) return a.viavel === false ? 1 : -1;
      const va = a.kpis[crit.key], vb = b.kpis[crit.key];
      return sgn * ((typeof va === "number" ? va : Infinity * sgn) - (typeof vb === "number" ? vb : Infinity * sgn));
    });
  }, [job, crit]);

  const comparacao = useMemo(() => {
    if (!job || !octave.length) return [];
    return octave.flatMap((o) => {
      const r = job.resultados.find((x) => x.ok && near(x.alvo.pv_kwp, o.pv_kwp ?? -1) &&
        near(x.alvo.bateria_kwh, o.bateria_kwh ?? -1) && (off ? near(x.alvo.gerador_kw, o.gerador_kw ?? -1) : true));
      return r ? [{ o, r }] : [];
    }).filter((x, i, arr) => arr.findIndex((y) => y.r === x.r) === i);
  }, [job, octave, off]);

  const scatter = useMemo(() => {
    if (!comparacao.length) return null;
    const xs = comparacao.map((x) => x.o.lcoe ?? null);
    const ys = comparacao.map((x) => x.r.kpis.lcoe_atendimento_rs_kwh as number);
    const all = [...xs, ...ys].filter((v): v is number => typeof v === "number");
    const lo = Math.min(...all) * 0.9, hi = Math.max(...all) * 1.1;
    return {
      data: [
        { type: "scatter", mode: "lines", x: [lo, hi], y: [lo, hi], name: "y = x", line: { color: c.muted, width: 1, dash: "dot" },
          hoverinfo: "skip" },
        { type: "scatter", mode: "markers", x: xs, y: ys, name: "Configurações", marker: { color: c.rede, size: 10,
          line: { color: c.surface, width: 2 } },
          text: comparacao.map((x) => `FV ${x.o.pv_kwp} kWp · bat ${x.o.bateria_kwh} kWh${off ? ` · ger ${x.o.gerador_kw} kW` : ""}`),
          hovertemplate: "%{text}<br>Octave R$ %{x:.3f} · PySAM R$ %{y:.3f}<extra></extra>" },
      ],
      layout: baseLayout(c, { xaxis: { title: { text: "LCOE Octave (R$/kWh)" } },
        yaxis: { title: { text: "Custo nivelado PySAM (R$/kWh)" } }, showlegend: false }),
    };
  }, [comparacao, c, off]);

  return (
    <>
      <section className="card">
        <h2><span className="step">4</span> Otimização de dimensionamento
          <span className="badge">{off ? "off-grid" : "on-grid"}</span></h2>
        <p className="hint">Simula todas as combinações FV × bateria{off ? " × gerador" : ""} com o PySAM, usando os demais
          parâmetros da aba Simulação. A FV é convertida em módulos por string × strings dentro dos limites de tensão do
          inversor; a potência da bateria mantém a taxa C da configuração base.
          {off && ` No off-grid só são viáveis soluções com atendimento ≥ ${nf(values.operacao?.confiabilidade_min as number, 1)} %.`}</p>
        <div className="grid3">
          <label className="field"><span>FV alvo <i>kWp, separados por ;</i></span>
            <input type="text" value={pv} onChange={(e) => setPv(e.target.value)} /></label>
          <label className="field"><span>Bateria <i>kWh (0 = sem bateria)</i></span>
            <input type="text" value={bat} onChange={(e) => setBat(e.target.value)} /></label>
          <label className="field"><span>Gerador <i>kW (0 = sem gerador)</i></span>
            <input type="text" value={ger} onChange={(e) => setGer(e.target.value)} /></label>
          <label className="field"><span>Critério</span>
            <select value={criterio} onChange={(e) => setCriterio(e.target.value as Criterio)}>
              <option value="vpl">Maior VPL</option>
              <option value="lcoe_atendimento">Menor custo nivelado de atendimento</option>
              <option value="npc">Menor custo presente líquido</option>
            </select></label>
          <label className="field check"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            <span>Ajustar quantidade de inversores</span></label>
          <label className="field"><span>CC/CA máxima</span>
            <input type="number" step={0.05} min={0.6} max={3} value={ccca} onChange={(e) => setCcca(parseFloat(e.target.value))} /></label>
        </div>
        <div className="run-bar">
          <button className="ghost" onClick={() => { setPv(OCTAVE_GRADE.pv); setBat(OCTAVE_GRADE.bat); setGer(off ? OCTAVE_GRADE.ger : "0"); }}>
            Usar grade do Octave</button>
          <button className="primary big" onClick={iniciar} disabled={rodando || nComb === 0}>▶ Otimizar ({nComb} combinações)</button>
          {rodando && <button className="ghost" onClick={cancelar}>Cancelar</button>}
          <span className="muted">{erro || (rodando ? `${job?.concluidos}/${job?.total} · ${nf(job?.decorrido_s, 0)} s` :
            job ? `${job.status === "concluido" ? "Concluído" : job.status} em ${nf(job.decorrido_s, 0)} s` :
              "≈ 10–20 s por combinação, em paralelo em todos os núcleos.")}</span>
        </div>
        {job && <div className="progress"><div style={{ width: `${(100 * job.concluidos) / Math.max(1, job.total)}%` }} /></div>}
        {job?.erro && <p className="msg erro"><span className="tag">✕ ERRO</span>{job.erro}</p>}
      </section>

      {job && job.resultados.length > 0 && (
        <section className="card">
          <div className="row-between">
            <h2>Resultados da otimização</h2>
            <a href={`/api/otimizar/${job.id}/resultados.csv`}><button className="ghost">Resultados (.csv)</button></a>
          </div>
          {job.melhor ? (
            <div className="note">
              <b>Melhor configuração ({crit.label.toLowerCase()}):</b> FV {nf(job.melhor.kpis.potencia_fv_kwp, 2)} kWp
              ({job.melhor.config?.modulos_por_string}×{job.melhor.config?.n_strings} módulos,{" "}
              {job.melhor.config?.inversores} inversor(es)) · bateria {nf(job.melhor.kpis.bateria_kwh, 1)} kWh
              {job.melhor.alvo.gerador_kw > 0 ? ` · gerador ${nf(job.melhor.alvo.gerador_kw, 1)} kW` : ""} → {crit.fmt(job.melhor.kpis[crit.key])}
              {" "}<button className="ghost" onClick={() => onAplicar(job.melhor!)}>Abrir na simulação</button>
            </div>
          ) : <p className="note">Nenhuma configuração viável ainda.</p>}

          {gerList.length > 1 && <label className="inline">Gerador no mapa:
            <select value={gerAtual} onChange={(e) => setGerSel(parseFloat(e.target.value))}>
              {gerList.map((g) => <option key={g} value={g}>{g} kW</option>)}
            </select></label>}
          {heat && <Plot data={heat.data} layout={heat.layout} className="chart tall" />}

          <h3>Todas as combinações (ordenadas pelo critério)</h3>
          <div className="table-wrap"><table>
            <thead><tr><th>FV (kWp)</th><th>Arranjo</th><th>Bateria (kWh)</th><th>Gerador (kW)</th><th>CAPEX</th>
              <th>VPL</th><th>TIR (%)</th><th>Payback</th><th>NPC</th><th>Custo nivelado (R$/kWh)</th>
              <th>{off ? "Atendimento (%)" : "Autossuf. (%)"}</th><th>{off ? "Diesel (L)" : "Importado (kWh)"}</th><th></th></tr></thead>
            <tbody>{ordenados.map((r, i) => {
              const k = r.kpis;
              const m = job.melhor;
              const best = !!m && near(r.alvo.pv_kwp, m.alvo.pv_kwp) && near(r.alvo.bateria_kwh, m.alvo.bateria_kwh)
                && near(r.alvo.gerador_kw, m.alvo.gerador_kw);
              return (
                <tr key={i} className={best ? "best" : r.viavel === false || !r.ok ? "inviavel" : ""}>
                  <td>{nf(k.potencia_fv_kwp, 2)}</td>
                  <td>{r.config ? `${r.config.modulos_por_string}×${r.config.n_strings} · ${r.config.inversores} inv.` : ""}</td>
                  <td>{nf(r.alvo.bateria_kwh, 1)}</td><td>{nf(r.alvo.gerador_kw, 1)}</td>
                  {r.ok ? <>
                    <td>{brl(k.capex_rs)}</td><td>{brl(k.vpl_rs)}</td><td>{nf(k.tir_pct, 1)}</td><td>{nf(k.payback_anos, 1)}</td>
                    <td>{brl(k.npc_rs)}</td><td>{nf(k.lcoe_atendimento_rs_kwh, 3)}</td>
                    <td>{off ? nf(k.atendimento_pct, 2) : nf(k.autossuficiencia_pct, 1)}</td>
                    <td>{off ? nf(k.gerador_litros_ano1) : nf(k.importado_rede_kwh)}</td>
                    <td><button className="ghost link" onClick={() => onAplicar(r)}>abrir</button></td>
                  </> : <td colSpan={9}>{r.erro}</td>}
                </tr>
              );
            })}</tbody>
          </table></div>
        </section>
      )}

      <section className="card">
        <h2>Comparação com o microgrid_optimizer.m (Octave)</h2>
        <p className="hint">Lê <code>relatorio_completo_{off ? "off_grid" : "on_grid"}.csv</code> do repositório ({octave.length} linhas)
          e cruza com as combinações iguais da otimização acima (use <b>Usar grade do Octave</b>). O LCOE do Octave inclui
          compras da rede e combustível — compare com o <b>custo nivelado de atendimento</b> do PySAM. As premissas precisam
          ser equivalentes (carga de 2.500 kWh/mês, tarifa e custos do script) para a comparação fazer sentido.</p>
        {comparacao.length === 0 ? <p className="muted">Nenhuma combinação em comum ainda.</p> : <>
          {scatter && <Plot data={scatter.data} layout={scatter.layout} />}
          <div className="table-wrap"><table>
            <thead><tr><th>FV (kWp)</th><th>Bateria (kWh)</th>{off && <th>Gerador (kW)</th>}<th>LCOE Octave</th>
              <th>Custo nivelado PySAM</th><th>Δ %</th><th>{off ? "Diesel Octave (L)" : "Importado Octave (kWh)"}</th>
              <th>{off ? "Diesel PySAM (L)" : "Importado PySAM (kWh)"}</th><th>LCOS Octave</th><th>LCOS PySAM</th></tr></thead>
            <tbody>{comparacao.map(({ o, r }, i) => {
              const a = o.lcoe ?? null, b = r.kpis.lcoe_atendimento_rs_kwh as number | null;
              return (
                <tr key={i}><td>{nf(o.pv_kwp, 1)}</td><td>{nf(o.bateria_kwh, 0)}</td>{off && <td>{nf(o.gerador_kw, 0)}</td>}
                  <td>{nf(a, 3)}</td><td>{nf(b, 3)}</td><td>{a && b ? nf((100 * (b - a)) / a, 1) : "–"}</td>
                  <td>{off ? nf(o.combustivel_l) : nf(o.importada_kwh)}</td>
                  <td>{off ? nf(r.kpis.gerador_litros_ano1) : nf(r.kpis.importado_rede_kwh)}</td>
                  <td>{nf(o.lcos, 3)}</td><td>{nf(r.kpis.lcos_real_rs_kwh, 3)}</td></tr>
              );
            })}</tbody>
          </table></div>
        </>}
      </section>
    </>
  );
}
