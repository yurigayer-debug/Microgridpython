/* Simulador Híbrido PySAM – frontend (sem etapa de build). */
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const state = { schema: null, defaults: null, weatherId: "", loadId: "", result: null, tab: "local" };

const nf = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v)) ? "–"
  : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const brl = (v, d = 0) => (v === null || v === undefined) ? "–" : "R$ " + nf(v, d);
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function colors() {
  return {
    fv: css("--s-fv"), bat: css("--s-bat"), rede: css("--s-rede"), exp: css("--s-export"),
    gridbat: css("--s-gridbat"), neutral: css("--s-neutral"), text: css("--text-primary"),
    text2: css("--text-secondary"), muted: css("--text-muted"), grid: css("--grid"), surface: css("--surface-1"),
    good: css("--good"), critical: css("--critical"),
  };
}

async function api(path, opts = {}) {
  const r = await fetch(path, opts);
  let body;
  try { body = await r.json(); } catch { body = null; }
  if (!r.ok) throw new Error((body && body.detail) ? (typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail)) : r.statusText);
  return body;
}
const postJSON = (path, data) => api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });

function parseList(text) {
  return text.split(/[;\s]+/).map(s => s.trim()).filter(Boolean).map(s => Number(s.replace(",", ".")));
}

/* ------------------------------------------------------------------ tema */
function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem("tema"); } catch { /* sem storage */ }
  if (saved) document.documentElement.dataset.theme = saved;
  $("#btn-tema").onclick = () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("tema", next); } catch { /* sem storage */ }
    if (state.result) renderResults(state.result);
    redrawPreviews();
  };
}

/* ------------------------------------------------------------------ formulário gerado pelo esquema */
function buildForm() {
  const tabs = $("#tabs"), form = $("#form");
  tabs.innerHTML = ""; form.innerHTML = "";
  for (const g of state.schema) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = g.title; b.dataset.k = g.key;
    b.onclick = () => selectTab(g.key);
    tabs.appendChild(b);
    const fs = document.createElement("div");
    fs.className = "fieldset"; fs.dataset.k = g.key;
    for (const f of g.fields) fs.appendChild(fieldEl(g.key, f));
    form.appendChild(fs);
  }
  selectTab(state.tab);
}

function fieldEl(group, f) {
  const id = `${group}.${f.name}`;
  const wrap = document.createElement("label");
  wrap.className = "field" + (f.type === "bool" ? " check" : "");
  wrap.title = f.sam ? `PySAM: ${f.sam}` : "";
  let input;
  if (f.type === "bool") {
    input = document.createElement("input"); input.type = "checkbox";
  } else if (f.type === "select") {
    input = document.createElement("select");
    for (const o of f.options) {
      const op = document.createElement("option"); op.value = o.value; op.textContent = o.label; input.appendChild(op);
    }
  } else {
    input = document.createElement("input");
    input.type = f.type === "text" ? "text" : "number";
    if (f.type !== "text") {
      input.step = f.type === "int" ? "1" : "any";
      if (f.ge !== undefined) input.min = f.ge;
      if (f.gt !== undefined) input.min = f.gt;
      if (f.le !== undefined) input.max = f.le;
    }
  }
  input.id = id; input.dataset.group = group; input.dataset.name = f.name; input.dataset.type = f.type;
  const span = document.createElement("span");
  span.innerHTML = `${f.title}${f.unit ? ` <i>${f.unit}</i>` : ""}`;
  if (f.type === "bool") { wrap.append(input, span); } else { wrap.append(span, input); }
  if (f.help) { const s = document.createElement("small"); s.textContent = f.help; wrap.appendChild(s); }
  return wrap;
}

function selectTab(k) {
  state.tab = k;
  $$("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.k === k));
  $$("#form .fieldset").forEach(fs => fs.classList.toggle("on", fs.dataset.k === k));
}

function setValues(values) {
  for (const el of $$("#form [data-group]")) {
    const v = values?.[el.dataset.group]?.[el.dataset.name];
    if (v === undefined) continue;
    if (el.dataset.type === "bool") el.checked = !!v; else el.value = v;
  }
}

function getValues() {
  const out = {};
  for (const el of $$("#form [data-group]")) {
    const g = el.dataset.group, n = el.dataset.name, t = el.dataset.type;
    out[g] = out[g] || {};
    if (t === "bool") out[g][n] = el.checked;
    else if (t === "int") out[g][n] = parseInt(el.value, 10);
    else if (t === "float") out[g][n] = parseFloat(String(el.value).replace(",", "."));
    else out[g][n] = el.value;
  }
  return out;
}

/* ------------------------------------------------------------------ seletores de fonte */
function initSeg(segId, optClass) {
  const seg = $(segId);
  seg.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    $$("button", seg).forEach(x => x.classList.toggle("on", x === b));
    $$(optClass).forEach(o => { o.hidden = o.dataset.for !== b.dataset.v; });
  });
}
const segValue = id => $(`${id} button.on`).dataset.v;

/* ------------------------------------------------------------------ clima */
async function loadWeather() {
  const btn = $("#btn-clima"), fonte = segValue("#clima-fonte");
  const lat = parseFloat($("#local\\.latitude").value), lon = parseFloat($("#local\\.longitude").value);
  btn.disabled = true; $("#clima-resumo").innerHTML = `<span class="spinner"></span>Carregando clima…`;
  try {
    let r;
    if (fonte === "sintetico") {
      const ghi = parseList($("#ghi-mensal").value), temp = parseList($("#temp-mensal").value);
      if (ghi.length !== 12 || temp.length !== 12) throw new Error("Informe 12 valores de GHI e 12 de temperatura.");
      r = await postJSON("/api/clima/sintetico", { latitude: lat, longitude: lon, ghi_mensal: ghi, temp_mensal: temp });
    } else if (fonte === "pvgis") {
      r = await postJSON("/api/clima/pvgis", { latitude: lat, longitude: lon });
    } else if (fonte === "repositorio") {
      r = await postJSON("/api/clima/repositorio", { latitude: lat, longitude: lon });
    } else {
      const file = $("#clima-arquivo").files[0];
      if (!file) throw new Error("Escolha um arquivo de clima.");
      const fd = new FormData(); fd.append("arquivo", file); fd.append("latitude", lat); fd.append("longitude", lon);
      r = await api("/api/clima/arquivo", { method: "POST", body: fd });
    }
    state.weatherId = r.id; state.weather = r;
    const s = r.resumo;
    $("#clima-resumo").innerHTML = `<b>${s.fonte}</b><br>GHI anual <b>${nf(s.ghi_anual_kwh_m2)} kWh/m²</b> ·
      lat ${nf(s.lat, 3)}, lon ${nf(s.lon, 3)} · fuso UTC${s.tz >= 0 ? "+" : ""}${s.tz} · temp. ${nf(s.temp_min_c, 1)} a ${nf(s.temp_max_c, 1)} °C`;
    $("#clima-resumo").classList.remove("muted");
    drawWeather(r);
  } catch (e) {
    $("#clima-resumo").textContent = "Erro: " + e.message;
  } finally { btn.disabled = false; }
}

function baseLayout(extra = {}) {
  const c = colors();
  return Object.assign({
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "system-ui, sans-serif", size: 12, color: c.text2 },
    margin: { l: 56, r: 12, t: 10, b: 40 },
    xaxis: { gridcolor: c.grid, linecolor: c.grid, zeroline: false, tickfont: { color: c.text2 } },
    yaxis: { gridcolor: c.grid, linecolor: c.grid, zeroline: false, tickfont: { color: c.text2 } },
    legend: { orientation: "h", y: -0.18, font: { color: c.text2 } },
    hoverlabel: { bgcolor: c.surface, bordercolor: c.grid, font: { color: c.text } },
    separators: ",.",
  }, extra);
}
const PCFG = { displaylogo: false, responsive: true, modeBarButtonsToRemove: ["lasso2d", "select2d"] };

function drawWeather(r) {
  const c = colors(), s = r.resumo;
  Plotly.react("chart-clima", [{
    type: "bar", x: MESES, y: s.ghi_mensal_kwh_m2_dia, marker: { color: c.fv },
    hovertemplate: "%{x}: %{y:.2f} kWh/m²/dia<extra></extra>", name: "GHI",
  }], baseLayout({ yaxis: { title: { text: "GHI kWh/m²/dia" }, gridcolor: c.grid }, bargap: 0.35, showlegend: false,
    margin: { l: 56, r: 10, t: 6, b: 28 } }), PCFG);
}

/* ------------------------------------------------------------------ carga */
async function loadLoad() {
  const btn = $("#btn-carga"), fonte = segValue("#carga-fonte");
  btn.disabled = true; $("#carga-resumo").innerHTML = `<span class="spinner"></span>Carregando carga…`;
  try {
    let r;
    if (fonte === "sintetica") {
      const lista = parseList($("#consumo-lista").value);
      if (lista.length && lista.length !== 12) throw new Error("Informe 12 valores mensais ou deixe em branco.");
      r = await postJSON("/api/carga/sintetica", {
        consumo_mensal_kwh: parseFloat($("#consumo-mensal").value), perfil: $("#perfil-carga").value,
        consumo_mensal_lista: lista.length ? lista : null,
      });
    } else if (fonte === "repositorio") {
      r = await postJSON("/api/carga/repositorio", {});
    } else {
      const file = $("#carga-arquivo").files[0];
      if (!file) throw new Error("Escolha um arquivo de carga.");
      const fd = new FormData(); fd.append("arquivo", file);
      r = await api("/api/carga/arquivo", { method: "POST", body: fd });
    }
    state.loadId = r.id; state.load = r;
    const s = r.resumo;
    $("#carga-resumo").innerHTML = `<b>${s.fonte}</b><br>Consumo anual <b>${nf(s.consumo_anual_kwh)} kWh</b>
      (${nf(s.consumo_anual_kwh / 12)} kWh/mês) · demanda máx. ${nf(s.demanda_max_kw, 2)} kW · fator de carga ${nf(s.fator_carga, 2)}`;
    $("#carga-resumo").classList.remove("muted");
    drawLoad(r);
  } catch (e) {
    $("#carga-resumo").textContent = "Erro: " + e.message;
  } finally { btn.disabled = false; }
}

function drawLoad(r) {
  const c = colors(), s = r.resumo;
  Plotly.react("chart-carga", [{
    type: "scatter", mode: "lines", x: [...Array(24).keys()], y: s.perfil_medio_diario_kw, name: "Carga média",
    line: { color: c.rede, width: 2, shape: "spline" }, fill: "tozeroy", fillcolor: c.rede + "22",
    hovertemplate: "%{x}h: %{y:.2f} kW<extra></extra>",
  }], baseLayout({ xaxis: { title: { text: "hora do dia" }, dtick: 3, gridcolor: c.grid },
    yaxis: { title: { text: "kW (média)" }, gridcolor: c.grid, rangemode: "tozero" }, showlegend: false,
    margin: { l: 56, r: 10, t: 6, b: 36 } }), PCFG);
}

function redrawPreviews() {
  if (state.weather) drawWeather(state.weather);
  if (state.load) drawLoad(state.load);
}

/* ------------------------------------------------------------------ validação e simulação */
function showValidation(list) {
  $("#validacao").innerHTML = (list || []).map(m =>
    `<div class="msg ${m.nivel}"><span class="tag">${m.nivel === "ok" ? "✓ OK" : m.nivel === "alerta" ? "! ALERTA" : "✕ ERRO"}</span>${m.texto}</div>`).join("");
}

function payload() {
  return Object.assign(getValues(), { weather_id: state.weatherId, load_id: state.loadId });
}

async function validate() {
  try { showValidation((await postJSON("/api/validar", payload())).validacao); }
  catch (e) { showValidation([{ nivel: "erro", texto: e.message }]); }
}

async function simulate() {
  const btn = $("#btn-simular"), st = $("#status");
  if (!state.weatherId) await loadWeather();
  if (!state.loadId) await loadLoad();
  if (!state.weatherId || !state.loadId) { st.textContent = "Carregue clima e carga primeiro."; return; }
  btn.disabled = true;
  st.innerHTML = `<span class="spinner"></span>Simulando com PySAM (8760 h × ${getValues().financeiro.anos_analise} anos)…`;
  const t0 = performance.now();
  try {
    const r = await postJSON("/api/simular", payload());
    showValidation(r.validacao);
    if (!r.ok) { st.textContent = r.erro; return; }
    state.result = r;
    renderResults(r);
    st.textContent = `Concluído em ${nf((performance.now() - t0) / 1000, 1)} s (PySAM ${nf(r.tempo_s, 1)} s).`;
    $("#resultados").scrollIntoView({ behavior: "smooth" });
  } catch (e) {
    st.textContent = "Erro: " + e.message;
    if (/não encontrado/.test(e.message)) { state.weatherId = ""; state.loadId = ""; }
  } finally { btn.disabled = false; }
}

/* ------------------------------------------------------------------ resultados */
function tile(label, value, unit = "", sub = "", cls = "") {
  return `<div class="tile ${cls}"><div class="lbl">${label}</div><div class="val">${value}${unit ? `<small>${unit}</small>` : ""}</div>${sub ? `<div class="sub2">${sub}</div>` : ""}</div>`;
}

function renderResults(r) {
  $("#resultados").hidden = false;
  const k = r.kpis;
  $("#exports").innerHTML = `
    <a href="/api/resultado/${r.id}/dossie.txt"><button class="ghost">Dossiê (.txt)</button></a>
    <a href="/api/resultado/${r.id}/horario.csv"><button class="ghost">Série horária (.csv)</button></a>
    <a href="/api/resultado/${r.id}/fluxo_caixa.csv"><button class="ghost">Fluxo de caixa (.csv)</button></a>
    <a href="/api/resultado/${r.id}/entradas.json"><button class="ghost">Entradas (.json)</button></a>`;

  $("#tiles-econ").innerHTML = [
    tile("VPL", brl(k.vpl_rs), "", `taxa nominal ${nf(k.taxa_desconto_nominal_pct, 2)} %`, k.vpl_rs >= 0 ? "pos" : "neg"),
    tile("TIR", nf(k.tir_pct, 1), "%"),
    tile("Payback simples", nf(k.payback_anos, 1), "anos", `descontado: ${k.payback_descontado_anos ? nf(k.payback_descontado_anos, 1) + " anos" : "não atinge"}`),
    tile("CAPEX", brl(k.capex_rs)),
    tile("Economia no ano 1", brl(k.economia_ano1_rs), "", `fatura ${brl(k.fatura_sem_sistema_ano1_rs)} → ${brl(k.fatura_com_sistema_ano1_rs)}`),
    tile("Fio B pago no ano 1", brl(k.fio_b_ano1_rs)),
    tile("LCOE real", "R$ " + nf(k.lcoe_real_rs_kwh, 3), "/kWh", `nominal R$ ${nf(k.lcoe_nominal_rs_kwh, 3)}`),
    tile("LCOS real", k.lcos_real_rs_kwh === null ? "–" : "R$ " + nf(k.lcos_real_rs_kwh, 3), k.lcos_real_rs_kwh === null ? "" : "/kWh", "custo nivelado do armazenamento"),
  ].join("");
  $("#tiles-tec").innerHTML = [
    tile("Potência FV", nf(k.potencia_fv_kwp, 2), "kWp", `inversor ${nf(k.potencia_inversor_kw, 1)} kW · CC/CA ${nf(k.relacao_cc_ca, 2)}`),
    tile("Geração FV (CA)", nf(k.geracao_fv_ano1_kwh), "kWh", `${nf(k.produtividade_kwh_kwp)} kWh/kWp · PR ${nf(k.performance_ratio, 2)}`),
    tile("Autoconsumo", nf(k.autoconsumo_pct, 1), "%", "da geração usada no local"),
    tile("Autossuficiência", nf(k.autossuficiencia_pct, 1), "%", "da carga sem a rede"),
    tile("Importado da rede", nf(k.importado_rede_kwh), "kWh", `consumo ${nf(k.consumo_anual_kwh)} kWh`),
    tile("Injetado na rede", nf(k.exportado_rede_kwh), "kWh"),
    tile("Bateria", nf(k.bateria_kwh, 1), "kWh", `${nf(k.bateria_ciclos_equivalentes_ano1)} ciclos eq./ano · η ${nf(k.bateria_eficiencia_ciclo_pct, 1)} %`),
    tile("Trocas de bateria", nf(k.bateria_substituicoes), "", `na vida útil`),
    tile("Clipping do inversor", nf(k.perda_clipping_pct, 2), "%"),
  ].join("");

  drawOperation(r);
  drawMonthly(r);
  drawBills(r);
  drawCash(r);
  drawBattery(r);
  renderLosses(r.perdas);
  renderBackup(r.backup);
  renderTariffTable(r.tarifa_mensal_ano1);
  renderCashTable(r.fluxo);
}

function weekRange() {
  const d = new Date($("#semana").value + "T00:00:00Z");
  const start = new Date("2019-01-01T00:00:00Z");
  let h0 = Math.round((d - start) / 3600000);
  h0 = Math.max(0, Math.min(8760 - 168, isNaN(h0) ? 0 : h0));
  return [h0, h0 + 168];
}

function hoursToDates(a, b) {
  const base = Date.UTC(2019, 0, 1);
  const xs = [];
  for (let i = a; i < b; i++) xs.push(new Date(base + i * 3600000).toISOString().slice(0, 16).replace("T", " "));
  return xs;
}

function drawOperation(r) {
  const c = colors(), h = r.horario, [a, b] = weekRange(), x = hoursToDates(a, b);
  const sl = k => h[k].slice(a, b);
  const area = (k, name, color) => ({
    type: "scatter", mode: "lines", stackgroup: "carga", x, y: sl(k), name,
    line: { width: 0.5, color: c.surface, shape: "hv" }, fillcolor: color,
    hovertemplate: `${name}: %{y:.2f} kW<extra></extra>`,
  });
  const traces = [
    area("fv_para_carga", "FV → carga", c.fv),
    area("bateria_para_carga", "Bateria → carga", c.bat),
    area("rede_para_carga", "Rede → carga", c.rede),
    { type: "scatter", mode: "lines", x, y: sl("carga"), name: "Carga", line: { color: c.text, width: 2, shape: "hv" },
      hovertemplate: "Carga: %{y:.2f} kW<extra></extra>" },
    { type: "scatter", mode: "lines", x, y: sl("fv_ca"), name: "Geração FV total", line: { color: c.fv, width: 2, dash: "dot", shape: "hv" },
      hovertemplate: "FV total: %{y:.2f} kW<extra></extra>" },
    { type: "scatter", mode: "lines", x, y: sl("fv_para_rede").map(v => -v), name: "Injeção na rede (−)",
      line: { color: c.exp, width: 2, shape: "hv" }, hovertemplate: "Injeção: %{y:.2f} kW<extra></extra>" },
  ];
  const outs = sl("queda_rede");
  const shapes = [];
  for (let i = 0; i < outs.length; i++) {
    if (outs[i] > 0) shapes.push({ type: "rect", xref: "x", yref: "paper", x0: x[i], x1: x[Math.min(i + 1, x.length - 1)], y0: 0, y1: 1,
      fillcolor: c.critical, opacity: 0.12, line: { width: 0 } });
  }
  Plotly.react("chart-op", traces, baseLayout({ hovermode: "x unified", shapes,
    yaxis: { title: { text: "kW" }, gridcolor: c.grid, zeroline: true, zerolinecolor: c.muted },
    xaxis: { gridcolor: c.grid, type: "date" } }), PCFG);
  Plotly.react("chart-soc", [{
    type: "scatter", mode: "lines", x, y: sl("soc"), name: "SOC", line: { color: c.bat, width: 2 },
    fill: "tozeroy", fillcolor: c.bat + "22", hovertemplate: "SOC: %{y:.1f} %<extra></extra>",
  }], baseLayout({ hovermode: "x unified", showlegend: false, shapes,
    yaxis: { title: { text: "SOC %" }, range: [0, 100], gridcolor: c.grid }, xaxis: { gridcolor: c.grid, type: "date" },
    margin: { l: 56, r: 12, t: 6, b: 30 } }), PCFG);
}

function drawMonthly(r) {
  const c = colors(), m = r.mensal;
  const bar = (y, name, color) => ({ type: "bar", x: MESES, y, name, marker: { color, line: { color: c.surface, width: 1 } },
    hovertemplate: `${name}: %{y:,.0f} kWh<extra></extra>` });
  Plotly.react("chart-mensal", [
    bar(m.fv_para_carga, "FV → carga", c.fv),
    bar(m.bateria_para_carga, "Bateria → carga", c.bat),
    bar(m.rede_para_carga, "Rede → carga", c.rede),
  ], baseLayout({ barmode: "stack", bargap: 0.3, hovermode: "x unified", yaxis: { title: { text: "kWh" }, gridcolor: c.grid } }), PCFG);
  Plotly.react("chart-destino", [
    bar(m.fv_para_carga, "Consumo direto", c.fv),
    bar(m.fv_para_bateria, "Carga da bateria", c.bat),
    bar(m.fv_para_rede, "Injeção na rede", c.exp),
  ], baseLayout({ barmode: "stack", bargap: 0.3, hovermode: "x unified", yaxis: { title: { text: "kWh" }, gridcolor: c.grid } }), PCFG);
}

function drawBills(r) {
  const c = colors(), t = r.tarifa_mensal_ano1;
  Plotly.react("chart-fatura", [
    { type: "bar", x: MESES, y: t.map(v => v.fatura_sem_sistema_rs), name: "Sem sistema", marker: { color: c.neutral },
      hovertemplate: "Sem sistema: R$ %{y:,.2f}<extra></extra>" },
    { type: "bar", x: MESES, y: t.map(v => v.fatura_com_sistema_rs), name: "Com sistema", marker: { color: c.rede },
      hovertemplate: "Com sistema: R$ %{y:,.2f}<extra></extra>" },
  ], baseLayout({ barmode: "group", bargap: 0.3, bargroupgap: 0.08, hovermode: "x unified",
    yaxis: { title: { text: "R$" }, gridcolor: c.grid } }), PCFG);
}

function drawCash(r) {
  const c = colors(), f = r.fluxo;
  Plotly.react("chart-caixa", [
    { type: "bar", x: f.ano, y: f.fluxo_caixa, name: "Fluxo anual",
      marker: { color: f.fluxo_caixa.map(v => v >= 0 ? c.rede : c.exp) },
      hovertemplate: "Ano %{x}: R$ %{y:,.0f}<extra>Fluxo anual</extra>" },
    { type: "scatter", mode: "lines+markers", x: f.ano, y: f.acumulado, name: "Acumulado", line: { color: c.text, width: 2 },
      marker: { size: 6 }, hovertemplate: "Ano %{x}: R$ %{y:,.0f}<extra>Acumulado</extra>" },
    { type: "scatter", mode: "lines", x: f.ano, y: f.acumulado_descontado, name: "Acumulado descontado",
      line: { color: c.neutral, width: 2, dash: "dash" }, hovertemplate: "Ano %{x}: R$ %{y:,.0f}<extra>Descontado</extra>" },
  ], baseLayout({ hovermode: "x unified", legend: { orientation: "h", y: -0.3, font: { color: c.text2 } }, yaxis: { title: { text: "R$" }, gridcolor: c.grid, zeroline: true, zerolinecolor: c.muted },
    xaxis: { title: { text: "ano" }, gridcolor: c.grid } }), PCFG);
}

function drawBattery(r) {
  const c = colors(), f = r.fluxo;
  const el = $("#chart-bateria");
  if (!f.capacidade_bateria_pct || !f.capacidade_bateria_pct.length) {
    Plotly.purge(el); el.innerHTML = `<p class="muted">Sem bateria nesta simulação.</p>`; return;
  }
  el.innerHTML = "";
  const repl = (f.substituicoes_bateria || []).map((v, i) => v > 0 ? i : null).filter(v => v !== null);
  Plotly.react(el, [{
    type: "scatter", mode: "lines+markers", x: f.ano.slice(1), y: f.capacidade_bateria_pct.slice(1), name: "Capacidade mínima no ano",
    line: { color: c.bat, width: 2 }, marker: { size: 6 }, hovertemplate: "Ano %{x}: %{y:.1f} %<extra></extra>",
  }], baseLayout({ showlegend: false, yaxis: { title: { text: "% da capacidade nominal" }, range: [0, 105], gridcolor: c.grid },
    xaxis: { title: { text: "ano" }, gridcolor: c.grid },
    annotations: repl.map(y => ({ x: y, y: 100, text: "troca", showarrow: true, arrowhead: 0, ay: -20, font: { color: c.text2, size: 11 } })) }), PCFG);
}

function renderLosses(p) {
  const rows = [
    ["Irradiação no plano (nominal)", nf(p.irradiacao_poa_nominal_kwh) + " kWh"],
    ["Sombreamento", nf(p.sombreamento_pct, 2) + " %"],
    ["Sujeira", nf(p.sujeira_pct, 2) + " %"],
    ["Reflexão (ângulo de incidência)", nf(p.reflexao_pct, 2) + " %"],
    ["Energia CC nominal", nf(p.cc_nominal_kwh) + " kWh"],
    ["Módulo (temperatura/irradiância)", nf(p.modulo_temperatura_pct, 2) + " %"],
    ["Limite MPPT", nf(p.mppt_clipping_pct, 2) + " %"],
    ["Descasamento + diodos", nf((p.mismatch_pct || 0) + (p.diodos_pct || 0), 2) + " %"],
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
  $("#tabela-perdas").innerHTML = `<table><thead><tr><th>Etapa</th><th>Valor</th></tr></thead><tbody>${
    rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join("")}</tbody></table>`;
}

function renderBackup(b) {
  $("#bloco-backup").hidden = !b;
  if (!b) return;
  const fmtH = h => { const d = new Date(Date.UTC(2019, 0, 1) + h * 3600000); return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:00`; };
  $("#tabela-backup").innerHTML = `<p>${nf(b.horas_queda)} h de queda · carga crítica ${nf(b.carga_critica_kwh, 1)} kWh ·
    não atendida ${nf(b.nao_atendida_kwh, 1)} kWh · <b>${nf(b.atendida_pct, 1)} % atendida</b></p>
    <div class="table-wrap"><table><thead><tr><th>Início</th><th>Duração (h)</th><th>SOC no início (%)</th>
    <th>Carga crítica (kWh)</th><th>Não atendida (kWh)</th><th>Atendida (%)</th></tr></thead><tbody>${
    b.eventos.map(e => `<tr><td>${fmtH(e.inicio_hora)}</td><td>${e.duracao_h}</td><td>${nf(e.soc_inicio_pct, 1)}</td>
      <td>${nf(e.carga_critica_kwh, 2)}</td><td>${nf(e.nao_atendida_kwh, 2)}</td><td>${nf(e.atendida_pct, 1)}</td></tr>`).join("")}
    </tbody></table></div>`;
}

function renderTariffTable(t) {
  $("#tabela-tarifa").innerHTML = `<table><thead><tr><th>Mês</th><th>Rede (kWh)</th><th>Injetado (kWh)</th>
    <th>Compensado (kWh)</th><th>Crédito acumulado (kWh)</th><th>Fio B (R$)</th><th>Fatura sem sistema (R$)</th>
    <th>Fatura com sistema (R$)</th><th>Mínimo?</th></tr></thead><tbody>${
    t.map((m, i) => `<tr><td>${MESES[i]}</td><td>${nf(m.consumo_rede_kwh)}</td><td>${nf(m.injetado_kwh)}</td>
      <td>${nf(m.compensado_kwh)}</td><td>${nf(m.credito_acumulado_kwh)}</td><td>${nf(m.fio_b_rs, 2)}</td>
      <td>${nf(m.fatura_sem_sistema_rs, 2)}</td><td>${nf(m.fatura_com_sistema_rs, 2)}</td><td>${m.minimo_aplicado ? "sim" : ""}</td></tr>`).join("")}
    </tbody></table>`;
}

function renderCashTable(f) {
  const n = f.ano.length, g = (k, i) => (f[k] && f[k][i] !== undefined) ? f[k][i] : null;
  let rows = "";
  for (let i = 0; i < n; i++) {
    rows += `<tr><td>${i}</td><td>${nf(g("energia_entregue_kwh", i))}</td><td>${nf(g("fatura_sem", i))}</td>
      <td>${nf(g("fatura_com", i))}</td><td>${nf(g("economia", i))}</td><td>${g("percentual_fio_b", i) === null ? "" : nf(g("percentual_fio_b", i)) + " %"}</td>
      <td>${nf(g("om", i))}</td><td>${nf(g("reposicao_bateria", i))}</td><td>${nf(g("fluxo_caixa", i))}</td>
      <td>${nf(g("acumulado", i))}</td><td>${g("capacidade_bateria_pct", i) === null ? "" : nf(g("capacidade_bateria_pct", i), 1) + " %"}</td></tr>`;
  }
  $("#tabela-caixa").innerHTML = `<table><thead><tr><th>Ano</th><th>Energia (kWh)</th><th>Fatura sem (R$)</th>
    <th>Fatura com (R$)</th><th>Economia (R$)</th><th>Fio B</th><th>O&amp;M (R$)</th><th>Reposição bateria (R$)</th>
    <th>Fluxo (R$)</th><th>Acumulado (R$)</th><th>Cap. bateria</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/* ------------------------------------------------------------------ salvar/abrir entradas */
function saveJSON() {
  const blob = new Blob([JSON.stringify(getValues(), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "entradas_simulador_hibrido.json"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function openJSON(e) {
  const file = e.target.files[0]; if (!file) return;
  try { setValues(JSON.parse(await file.text())); $("#status").textContent = `Entradas carregadas de ${file.name}.`; }
  catch (err) { $("#status").textContent = "Arquivo JSON inválido: " + err.message; }
  e.target.value = "";
}

/* ------------------------------------------------------------------ início */
async function init() {
  initTheme();
  const s = await api("/api/esquema");
  state.schema = s.grupos; state.defaults = s.padrao;
  buildForm(); setValues(s.padrao);
  $("#ghi-mensal").value = s.ghi_pelotas.join("; ");
  $("#temp-mensal").value = s.temp_pelotas.join("; ");
  $("#perfil-carga").innerHTML = s.perfis_carga.map(p => `<option value="${p}">${p[0].toUpperCase() + p.slice(1)}</option>`).join("");
  if (!s.repositorio_csv) $$('button[data-v="repositorio"]').forEach(b => b.disabled = true);
  initSeg("#clima-fonte", ".clima-opt");
  initSeg("#carga-fonte", ".carga-opt");
  $("#btn-clima").onclick = loadWeather;
  $("#btn-carga").onclick = loadLoad;
  $("#btn-validar").onclick = validate;
  $("#btn-simular").onclick = simulate;
  $("#btn-padrao").onclick = () => setValues(state.defaults);
  $("#btn-salvar").onclick = saveJSON;
  $("#abrir-json").onchange = openJSON;
  $("#semana").onchange = () => state.result && drawOperation(state.result);
  // a carga/clima mudam → invalida o id carregado
  ["#ghi-mensal", "#temp-mensal"].forEach(id => $(id).addEventListener("change", () => { state.weatherId = ""; }));
  ["#consumo-mensal", "#perfil-carga", "#consumo-lista"].forEach(id => $(id).addEventListener("change", () => { state.loadId = ""; }));
  await Promise.all([loadWeather(), loadLoad()]);
}
init().catch(e => { $("#status").textContent = "Falha ao iniciar: " + e.message; });
