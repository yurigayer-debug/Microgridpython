import { useEffect, useMemo, useRef, useState } from "react";
import { type CargaResp, type ClimaResp, type Esquema, MESES, nf, parseList, post, postForm } from "../api";
import { useTheme } from "../theme";
import { baseLayout, Plot } from "./Plot";

type FonteClima = "sintetico" | "pvgis" | "arquivo" | "repositorio";
type FonteCarga = "sintetica" | "arquivo" | "repositorio";

interface Props {
  esquema: Esquema;
  lat: number;
  lon: number;
  clima: ClimaResp | null;
  carga: CargaResp | null;
  onClima: (c: ClimaResp | null) => void;
  onCarga: (c: CargaResp | null) => void;
}

function Seg<T extends string>({ value, options, onChange, disabled = [] }:
  { value: T; options: [T, string][]; onChange: (v: T) => void; disabled?: T[] }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={v} type="button" className={v === value ? "on" : ""} disabled={disabled.includes(v)}
          onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

export function DataPanel({ esquema, lat, lon, clima, carga, onClima, onCarga }: Props) {
  const { colors: c } = useTheme();
  const [fClima, setFClima] = useState<FonteClima>("sintetico");
  const [fCarga, setFCarga] = useState<FonteCarga>("sintetica");
  const [ghi, setGhi] = useState(esquema.ghi_pelotas.join("; "));
  const [temp, setTemp] = useState(esquema.temp_pelotas.join("; "));
  const [consumo, setConsumo] = useState(600);
  const [perfil, setPerfil] = useState(esquema.perfis_carga[0]);
  const [lista, setLista] = useState("");
  const [msgClima, setMsgClima] = useState("");
  const [msgCarga, setMsgCarga] = useState("");
  const [busyClima, setBusyClima] = useState(false);
  const [busyCarga, setBusyCarga] = useState(false);
  const arqClima = useRef<HTMLInputElement>(null);
  const arqCarga = useRef<HTMLInputElement>(null);
  const semRepo = esquema.repositorio_csv ? [] : ["repositorio"];

  async function carregarClima() {
    setBusyClima(true); setMsgClima("");
    try {
      let r: ClimaResp;
      if (fClima === "sintetico") {
        const g = parseList(ghi), t = parseList(temp);
        if (g.length !== 12 || t.length !== 12) throw new Error("Informe 12 valores de GHI e 12 de temperatura.");
        r = await post("/api/clima/sintetico", { latitude: lat, longitude: lon, ghi_mensal: g, temp_mensal: t });
      } else if (fClima === "pvgis") {
        r = await post("/api/clima/pvgis", { latitude: lat, longitude: lon });
      } else if (fClima === "repositorio") {
        r = await post("/api/clima/repositorio", { latitude: lat, longitude: lon });
      } else {
        const file = arqClima.current?.files?.[0];
        if (!file) throw new Error("Escolha um arquivo de clima.");
        const fd = new FormData();
        fd.append("arquivo", file); fd.append("latitude", String(lat)); fd.append("longitude", String(lon));
        r = await postForm("/api/clima/arquivo", fd);
      }
      onClima(r);
    } catch (e) {
      setMsgClima("Erro: " + (e as Error).message);
    } finally { setBusyClima(false); }
  }

  async function carregarCarga() {
    setBusyCarga(true); setMsgCarga("");
    try {
      let r: CargaResp;
      if (fCarga === "sintetica") {
        const l = parseList(lista);
        if (l.length && l.length !== 12) throw new Error("Informe 12 valores mensais ou deixe em branco.");
        r = await post("/api/carga/sintetica", { consumo_mensal_kwh: consumo, perfil, consumo_mensal_lista: l.length ? l : null });
      } else if (fCarga === "repositorio") {
        r = await post("/api/carga/repositorio", {});
      } else {
        const file = arqCarga.current?.files?.[0];
        if (!file) throw new Error("Escolha um arquivo de carga.");
        const fd = new FormData(); fd.append("arquivo", file);
        r = await postForm("/api/carga/arquivo", fd);
      }
      onCarga(r);
    } catch (e) {
      setMsgCarga("Erro: " + (e as Error).message);
    } finally { setBusyCarga(false); }
  }

  // carrega os padrões na primeira abertura
  useEffect(() => {
    if (!clima) void carregarClima();
    if (!carga) void carregarCarga();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const plotClima = useMemo(() => clima ? {
    data: [{ type: "bar", x: MESES, y: clima.resumo.ghi_mensal_kwh_m2_dia, marker: { color: c.fv }, name: "GHI",
      hovertemplate: "%{x}: %{y:.2f} kWh/m²/dia<extra></extra>" }],
    layout: baseLayout(c, { showlegend: false, bargap: 0.35, margin: { l: 56, r: 10, t: 6, b: 28 },
      yaxis: { title: { text: "GHI kWh/m²/dia" } } }),
  } : null, [clima, c]);

  const plotCarga = useMemo(() => carga ? {
    data: [{ type: "scatter", mode: "lines", x: [...Array(24).keys()], y: carga.resumo.perfil_medio_diario_kw,
      name: "Carga média", line: { color: c.rede, width: 2, shape: "spline" }, fill: "tozeroy",
      fillcolor: c.rede + "22", hovertemplate: "%{x}h: %{y:.2f} kW<extra></extra>" }],
    layout: baseLayout(c, { showlegend: false, margin: { l: 56, r: 10, t: 6, b: 36 },
      xaxis: { title: { text: "hora do dia" }, dtick: 3 }, yaxis: { title: { text: "kW (média)" }, rangemode: "tozero" } }),
  } : null, [carga, c]);

  return (
    <section className="card">
      <h2><span className="step">1</span> Recurso solar e carga</h2>
      <div className="two-col">
        <div className="panel">
          <h3>Clima (8760 h)</h3>
          <Seg value={fClima} onChange={setFClima} disabled={semRepo as FonteClima[]}
            options={[["sintetico", "Sintético (offline)"], ["pvgis", "PVGIS (internet)"], ["arquivo", "Arquivo"],
              ["repositorio", "CSV do Octave"]]} />
          {fClima === "sintetico" && <>
            <p className="hint">Gera 8760 h a partir das médias mensais de GHI (padrão: Pelotas/RS, mesmas do script Octave).</p>
            <label className="field wide"><span>GHI mensal (kWh/m²/dia, jan→dez)</span>
              <input type="text" value={ghi} onChange={(e) => setGhi(e.target.value)} /></label>
            <label className="field wide"><span>Temperatura média mensal (°C, jan→dez)</span>
              <input type="text" value={temp} onChange={(e) => setTemp(e.target.value)} /></label>
          </>}
          {fClima === "pvgis" && <p className="hint">Baixa o ano meteorológico típico (TMY) do PVGIS para a
            latitude/longitude da aba <b>Local</b> ({nf(lat, 3)}, {nf(lon, 3)}).</p>}
          {fClima === "arquivo" && <>
            <p className="hint">EPW, CSV do SAM/NSRDB, CSV TMY do PVGIS ou CSV simples com coluna GHI (W/m²) — 8760
              linhas. Sem DNI/DHI, a separação é feita pelo modelo de Erbs.</p>
            <input type="file" ref={arqClima} accept=".csv,.epw,.txt" />
          </>}
          {fClima === "repositorio" && <p className="hint">Usa a coluna <code>Irradiacao_W_m2</code> de{" "}
            <code>perfil_carga_e_solar.csv</code> (gerada pelo microgrid_optimizer.m) com DNI/DHI por Erbs.</p>}
          <button className="primary" onClick={carregarClima} disabled={busyClima}>
            {busyClima && <span className="spinner" />}Carregar clima</button>
          <div className={"resumo" + (clima ? "" : " muted")}>
            {msgClima || (clima ? <>
              <b>{clima.resumo.fonte}</b><br />GHI anual <b>{nf(clima.resumo.ghi_anual_kwh_m2)} kWh/m²</b> · lat{" "}
              {nf(clima.resumo.lat, 3)}, lon {nf(clima.resumo.lon, 3)} · fuso UTC{clima.resumo.tz >= 0 ? "+" : ""}
              {clima.resumo.tz} · temp. {nf(clima.resumo.temp_min_c, 1)} a {nf(clima.resumo.temp_max_c, 1)} °C
            </> : "Nenhum clima carregado.")}
          </div>
          {plotClima && <Plot className="chart small" data={plotClima.data} layout={plotClima.layout} />}
        </div>

        <div className="panel">
          <h3>Carga (8760 h)</h3>
          <Seg value={fCarga} onChange={setFCarga} disabled={semRepo as FonteCarga[]}
            options={[["sintetica", "Sintética (EPE)"], ["arquivo", "Arquivo"], ["repositorio", "CSV do Octave"]]} />
          {fCarga === "sintetica" && <>
            <div className="grid2">
              <label className="field"><span>Consumo médio mensal <i>kWh/mês</i></span>
                <input type="number" min={1} step={10} value={consumo}
                  onChange={(e) => setConsumo(parseFloat(e.target.value))} /></label>
              <label className="field"><span>Perfil diário</span>
                <select value={perfil} onChange={(e) => setPerfil(e.target.value)}>
                  {esquema.perfis_carga.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
                </select></label>
            </div>
            <label className="field wide"><span>Ou 12 consumos mensais (kWh, jan→dez — opcional)</span>
              <input type="text" placeholder="ex.: 720; 680; 650; ..." value={lista} onChange={(e) => setLista(e.target.value)} /></label>
          </>}
          {fCarga === "arquivo" && <>
            <p className="hint">CSV com 8760 valores horários em kW (ou 35040 de 15 min). A coluna é detectada pelo nome
              (carga, load, kW...).</p>
            <input type="file" ref={arqCarga} accept=".csv,.txt" />
          </>}
          {fCarga === "repositorio" && <p className="hint">Usa a coluna <code>Carga_kW</code> de{" "}
            <code>perfil_carga_e_solar.csv</code>.</p>}
          <button className="primary" onClick={carregarCarga} disabled={busyCarga}>
            {busyCarga && <span className="spinner" />}Carregar carga</button>
          <div className={"resumo" + (carga ? "" : " muted")}>
            {msgCarga || (carga ? <>
              <b>{carga.resumo.fonte}</b><br />Consumo anual <b>{nf(carga.resumo.consumo_anual_kwh)} kWh</b> (
              {nf(carga.resumo.consumo_anual_kwh / 12)} kWh/mês) · demanda máx. {nf(carga.resumo.demanda_max_kw, 2)} kW
              · fator de carga {nf(carga.resumo.fator_carga, 2)}
            </> : "Nenhuma carga carregada.")}
          </div>
          {plotCarga && <Plot className="chart small" data={plotCarga.data} layout={plotCarga.layout} />}
        </div>
      </div>
    </section>
  );
}
