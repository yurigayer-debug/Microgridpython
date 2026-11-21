import { useCallback, useEffect, useRef, useState } from "react";
import { type CargaResp, type CasoOtimizacao, type ClimaResp, type Esquema, get, type Msg, nf, post, type Resultado,
  type Values } from "./api";
import { DataPanel } from "./components/DataPanel";
import { Optimize } from "./components/Optimize";
import { ParamForm, Validation } from "./components/ParamForm";
import { Results } from "./components/Results";
import { useTheme } from "./theme";

type Pagina = "simulacao" | "otimizacao";

const clone = (v: Values): Values => JSON.parse(JSON.stringify(v));

export default function App() {
  const { toggle } = useTheme();
  const [esquema, setEsquema] = useState<Esquema | null>(null);
  const [values, setValues] = useState<Values>({});
  const [clima, setClima] = useState<ClimaResp | null>(null);
  const [carga, setCarga] = useState<CargaResp | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [pagina, setPagina] = useState<Pagina>("simulacao");
  const [erroInicial, setErroInicial] = useState("");
  const resRef = useRef<HTMLDivElement>(null);
  const abrirJson = useRef<HTMLInputElement>(null);

  useEffect(() => {
    get<Esquema>("/api/esquema").then((e) => { setEsquema(e); setValues(clone(e.padrao)); })
      .catch((e) => setErroInicial((e as Error).message));
  }, []);

  const onChange = useCallback((g: string, n: string, v: unknown) => {
    setValues((old) => ({ ...old, [g]: { ...old[g], [n]: v } }));
  }, []);

  const payload = () => ({ ...values, weather_id: clima?.id ?? "", load_id: carga?.id ?? "" });

  async function validar() {
    try { setMsgs((await post<{ validacao: Msg[] }>("/api/validar", payload())).validacao); }
    catch (e) { setMsgs([{ nivel: "erro", texto: (e as Error).message }]); }
  }

  async function simular() {
    if (!clima || !carga) { setStatus("Carregue clima e carga primeiro."); return; }
    setBusy(true);
    const anos = values.financeiro?.anos_analise;
    setStatus(`Simulando com PySAM (8760 h × ${anos} anos)…`);
    const t0 = performance.now();
    try {
      const r = await post<Resultado>("/api/simular", payload());
      setMsgs(r.validacao);
      if (!r.ok) { setStatus(r.erro || "Erro"); return; }
      setResultado(r);
      setStatus(`Concluído em ${nf((performance.now() - t0) / 1000, 1)} s (PySAM ${nf(r.tempo_s, 1)} s).`);
      setTimeout(() => resRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e) {
      const m = (e as Error).message;
      setStatus("Erro: " + m);
      if (/não encontrado/.test(m)) { setClima(null); setCarga(null); }
    } finally { setBusy(false); }
  }

  function salvar() {
    const blob = new Blob([JSON.stringify(values, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "entradas_simulador_hibrido.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function abrir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !esquema) return;
    try {
      const data = JSON.parse(await file.text()) as Values;
      const merged = clone(esquema.padrao);
      for (const g of Object.keys(merged)) if (data[g]) merged[g] = { ...merged[g], ...data[g] };
      setValues(merged);
      setStatus(`Entradas carregadas de ${file.name}.`);
    } catch (err) { setStatus("Arquivo JSON inválido: " + (err as Error).message); }
    e.target.value = "";
  }

  function aplicarCaso(caso: CasoOtimizacao) {
    const cfg = caso.config;
    if (!cfg) return;
    setValues((old) => {
      const v = clone(old);
      v.arranjo.modulos_por_string = cfg.modulos_por_string;
      v.arranjo.n_strings = cfg.n_strings;
      v.inversor.quantidade = cfg.inversores;
      v.bateria.habilitada = cfg.bateria_habilitada;
      if (cfg.bateria_habilitada) { v.bateria.capacidade_kwh = cfg.bateria_kwh; v.bateria.potencia_kw = cfg.bateria_kw; }
      v.gerador.habilitado = cfg.gerador_habilitado;
      if (cfg.gerador_habilitado) v.gerador.potencia_kw = cfg.gerador_kw;
      return v;
    });
    setPagina("simulacao");
    setStatus("Configuração da otimização aplicada. Clique em Simular para ver os detalhes.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (erroInicial) return <main><section className="card">Falha ao conectar à API: {erroInicial}</section></main>;
  if (!esquema) return <main><section className="card"><span className="spinner" />Carregando…</section></main>;

  return (
    <>
      <header className="top">
        <div>
          <h1>Simulador Híbrido PySAM</h1>
          <p className="sub">Inversor híbrido + bateria + FV · NREL PySAM (Pvsamv1 → Grid → Cashloan) · tarifa brasileira
            (Lei 14.300) · off-grid com gerador</p>
        </div>
        <div className="top-actions row-between">
          <nav className="app-nav">
            <button className={pagina === "simulacao" ? "on" : ""} onClick={() => setPagina("simulacao")}>Simulação</button>
            <button className={pagina === "otimizacao" ? "on" : ""} onClick={() => setPagina("otimizacao")}>Otimização</button>
          </nav>
          <button className="ghost" onClick={toggle} title="Alternar tema claro/escuro">◐ Tema</button>
        </div>
      </header>
      <main>
        <div hidden={pagina !== "simulacao"} style={{ display: pagina === "simulacao" ? "grid" : "none", gap: 18 }}>
          <DataPanel esquema={esquema} lat={values.local?.latitude as number} lon={values.local?.longitude as number}
            clima={clima} carga={carga} onClima={setClima} onCarga={setCarga} />
          <section className="card">
            <div className="row-between">
              <h2><span className="step">2</span> Parâmetros do sistema</h2>
              <div className="actions">
                <button className="ghost" onClick={() => setValues(clone(esquema.padrao))}>Restaurar padrão</button>
                <button className="ghost" onClick={salvar}>Salvar entradas (.json)</button>
                <button className="ghost" onClick={() => abrirJson.current?.click()}>Abrir entradas (.json)</button>
                <input type="file" ref={abrirJson} accept=".json" hidden onChange={abrir} />
              </div>
            </div>
            <ParamForm grupos={esquema.grupos} values={values} onChange={onChange} />
            <Validation msgs={msgs} />
            <div className="run-bar">
              <button className="ghost" onClick={validar}>Validar dimensionamento</button>
              <button className="primary big" onClick={simular} disabled={busy}>{busy && <span className="spinner" />}▶ Simular</button>
              <span className="muted">{status}</span>
            </div>
          </section>
          <div ref={resRef}>{resultado && <Results r={resultado} />}</div>
        </div>
        {pagina === "otimizacao" && (
          <Optimize values={values} weatherId={clima?.id ?? ""} loadId={carga?.id ?? ""} onAplicar={aplicarCaso} />
        )}
      </main>
      <footer>
        Motor: <a href="https://github.com/NREL/pysam" target="_blank" rel="noopener">NREL PySAM</a> · documentação{" "}
        <a href="https://nrel-pysam.readthedocs.io/en/latest/" target="_blank" rel="noopener">nrel-pysam.readthedocs.io</a> ·
        Clima online: PVGIS (JRC/UE). Valores tarifários padrão são ilustrativos — use os da sua distribuidora.
      </footer>
    </>
  );
}
