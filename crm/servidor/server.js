/**
 * Delta CRM — servidor para Docker (substitui o Google Apps Script).
 *
 * O front-end (../index.html) não muda: o arquivo /gas-shim.js cria um "google.script.run" falso que
 * chama /api/<funcao> aqui. Assim o CRM roda no "modo Google", mas com Postgres no lugar da Planilha,
 * a tabela "arquivos" no lugar do Drive, SMTP no lugar do Gmail e Gotenberg para gerar PDF.
 */
'use strict';
const express = require('express');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORTA = +process.env.PORT || 8080;
const URL_PUBLICA = (process.env.PUBLIC_URL || `http://localhost:${PORTA}`).replace(/\/+$/, '') + '/';
const USUARIOS = Object.fromEntries(String(process.env.CRM_USUARIOS || 'admin@deltasolar.local:troque-esta-senha')
  .split(',').map(s => s.trim()).filter(Boolean).map(s => { const i = s.lastIndexOf(':'); return [s.slice(0, i), s.slice(i + 1)]; }));
const COLS = ['clientes', 'kits', 'negocios', 'propostas', 'usinas', 'contratos', 'titulos', 'visitas', 'contratosVenda'];
const PUBLICAS = new Set(['aceitarPublico', 'recusarPublico', 'assinarContratoPublico']);
const INDEX = path.join(__dirname, 'index.html');
const BACKUP_DIR = process.env.BACKUP_DIR || '/backups';

const db = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://crm:crm@db:5432/crm' });
const smtp = process.env.SMTP_HOST ? nodemailer.createTransport({
  host: process.env.SMTP_HOST, port: +process.env.SMTP_PORT || 587, secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
}) : null;
const REMETENTE = process.env.SMTP_FROM || 'Delta Solar <contato@deltasolar.com.br>';

/* ---------------- banco ---------------- */
async function iniciarBanco() {
  for (let i = 0; i < 30; i++) { try { await db.query('select 1'); break; } catch (e) { await new Promise(r => setTimeout(r, 1000)); } }
  await db.query(`
    create table if not exists registros(colecao text not null, id text not null, dados jsonb not null,
      excluido boolean not null default false, atualizado_em timestamptz not null default now(), atualizado_por text,
      primary key(colecao,id));
    create table if not exists config(chave text primary key, dados jsonb not null, atualizado_em timestamptz default now());
    create table if not exists sequencias(nome text primary key, valor int not null);
    create table if not exists arquivos(id text primary key, pasta text, nome text, mime text, dados bytea not null, criado_em timestamptz default now());
    create table if not exists perfis(usuario text primary key, dados jsonb not null);
    create table if not exists contratos_html(id text primary key, html text not null, atualizado_em timestamptz default now());
    create table if not exists log(id bigserial primary key, quando timestamptz default now(), usuario text, acao text, detalhe text);
  `);
}
/* JSON com chaves ordenadas: o banco não preserva a ordem, então comparamos e assinamos sempre nesta forma */
const canon = v => JSON.stringify(v === undefined ? null : v, (k, val) => (val && typeof val === 'object' && !Array.isArray(val)) ? Object.keys(val).sort().reduce((a, kk) => { a[kk] = val[kk]; return a; }, {}) : val);
const log = (usuario, acao, detalhe) => db.query('insert into log(usuario,acao,detalhe) values($1,$2,$3)', [usuario || 'público', acao, String(detalhe || '').slice(0, 500)]).catch(() => {});
async function lerCol(c, q = db) { const r = await q.query('select dados from registros where colecao=$1 and not excluido order by atualizado_em', [c]); return r.rows.map(x => x.dados); }
async function lerReg(c, id, q = db, travar = false) { const r = await q.query(`select dados from registros where colecao=$1 and id=$2 and not excluido${travar ? ' for update' : ''}`, [c, id]); return r.rows[0] ? r.rows[0].dados : null; }
async function gravarReg(c, o, usuario, q = db) {
  await q.query(`insert into registros(colecao,id,dados,atualizado_por) values($1,$2,$3,$4)
    on conflict(colecao,id) do update set dados=excluded.dados,excluido=false,atualizado_em=now(),atualizado_por=excluded.atualizado_por`, [c, o.id, o, usuario || null]);
}
async function proximo(nome, inicio, q = db) {
  const r = await q.query(`insert into sequencias(nome,valor) values($1,$2) on conflict(nome) do update set valor=sequencias.valor+1 returning valor`, [nome, inicio]);
  return r.rows[0].valor;
}
async function transacao(fn) { const c = await db.connect(); try { await c.query('begin'); const r = await fn(c); await c.query('commit'); return r; } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); } }

/* ---------------- utilidades ---------------- */
const uid = () => crypto.randomBytes(6).toString('base64url').slice(0, 8);
const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const agora = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const num = v => { const x = parseFloat(v); return isFinite(x) ? x : 0; };
const soDig = s => String(s || '').replace(/\D/g, '');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = v => num(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const iguais = (a, b) => String(a || '') !== '' && crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(String(b || '')).digest());

/* ---------------- arquivos, PDF e e-mail ---------------- */
async function salvarArquivoBin(pasta, nome, mime, buf) {
  const id = 'f_' + crypto.randomBytes(9).toString('base64url');
  await db.query('insert into arquivos(id,pasta,nome,mime,dados) values($1,$2,$3,$4,$5)', [id, pasta, nome, mime, buf]);
  return { id, url: URL_PUBLICA + 'arquivo/' + id };
}
const CSS_PDF = `<style>body{font-family:"Times New Roman",serif;font-size:12.5px;color:#111;margin:0}.ct-doc{padding:0}.ct-dh{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;margin-bottom:14px;font-family:Arial;font-size:11px}.ct-dh img{height:42px}h1{font-size:14px;text-align:center}p{text-align:justify;margin:0 0 7px}.ct-bul{margin-left:18px}table{width:100%;border-collapse:collapse;font-family:Arial;font-size:11px;margin:6px 0 10px}th,td{border:1px solid #444;padding:4px 6px}th{background:#eef1ec}.r{text-align:right}.ct-sigs{margin-top:20px}.ct-sig{margin-top:18px;page-break-inside:avoid}.ct-sig .ln{border-bottom:1px solid #111;height:52px}.ct-sig img{max-height:50px}.ct-sig small{display:block;font-family:Arial;font-size:10px}.ct-test{display:flex;gap:30px;font-size:11px}.ct-test>div{flex:1}.ct-cert{margin-top:18px;border:1.5px solid #1c9a68;padding:8px 10px;font-family:Arial;font-size:10px;background:#f4fbf7;page-break-inside:avoid}.ct-cert code{font-size:9px;word-break:break-all}.ct-df{margin-top:16px;border-top:2px solid #111;text-align:center;font-family:Arial;font-size:9.5px}tr{page-break-inside:avoid}</style>`;
async function htmlParaPdf(html) {
  const url = process.env.GOTENBERG_URL; if (!url) return null;
  const fd = new FormData();
  fd.append('files', new Blob([`<!doctype html><html><head><meta charset="utf-8">${CSS_PDF}</head><body>${html}</body></html>`], { type: 'text/html' }), 'index.html');
  fd.append('marginTop', '0.6'); fd.append('marginBottom', '0.6'); fd.append('marginLeft', '0.6'); fd.append('marginRight', '0.6');
  for (let t = 1; t <= 3; t++) { // o Chromium do Gotenberg às vezes falha na 1ª chamada (ex.: subindo o navegador)
    try { const r = await fetch(url.replace(/\/+$/, '') + '/forms/chromium/convert/html', { method: 'POST', body: fd }); if (!r.ok) throw new Error('HTTP ' + r.status); return Buffer.from(await r.arrayBuffer()); }
    catch (e) { console.warn(`PDF tentativa ${t}/3 falhou (Gotenberg):`, e.message); if (t < 3) await new Promise(r => setTimeout(r, 3000)); }
  }
  return null;
}
async function enviarEmail(m) {
  if (!smtp) { console.warn('SMTP não configurado; e-mail não enviado para', m.to); return false; }
  await smtp.sendMail(Object.assign({ from: REMETENTE }, m)); return true;
}
function htmlAssinado(c, htmlBase) {
  const a = (c.assin || {}).cliente, e = (c.assin || {}).empresa, s = c.snap || {};
  if (!a || /ct-cert/.test(htmlBase)) return htmlBase; // o HTML já veio com assinaturas e certificado
  return htmlBase + `<div style="page-break-inside:avoid;margin-top:18px"><b>Assinaturas eletrônicas</b>
    <div class="ct-sig"><div class="ln">${a.img ? `<img src="${a.img}">` : ''}</div><b>CONTRATANTE: ${esc(a.nome)}</b><small>${esc(a.tipoDoc || 'CPF')} ${esc(a.doc)} · ${esc(a.quando)}</small></div>
    ${e ? `<div class="ct-sig"><div class="ln">${e.img ? `<img src="${e.img}">` : ''}</div><b>CONTRATADA: ${esc(e.nome)}</b><small>${esc(e.quando)}</small></div>` : ''}
    <div class="ct-cert"><b>Certificado de assinatura eletrônica</b><br>Documento ${esc(s.codigo)} · emitido em ${esc(s.emitidoEm)}<br>CONTRATANTE: ${esc(a.nome)} · ${esc(a.tipoDoc || 'CPF')} ${esc(a.doc)} · ${esc(a.quando)}${a.email ? ' · ' + esc(a.email) : ''}${a.ip ? ' · IP ' + esc(a.ip) : ''}<br>Aparelho: ${esc(a.agente)}${e ? `<br>CONTRATADA: ${esc(e.nome)} · ${esc(e.quando)}` : ''}<br>SHA-256 do texto assinado: <code>${esc(s.hash)}</code><br>Assinatura eletrônica nos termos da Lei nº 14.063/2020 e do art. 10, § 2º, da MP nº 2.200-2/2001.</div></div>`;
}
async function pdfContrato(c) {
  const r = await db.query('select html from contratos_html where id=$1', [c.id]); if (!r.rows[0]) return null;
  const pdf = await htmlParaPdf(htmlAssinado(c, r.rows[0].html)); if (!pdf) return null;
  const nome = `Contrato ${(c.snap || {}).codigo || c.id}${(c.assin || {}).cliente ? ' - assinado' : ''}.pdf`;
  const up = await salvarArquivoBin('Contratos/' + ((c.parte || {}).nome || 'Cliente'), nome, 'application/pdf', pdf);
  return { pdf, nome, url: up.url };
}

/* ---------------- regras copiadas do aceite da proposta (iguais às do navegador) ---------------- */
const PARCELAS = [['Sinal (30%)', .3, 3], ['Na instalação (40%)', .4, 30], ['Na conexão (30%)', .3, 60]];
function opsDe(s) {
  return s.opcoes && s.opcoes.length ? s.opcoes : [{ id: 'A', nome: 'Sistema proposto', kwp: s.kwp, nMod: s.nMod, modWp: s.modWp, final: s.final, fins: s.fins || [], itens: s.itens, inversor: s.inversor,
    pagto: { obra: PARCELAS.map(x => ({ nome: x[0].replace(/ \(.*/, ''), pct: x[1] * 100, dias: x[2], valor: Math.round(s.final * x[1] * 100) / 100 })) } }];
}
function titulosDoAceite(s, op, forma) {
  const pg = op.pagto || {}, out = []; forma = String(forma || 'obra');
  if (forma === 'pix' && pg.pix) out.push({ desc: 'PIX à vista', valor: pg.pix.valor, dias: 3 });
  else if (forma.indexOf('cartao:') === 0 && (pg.cartao || []).length) { const n = +forma.split(':')[1]; const k = pg.cartao.find(x => x.n === n) || pg.cartao[0]; for (let i = 1; i <= k.n; i++)out.push({ desc: `Cartão ${i}/${k.n}`, valor: Math.round(k.pmt * 100) / 100, dias: 30 * i }); }
  else if (forma.indexOf('fin:') === 0 && (op.fins || []).length) { const [i, n] = forma.slice(4).split('|'); const f = op.fins[+i] || op.fins[0]; const ent = num(s.entrada); if (ent > 0) out.push({ desc: 'Entrada do financiamento', valor: ent, dias: 3 }); out.push({ desc: `Liberação do financiamento (${f.nome}, ${n}×)`, valor: Math.round((op.final - ent) * 100) / 100, dias: 45 }); }
  if (!out.length) (pg.obra || []).forEach(o => out.push({ desc: `${o.nome} (${o.pct}%)`, valor: o.valor, dias: o.dias }));
  return out;
}
function formaNome(op, f) { f = String(f || 'obra'); if (f === 'pix') return 'PIX à vista'; if (f.indexOf('cartao:') === 0) return 'Cartão ' + f.split(':')[1] + '×'; if (f.indexOf('fin:') === 0) return 'Financiamento'; return 'Parcelas da obra'; }
const pubProp = p => ({ snap: p.snap, status: p.status, aceite: p.aceite || null });
const pubCt = c => ({ snap: c.snap, status: c.status, assin: c.assin || {} });

/* ---------------- tarifa de energia (ANEEL, dados abertos) ----------------
   Fonte: CSV de tarifas das distribuidoras (dados abertos da ANEEL). A Equatorial RS aparece como CEEE-Equatorial.
   Defina TARIFA_CSV_URL no .env com o endereço do CSV. Valores da ANEEL vêm em R$/MWh; aqui convertemos para R$/kWh. */
const TARIFA_CSV_URL = process.env.TARIFA_CSV_URL || '';
async function lerCfg() { const r = await db.query("select dados from config where chave='config'"); return ((r.rows[0] || {}).dados || {}).cfg || {}; }
async function gravarCfgParcial(parcial) {
  const r = await db.query("select dados from config where chave='config'"); const d = (r.rows[0] || {}).dados || {};
  d.cfg = Object.assign({}, d.cfg || {}, parcial);
  await db.query(`insert into config(chave,dados) values('config',$1) on conflict(chave) do update set dados=excluded.dados,atualizado_em=now()`, [d]);
}
/* Lê o CSV e devolve a tarifa B1 residencial convencional vigente (TUSD + TE), sem impostos, em R$/kWh */
function tarifaDoCsv(texto, hojeIso) {
  const linhas = texto.split(/\r?\n/).filter(l => l.trim()); if (linhas.length < 2) throw new Error('CSV de tarifas vazio');
  const sep = linhas[0].includes(';') ? ';' : ',';
  const cab = linhas[0].split(sep).map(x => x.trim().replace(/^"|"$/g, ''));
  const pos = n => cab.indexOf(n);
  const col = { ag: pos('SigAgente'), ini: pos('DatInicioVigencia'), fim: pos('DatFimVigencia'), grupo: pos('DscSubGrupo'), classe: pos('DscClasseConsumidor'), mod: pos('DscModalidadeTarifaria'), tusd: pos('VlrTUSD'), te: pos('VlrTE'), det: pos('DscDetalhe') };
  const falta = Object.keys(col).filter(k => col[k] < 0); if (falta.length) throw new Error('CSV sem as colunas esperadas: ' + falta.join(', '));
  const numBr = v => parseFloat(String(v || '').replace(/"/g, '').replace(/\./g, '').replace(',', '.'));
  const sigla = { v: null };
  for (const l of linhas.slice(1)) {
    const c = l.split(sep).map(x => x.trim().replace(/^"|"$/g, ''));
    const ag = c[col.ag] || '';
    if (!/CEEE|EQUATORIAL/i.test(ag)) continue;
    if ((c[col.grupo] || '').toUpperCase() !== 'B1') continue;
    if (!/residencial/i.test(c[col.classe] || '') || !/convencional/i.test(c[col.mod] || '')) continue;
    if (/ponta/i.test(c[col.det] || '')) continue;
    const ini = c[col.ini] || '', fim = c[col.fim] || '';
    if (fim && fim < hojeIso) continue;               // já encerrada
    let tusd = numBr(c[col.tusd]), te = numBr(c[col.te]);
    if (!(tusd > 0 || te > 0)) continue;
    if (tusd > 5) tusd /= 1000; if (te > 5) te /= 1000;   // R$/MWh -> R$/kWh
    // Vale o reajuste mais recente anunciado (mesmo que ainda não esteja em vigor)
    if (!sigla.v || ini >= sigla.v.inicio) sigla.v = { sem: tusd + te, sigla: ag, inicio: ini };
  }
  if (!sigla.v) throw new Error('Nenhuma tarifa B1 residencial convencional vigente para a Equatorial RS no CSV');
  return { semImpostos: Math.round(sigla.v.sem * 10000) / 10000, sigla: sigla.v.sigla, inicio: sigla.v.inicio, anunciada: sigla.v.inicio > hojeIso };
}
async function atualizarTarifaAneel(imp) {
  if (!TARIFA_CSV_URL) throw new Error('Fonte não configurada: defina TARIFA_CSV_URL no .env (CSV de tarifas da ANEEL).');
  const r = await fetch(TARIFA_CSV_URL, { headers: { 'User-Agent': 'Delta-CRM/1.0' } });
  if (!r.ok) throw new Error('A fonte respondeu HTTP ' + r.status);
  const t = tarifaDoCsv(await r.text(), hoje());
  // Aproximação: ICMS e PIS/COFINS "por dentro" sobre a tarifa. Confirmar as alíquotas vigentes.
  const tarifa = Math.round(t.semImpostos / (1 - (imp.icms + imp.pisCofins) / 100) * 10000) / 10000;
  return { tarifa, semImpostos: t.semImpostos, icms: imp.icms, pisCofins: imp.pisCofins, obtidoEm: agora(),
    anunciada: t.anunciada, vigencia: t.inicio,
    fonte: `ANEEL · ${t.sigla} · B1 residencial convencional · ${t.anunciada ? 'reajuste anunciado para vigorar em' : 'vigente desde'} ${t.inicio.split('-').reverse().join('/')}` };
}
async function aplicarTarifa(imp) {
  const r = await atualizarTarifaAneel(imp);
  const ta = (await lerCfg()).tarifaAuto || {};
  await gravarCfgParcial({ tarifa: r.tarifa, tarifaAuto: Object.assign({}, ta, { modo: 'automatica', icms: r.icms, pisCofins: r.pisCofins, fonte: r.fonte, obtidoEm: r.obtidoEm, erro: '' }) });
  return r;
}
/* Atualização diária (só quando o modo é automático). Se falhar, mantém o último valor e registra o erro. */
async function tarifaDiaria() {
  const ta = (await lerCfg()).tarifaAuto || {}; if (ta.modo === 'manual') return;
  try { await aplicarTarifa({ icms: num(ta.icms ?? 25), pisCofins: num(ta.pisCofins ?? 5) }); }
  catch (e) { console.warn('Tarifa:', e.message); await gravarCfgParcial({ tarifaAuto: Object.assign({}, ta, { erro: String(e.message).slice(0, 200), tentadoEm: agora() }) }).catch(() => {}); }
}

/* Depois da assinatura do cliente: PDF, link guardado e e-mails. Roda fora da resposta; se falhar, a assinatura já está salva. */
async function posAssinatura(c) {
  try {
    const p = await pdfContrato(c);
    if (p) { c.pdfUrl = p.url; await db.query("update registros set dados=jsonb_set(dados,'{pdfUrl}',to_jsonb($3::text)) where colecao=$1 and id=$2", ['contratosVenda', c.id, p.url]); }
    const anexos = p ? [{ filename: p.nome, content: p.pdf }] : [];
    const para = [c.assin.cliente.email, (c.parte || {}).email].filter((x, i, a) => x && a.indexOf(x) === i);
    for (const to of para) await enviarEmail({ to, subject: `Contrato ${c.snap.codigo} assinado`, text: `Olá, ${c.assin.cliente.nome}!\n\nRecebemos a sua assinatura do contrato ${c.snap.codigo} em ${c.assin.cliente.quando}. A via assinada segue em anexo.\nCódigo de integridade (SHA-256): ${c.snap.hash}\n\n${(c.snap.empresa || {}).nome || ''}`, attachments: anexos });
    const emp = (c.snap.empresa || {}).email;
    if (emp) await enviarEmail({ to: emp, subject: `✍ Contrato ${c.snap.codigo} assinado por ${c.assin.cliente.nome}`, text: `O cliente assinou online em ${c.assin.cliente.quando}. Falta a contra-assinatura da empresa no CRM.${c.pdfUrl ? '\nPDF: ' + c.pdfUrl : ''}`, attachments: anexos });
    log('público', 'pos-assinatura', c.id + (p ? ' com PDF' : ' sem PDF'));
  } catch (e) { console.warn('Pós-assinatura:', e.message); }
}

/* ---------------- funções chamadas pelo navegador (mesmos nomes do Apps Script) ---------------- */
const FUN = {
  async carregarTudo(u) {
    const dados = {}; for (const c of COLS) dados[c] = await lerCol(c);
    const cf = await db.query("select dados from config where chave='config'");
    const pf = await db.query('select dados from perfis where usuario=$1', [u]);
    return { usuario: u, dados, config: cf.rows[0] ? cf.rows[0].dados : null, perfil: pf.rows[0] ? pf.rows[0].dados : null, urlPublica: URL_PUBLICA, links: {} };
  },
  async salvarAlteracoes(u, ch) {
    return transacao(async q => {
      const nums = [];
      for (const [col, lista] of Object.entries(ch.upserts || {})) {
        if (!COLS.includes(col)) throw new Error('Coleção desconhecida: ' + col);
        for (const o of lista) {
          if (!o || !o.id) continue;
          const atual = await lerReg(col, o.id, q, true);
          if (col === 'propostas' && atual && atual.status && atual.status !== 'rascunho') {
            // Proposta já enviada: o conteúdo (foto e premissas) só muda numa reemissão deliberada
            const reemissao = (o.emissoes || 0) > (atual.emissoes || 0);
            // Campos novos nas premissas (migração) são aceitos; mudar um valor já gravado não é
            const premissasMudaram = Object.keys(atual.parametros || {}).some(k => canon((o.parametros || {})[k]) !== canon(atual.parametros[k]));
            const mudou = canon(o.snap) !== canon(atual.snap) || premissasMudaram;
            if (mudou && !reemissao) throw new Error('Proposta enviada ao cliente: o conteúdo está bloqueado. Use Nova versão.');
          }
          if (col === 'propostas' && atual) {
            for (const k of ['status', 'modoPreco', 'margem', 'markup', 'precoWp', 'preco', 'desconto', 'parcela', 'validade', 'tipoProposta', 'templateId', 'emissoes'])
              if (canon(o[k]) !== canon(atual[k])) log(u, 'proposta:' + k, `${o.id} v${o.versao || 1}: ${canon(atual[k])} → ${canon(o[k])}`);
          }
          if (col === 'propostas' && o.status && o.status !== 'rascunho' && o.snap && (!atual || atual.status === 'rascunho' || (o.emissoes || 0) > ((atual && atual.emissoes) || 0))) {
            o.integridade = crypto.createHash('sha256').update(canon(o.snap)).digest('hex');
            nums.push({ col, id: o.id, integridade: o.integridade });
          }
          // Uma tela aberta há tempo não desfaz o que o cliente fez pelo link público
          if (atual && col === 'propostas' && ['aceita', 'recusada'].includes(atual.status) && o.status !== atual.status) { o.status = atual.status; o.aceite = atual.aceite; o.log = atual.log; }
          if (atual && col === 'contratosVenda' && atual.assin && atual.assin.cliente && !(o.assin && o.assin.cliente)) { o.assin = Object.assign({}, o.assin, { cliente: atual.assin.cliente }); if (!['concluido', 'cancelado'].includes(o.status)) o.status = atual.status; o.visualizadoEm = atual.visualizadoEm; o.log = atual.log; }
          if (atual && col === 'contratosVenda' && atual.visualizadoEm && !o.visualizadoEm) { o.visualizadoEm = atual.visualizadoEm; if (o.status === 'enviado') o.status = 'visualizado'; }
          if (o.num == null && ['propostas', 'contratos', 'contratosVenda'].includes(col)) {
            o.num = atual && atual.num != null ? atual.num : await proximo(col, col === 'propostas' ? 101 : 1, q);
            const x = { col, id: o.id, num: o.num };
            if (col === 'contratosVenda' && !/^CT-\d{4}-\d{3,}$/.test(o.codigo || '')) { o.codigo = `CT-${new Date().getFullYear()}-${String(o.num).padStart(3, '0')}`; if (o.snap) o.snap.codigo = o.codigo; x.codigo = o.codigo; }
            if (o.snap) o.snap.num = o.num;
            nums.push(x);
          }
          await gravarReg(col, o, u, q);
        }
      }
      for (const [col, ids] of Object.entries(ch.deletes || {})) for (const id of ids)
        await q.query('update registros set excluido=true,atualizado_em=now(),atualizado_por=$3 where colecao=$1 and id=$2', [col, id, u]);
      if (ch.config) {
        const cur = ((await q.query("select dados from config where chave='config'")).rows[0] || {}).dados || {};
        const novo = JSON.parse(JSON.stringify(ch.config)), cc = cur.cfg || {};
        if (novo.cfg && cc.tarifaAuto) { // campos que só o servidor preenche
          const ta = novo.cfg.tarifaAuto || {};
          novo.cfg.tarifaAuto = Object.assign({}, ta, { fonte: cc.tarifaAuto.fonte, obtidoEm: cc.tarifaAuto.obtidoEm, erro: cc.tarifaAuto.erro });
          if ((ta.modo || 'automatica') === 'automatica' && cc.tarifa != null) novo.cfg.tarifa = cc.tarifa;
        }
        await q.query(`insert into config(chave,dados) values('config',$1) on conflict(chave) do update set dados=excluded.dados,atualizado_em=now()`, [novo]);
      }
      log(u, 'salvar', Object.keys(ch.upserts || {}).join(','));
      return { nums };
    });
  },
  async salvarArquivo(u, pasta, nome, mime, b64) { return salvarArquivoBin(pasta, nome, mime, Buffer.from(b64, 'base64')); },
  async lerArquivoBase64(u, id) { const r = await db.query('select dados from arquivos where id=$1', [id]); if (!r.rows[0]) throw new Error('Arquivo não encontrado'); return r.rows[0].dados.toString('base64'); },
  async salvarMeuPerfil(u, p) {
    const r = await db.query('select dados from perfis where usuario=$1', [u]); const d = Object.assign({ nome: u }, r.rows[0] ? r.rows[0].dados : {}, p);
    await db.query('insert into perfis(usuario,dados) values($1,$2) on conflict(usuario) do update set dados=excluded.dados', [u, d]); return d;
  },
  async backupAgora(u) { // foto completa em JSON (o backup diário em .sql.gz é feito pelo container "backup")
    const nome = `manual-${new Date().toISOString().replace(/[:.]/g, '-')}.json.gz`; fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const tab = async t => (await db.query(`select * from ${t}`)).rows;
    const dump = { versao: 1, criado: new Date().toISOString(), registros: await tab('registros'), config: await tab('config'), sequencias: await tab('sequencias'), perfis: await tab('perfis'), contratos_html: await tab('contratos_html'),
      arquivos: (await tab('arquivos')).map(a => Object.assign(a, { dados: a.dados.toString('base64') })) };
    fs.writeFileSync(path.join(BACKUP_DIR, nome), require('zlib').gzipSync(JSON.stringify(dump)));
    log(u, 'backup', nome); return { nome };
  },
  /* --- propostas públicas --- */
  async aceitarPublico(u, id, t, nome, agente, opId, forma) {
    return transacao(async q => {
      const p = await lerReg('propostas', id, q, true);
      if (!p || !iguais(p.token, t)) throw new Error('Link inválido');
      if (p.status === 'aceita') return pubProp(p);
      if (!['emitida', 'visualizada'].includes(p.status)) throw new Error('Esta proposta não pode mais ser aceita');
      const s = p.snap, op = opsDe(s).find(x => x.id === opId) || opsDe(s)[0], d = hoje();
      p.status = 'aceita'; p.aceite = { nome: String(nome).slice(0, 120), quando: agora(), data: d, agente: String(agente || '').slice(0, 120), opcao: op.id, forma: forma || 'obra' };
      (p.log = p.log || []).push({ quando: agora(), o: `Aceita online por ${p.aceite.nome} · opção ${op.id} (${op.nome}) · ${formaNome(op, forma)}` });
      let cli = p.clienteId && await lerReg('clientes', p.clienteId, q);
      if (!cli) { cli = { id: uid(), nome: p.nome, doc: p.doc, fone: p.fone, email: p.email, cidade: p.cidade, uf: p.uf, aniversario: '' }; await gravarReg('clientes', cli, 'público', q); p.clienteId = cli.id; }
      const ehEl = (p.tipoProposta || s.tipoProposta) === 'eletrica';
      const usina = { id: uid(), nome: `${ehEl ? 'Elétrica' : ({ B1: 'Residencial', B2: 'Rural', B3: 'Comercial' }[p.grupo] || 'Usina')} — ${p.nome}`, clienteNome: p.nome, clienteId: cli.id, cidade: p.cidade, kwp: ehEl ? 0 : +num(op.kwp).toFixed(2), nMod: ehEl ? 0 : op.nMod, modWp: ehEl ? 0 : op.modWp, inversor: ehEl ? (op.nome || 'Serviço elétrico') : op.inversor, etapa: 0, etapaDesde: d, garantia: '', propostaId: p.id, monitor: { plataforma: '', planta: '' }, mockRatio: 1 };
      await gravarReg('usinas', usina, 'público', q);
      for (const x of titulosDoAceite(s, op, forma)) await gravarReg('titulos', { id: uid(), tipo: 'receber', desc: `${x.desc} — ${p.nome}`, pessoa: p.nome, valor: x.valor, venc: addDias(d, x.dias), pago: false, propostaId: p.id }, 'público', q);
      const cf = await q.query("select dados from config where chave='config'"); const tec = ((cf.rows[0] || {}).dados || {}).tecnicos || ['Equipe 1'];
      await gravarReg('visitas', { id: uid(), usinaId: usina.id, local: usina.nome, tipo: ehEl ? 'Vistoria técnica elétrica' : 'Visita técnica comercial', data: addDias(d, 3), tecnico: tec[0], status: 'agendada', checklist: [], obs: '' }, 'público', q);
      const n = p.negocioId && await lerReg('negocios', p.negocioId, q);
      if (n) { Object.assign(n, { status: 'ganho', fechadoEm: d, valor: Math.round(op.final), kwp: ehEl ? 0 : +num(op.kwp).toFixed(2) }); await gravarReg('negocios', n, 'público', q); }
      await gravarReg('propostas', p, 'público', q);
      log('público', 'aceite', p.id + ' ' + p.aceite.nome);
      return pubProp(p);
    });
  },
  async recusarPublico(u, id, t) {
    return transacao(async q => {
      const p = await lerReg('propostas', id, q, true); if (!p || !iguais(p.token, t)) throw new Error('Link inválido');
      if (['emitida', 'visualizada'].includes(p.status)) { p.status = 'recusada'; (p.log = p.log || []).push({ quando: agora(), o: 'Recusada pelo cliente' }); await gravarReg('propostas', p, 'público', q); }
      return pubProp(p);
    });
  },
  /* --- contratos --- */
  async publicarContrato(u, d) {
    const c = await lerReg('contratosVenda', d.id); if (!c) throw new Error('Salve o contrato antes de publicar');
    if (c.assin && c.assin.cliente && d.status !== 'cancelado') throw new Error('Contrato já assinado pelo cliente: crie um Termo Aditivo.');
    if (d.html) await db.query('insert into contratos_html(id,html) values($1,$2) on conflict(id) do update set html=excluded.html,atualizado_em=now()', [d.id, d.html]);
    Object.assign(c, { token: d.token || c.token, snap: d.snap || c.snap, status: d.status || c.status });
    await gravarReg('contratosVenda', c, u); return { ok: true };
  },
  async statusContratos() { return (await lerCol('contratosVenda')).map(c => ({ id: c.id, status: c.status, visualizadoEm: c.visualizadoEm || '', assin: c.assin || {}, pdfUrl: c.pdfUrl || '' })); },
  async assinarContratoPublico(u, id, t, dados, ip) {
    const res = await transacao(async q => {
      const c = await lerReg('contratosVenda', id, q, true);
      if (!c || !iguais(c.token, t)) return { erro: 'Link inválido ou expirado.' };
      if (c.status === 'cancelado') return { erro: 'Este contrato foi cancelado.' };
      if (c.assin && c.assin.cliente) return pubCt(c);
      const esperado = soDig((((c.snap || {}).render || {}).partes || {}).clienteDoc);
      if (esperado && soDig(dados.doc) !== esperado) return { erro: 'O documento informado não confere com o do contrato.' };
      if (!/^data:image\/png;base64,/.test(dados.img || '') || dados.img.length > 800000) return { erro: 'Assinatura não recebida.' };
      if (dados.hash && c.snap && dados.hash !== c.snap.hash) return { erro: 'O contrato foi atualizado. Recarregue a página e leia a versão nova.' };
      c.assin = c.assin || {};
      c.assin.cliente = { nome: String(dados.nome || '').slice(0, 120), doc: String(dados.doc || '').slice(0, 20), tipoDoc: dados.tipoDoc || 'CPF', email: String(dados.email || '').slice(0, 120), agente: String(dados.agente || '').slice(0, 160), ip, quando: agora(), data: hoje(), img: dados.img };
      c.status = 'assinado_cliente'; (c.log = c.log || []).push({ quando: agora(), o: `Assinado online pelo cliente (${c.assin.cliente.nome}) · IP ${ip}` });
      await gravarReg('contratosVenda', c, 'público', q); log('público', 'assinatura', c.id + ' ' + c.assin.cliente.nome);
      return { ok: c };
    });
    if (!res.ok) return res;
    const c = res.ok;
    setImmediate(() => posAssinatura(c)); // PDF + e-mails depois da resposta: a assinatura já está gravada
    return pubCt(c);
  },
  async contraAssinarContrato(u, d) {
    const c = await lerReg('contratosVenda', d.id); if (!c) throw new Error('Contrato não encontrado');
    c.assin = Object.assign({}, c.assin, { empresa: d.empresa }); c.status = 'concluido';
    if (d.html) await db.query('insert into contratos_html(id,html) values($1,$2) on conflict(id) do update set html=excluded.html,atualizado_em=now()', [c.id, d.html]);
    const p = await pdfContrato(c); if (p) c.pdfUrl = p.url;
    await gravarReg('contratosVenda', c, u);
    const to = (c.assin.cliente || {}).email || (c.parte || {}).email;
    if (to) await enviarEmail({ to, subject: `Contrato ${c.snap.codigo} concluído — via assinada`, text: `Olá! Segue a via do contrato ${c.snap.codigo} assinada pelas duas partes.`, attachments: p ? [{ filename: p.nome, content: p.pdf }] : [] });
    return { ok: true, pdfUrl: c.pdfUrl || '' };
  },
  async atualizarTarifa(u, imp) {
    const ta = (await lerCfg()).tarifaAuto || {};
    const i = { icms: num(imp && imp.icms != null ? imp.icms : (ta.icms ?? 25)), pisCofins: num(imp && imp.pisCofins != null ? imp.pisCofins : (ta.pisCofins ?? 5)) };
    const r = await aplicarTarifa(i); log(u, 'tarifa', `${r.tarifa} · ${r.fonte}`); return r;
  },
  async enviarContratoEmail(u, d) {
    const c = await lerReg('contratosVenda', d.id); if (!c || !c.snap) throw new Error('Gere o contrato (Enviar para assinatura) antes do e-mail');
    const r = await db.query('select html from contratos_html where id=$1', [c.id]);
    const pdf = r.rows[0] ? await htmlParaPdf(htmlAssinado(c, r.rows[0].html)) : null;
    const ok = await enviarEmail({ to: d.para, subject: d.assunto, text: d.corpo, attachments: pdf ? [{ filename: `Contrato ${c.snap.codigo}.pdf`, content: pdf }] : [] });
    if (!ok) throw new Error('Servidor de e-mail (SMTP) não configurado no .env');
    log(u, 'email-contrato', c.id + ' → ' + d.para); return { ok: true };
  }
};

/* ---------------- HTTP ---------------- */
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '30mb' }));
function usuarioDe(req) {
  const h = req.headers.authorization || ''; if (!h.startsWith('Basic ')) return null;
  const [u, ...r] = Buffer.from(h.slice(6), 'base64').toString().split(':'); const s = r.join(':');
  return USUARIOS[u] != null && iguais(USUARIOS[u], s) ? u : null;
}
function exigirLogin(req, res, next) {
  const u = usuarioDe(req); if (u) { req.usuario = u; return next(); }
  res.set('WWW-Authenticate', 'Basic realm="Delta CRM", charset="UTF-8"').status(401).send('Login necessário');
}
function pagina(boot) {
  let h = fs.readFileSync(INDEX, 'utf8');
  h = h.replace('<script>/*__BOOT__*/</script>', '<script src="/gas-shim.js"></script>\n<script>/*__BOOT__*/</script>');
  if (boot) h = h.replace('/*__BOOT__*/', 'window.__BOOT__=' + JSON.stringify(boot).replace(/</g, '\\u003c') + ';');
  return h;
}
app.get('/saude', async (req, res) => { try { await db.query('select 1'); res.json({ ok: true }); } catch (e) { res.status(500).json({ ok: false }); } });
app.get('/gas-shim.js', (req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'gas-shim.js')));
app.get('/', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    if (req.query.p && req.query.t) { // proposta pública
      const p = await lerReg('propostas', String(req.query.p));
      if (!p || !iguais(p.token, req.query.t) || p.status === 'rascunho') return res.send(pagina({ modo: 'publico', id: req.query.p, t: req.query.t, dados: { erro: 'Proposta não encontrada ou link inválido.' } }));
      if (p.status === 'emitida') { p.status = 'visualizada'; p.visualizadaEm = hoje(); (p.log = p.log || []).push({ quando: agora(), o: 'Visualizada pelo cliente' }); await gravarReg('propostas', p, 'público'); }
      return res.send(pagina({ modo: 'publico', id: p.id, t: req.query.t, dados: pubProp(p) }));
    }
    if (req.query.c && req.query.t) { // contrato público
      const c = await lerReg('contratosVenda', String(req.query.c));
      if (!c || !iguais(c.token, req.query.t)) return res.send(pagina({ modo: 'contrato', id: req.query.c, t: req.query.t, dados: { erro: 'Contrato não encontrado ou link expirado. Peça um novo link à Delta Solar.' } }));
      if (c.status === 'enviado' && !c.visualizadoEm) { c.visualizadoEm = agora(); c.status = 'visualizado'; (c.log = c.log || []).push({ quando: agora(), o: 'Aberto pelo cliente' }); await gravarReg('contratosVenda', c, 'público'); }
      return res.send(pagina({ modo: 'contrato', id: c.id, t: req.query.t, dados: pubCt(c) }));
    }
    next();
  } catch (e) { next(e); }
}, exigirLogin, (req, res) => res.send(pagina(null)));
app.get('/arquivo/:id', exigirLogin, async (req, res) => {
  const r = await db.query('select nome,mime,dados from arquivos where id=$1', [req.params.id]); if (!r.rows[0]) return res.status(404).send('Arquivo não encontrado');
  res.type(r.rows[0].mime || 'application/octet-stream').set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(r.rows[0].nome)}`).send(r.rows[0].dados);
});
app.post('/api/:fn', async (req, res) => {
  const fn = req.params.fn, f = Object.prototype.hasOwnProperty.call(FUN, fn) ? FUN[fn] : null;
  if (!f) return res.status(404).json({ __erro: 'Função desconhecida: ' + fn });
  let u = 'público';
  if (!PUBLICAS.has(fn)) { u = usuarioDe(req); if (!u) return res.status(401).json({ __erro: 'Sessão expirada: recarregue a página e entre de novo.' }); }
  try {
    const args = Array.isArray(req.body && req.body.args) ? req.body.args : [];
    if (fn === 'assinarContratoPublico') args.length = 3, args.push(req.ip);
    res.json({ r: await f(u, ...args) });
  } catch (e) { console.error(fn, e); res.status(400).json({ __erro: e.message || String(e) }); }
});
app.use((e, req, res, next) => { console.error(e); res.status(500).send('Erro interno'); });

iniciarBanco().then(() => app.listen(PORTA, () => {
  setTimeout(tarifaDiaria, 15000); setInterval(tarifaDiaria, 24 * 3600e3);
  console.log(`Delta CRM em ${URL_PUBLICA} · usuários: ${Object.keys(USUARIOS).join(', ')} · e-mail: ${smtp ? process.env.SMTP_HOST : 'desligado'} · PDF: ${process.env.GOTENBERG_URL || 'desligado'}`);
})).catch(e => { console.error('Falha ao iniciar:', e); process.exit(1); });
