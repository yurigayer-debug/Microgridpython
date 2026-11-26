/**
 * Delta Solar · CRM — Contratos e assinatura online (Apps Script)
 *
 * Arquivo independente: adicione-o ao mesmo projeto do Apps Script do CRM (Arquivo → + → Script, nome "Contratos").
 * Ele guarda o que o cliente pode ver numa aba própria ("ContratosPublicos"), serve a página de assinatura
 * pelo link ?c=<id>&t=<token>, salva o PDF assinado e a imagem da assinatura no Drive e envia as vias por e-mail.
 *
 * Instalação: ver LEIAME-contratos.md (3 passos: colar este arquivo, 1 linha no doGet, 1 item na lista de coleções).
 */
var CT_ABA = 'ContratosPublicos';
var CT_COLS = ['id', 'token', 'status', 'snap', 'html', 'nome', 'email', 'visualizadoEm', 'assin', 'pdfUrl', 'pastaUrl', 'atualizadoEm'];

/* ---------- infraestrutura ---------- */
function ctAba_() {
  var ss = SpreadsheetApp.getActive() || SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('PLANILHA_ID'));
  var sh = ss.getSheetByName(CT_ABA);
  if (!sh) { sh = ss.insertSheet(CT_ABA); sh.appendRow(CT_COLS); sh.setFrozenRows(1); sh.hideSheet(); }
  return sh;
}
function ctLer_(id) {
  var sh = ctAba_(), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]) === String(id)) {
    var o = { _linha: i + 1 }; CT_COLS.forEach(function (c, j) { o[c] = v[i][j]; });
    ['snap', 'assin'].forEach(function (k) { try { o[k] = o[k] ? JSON.parse(o[k]) : (k === 'assin' ? {} : null); } catch (e) { o[k] = k === 'assin' ? {} : null; } });
    return o;
  }
  return null;
}
function ctGravar_(o) {
  var sh = ctAba_(), linha = o._linha || (sh.getLastRow() + 1);
  o.atualizadoEm = new Date();
  var row = CT_COLS.map(function (c) { var x = o[c]; return (c === 'snap' || c === 'assin') ? JSON.stringify(x || (c === 'assin' ? {} : null)) : (x == null ? '' : x); });
  sh.getRange(linha, 1, 1, CT_COLS.length).setValues([row]);
  o._linha = linha; return o;
}
function ctPasta_(nomeCliente) {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('CONTRATOS_PASTA_ID'), raiz;
  try { raiz = id ? DriveApp.getFolderById(id) : null; } catch (e) { raiz = null; }
  if (!raiz) { raiz = DriveApp.createFolder('Delta CRM - Contratos'); props.setProperty('CONTRATOS_PASTA_ID', raiz.getId()); }
  var nome = String(nomeCliente || 'Cliente').replace(/[\\\/:*?"<>|]/g, '-').slice(0, 80);
  var it = raiz.getFoldersByName(nome);
  return it.hasNext() ? it.next() : raiz.createFolder(nome);
}
function ctSoDig_(s) { return String(s || '').replace(/\D/g, ''); }
function ctAgora_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/Sao_Paulo', 'dd/MM/yyyy, HH:mm:ss'); }
function ctEsc_(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
var CT_CSS_PDF = '<style>body{font-family:"Times New Roman",serif;font-size:12.5px;color:#111}.ct-doc{padding:0}.ct-dh{display:flex;justify-content:space-between;border-bottom:2px solid #111;margin-bottom:14px;font-family:Arial;font-size:11px}.ct-dh img{height:40px}h1{font-size:14px;text-align:center}p{text-align:justify;margin:0 0 7px}.ct-bul{margin-left:18px}table{width:100%;border-collapse:collapse;font-family:Arial;font-size:11px;margin:6px 0 10px}th,td{border:1px solid #444;padding:4px 6px}th{background:#eef1ec}.r{text-align:right}.ct-sig{margin-top:18px}.ct-sig .ln{border-bottom:1px solid #111;height:50px}.ct-sig img{max-height:48px}.ct-sig small{display:block;font-family:Arial;font-size:10px}.ct-test{display:flex;gap:30px;font-size:11px}.ct-test>div{flex:1}.ct-cert{margin-top:18px;border:1.5px solid #1c9a68;padding:8px 10px;font-family:Arial;font-size:10px;background:#f4fbf7}.ct-cert code{font-size:9px;word-break:break-all}.ct-df{margin-top:16px;border-top:2px solid #111;text-align:center;font-family:Arial;font-size:9.5px}.ct-falta{background:#ffe6a8}</style>';
function ctPdf_(html, nome) {
  return Utilities.newBlob('<html><head><meta charset="utf-8">' + CT_CSS_PDF + '</head><body>' + html + '</body></html>', 'text/html', nome + '.html').getAs('application/pdf').setName(nome + '.pdf');
}
/* Acrescenta assinatura(s) e certificado ao HTML congelado no envio */
function ctHtmlAssinado_(o) {
  var a = (o.assin || {}).cliente, e = (o.assin || {}).empresa, s = o.snap || {};
  if (!a) return o.html;
  var bloco = '<div style="page-break-inside:avoid;margin-top:18px"><b>Assinaturas eletrônicas</b>' +
    '<div class="ct-sig"><div class="ln">' + (a.img ? '<img src="' + a.img + '">' : '') + '</div><b>CONTRATANTE: ' + ctEsc_(a.nome) + '</b><small>' + ctEsc_(a.tipoDoc || 'CPF') + ' ' + ctEsc_(a.doc) + ' · ' + ctEsc_(a.quando) + '</small></div>' +
    (e ? '<div class="ct-sig"><div class="ln">' + (e.img ? '<img src="' + e.img + '">' : '') + '</div><b>CONTRATADA: ' + ctEsc_(e.nome) + '</b><small>' + ctEsc_(e.quando) + '</small></div>' : '') +
    '<div class="ct-cert"><b>Certificado de assinatura eletrônica</b><br>Documento ' + ctEsc_(s.codigo) + ' · emitido em ' + ctEsc_(s.emitidoEm) +
    '<br>CONTRATANTE: ' + ctEsc_(a.nome) + ' · ' + ctEsc_(a.tipoDoc || 'CPF') + ' ' + ctEsc_(a.doc) + ' · ' + ctEsc_(a.quando) + (a.email ? ' · ' + ctEsc_(a.email) : '') +
    '<br>Aparelho: ' + ctEsc_(a.agente) + (e ? '<br>CONTRATADA: ' + ctEsc_(e.nome) + ' · ' + ctEsc_(e.quando) : '') +
    '<br>SHA-256 do texto assinado: <code>' + ctEsc_(s.hash) + '</code><br>Assinatura eletrônica nos termos da Lei nº 14.063/2020 e do art. 10, § 2º, da MP nº 2.200-2/2001.</div></div>';
  return String(o.html || '') + bloco;
}
function ctSalvarPdf_(o) {
  var pasta = ctPasta_(o.nome), nome = 'Contrato ' + ((o.snap || {}).codigo || o.id) + ((o.assin || {}).cliente ? ' - assinado' : '');
  var f = pasta.createFile(ctPdf_(ctHtmlAssinado_(o), nome));
  o.pdfUrl = f.getUrl(); o.pastaUrl = pasta.getUrl(); return f;
}

/* ---------- chamado pelo CRM (equipe, implantação interna) ---------- */
function publicarContrato(d) {
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var o = ctLer_(d.id) || { id: d.id, assin: {} };
    if (o.assin && o.assin.cliente && d.status !== 'cancelado') throw new Error('Contrato já assinado pelo cliente: não pode ser alterado. Crie um Termo Aditivo.');
    o.token = d.token || o.token; o.status = d.status || o.status || 'enviado';
    if (d.snap) o.snap = d.snap; if (d.html) o.html = d.html;
    if (d.nome) o.nome = d.nome; if (d.email != null) o.email = d.email;
    ctGravar_(o); return { ok: true };
  } finally { lock.releaseLock(); }
}
function statusContratos() {
  var sh = ctAba_(), v = sh.getDataRange().getValues(), out = [];
  for (var i = 1; i < v.length; i++) {
    var assin = {}; try { assin = JSON.parse(v[i][8] || '{}'); } catch (e) { }
    out.push({ id: v[i][0], status: v[i][2], visualizadoEm: v[i][7] ? String(v[i][7]) : '', assin: assin, pdfUrl: v[i][9] || '' });
  }
  return out;
}
function contraAssinarContrato(d) {
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var o = ctLer_(d.id); if (!o) throw new Error('Contrato não publicado');
    o.assin = o.assin || {}; o.assin.empresa = d.empresa; o.status = 'concluido';
    var f = ctSalvarPdf_(o); ctGravar_(o);
    if (o.email) MailApp.sendEmail({ to: o.email, subject: 'Contrato ' + o.snap.codigo + ' concluído — via assinada', body: 'Olá! Segue em anexo a via do contrato ' + o.snap.codigo + ' assinada pelas duas partes.\n\n' + (o.snap.empresa || {}).nome, attachments: [f.getBlob()] });
    return { ok: true, pdfUrl: o.pdfUrl };
  } finally { lock.releaseLock(); }
}
function enviarContratoEmail(d) {
  var o = ctLer_(d.id); if (!o) throw new Error('Gere o contrato (Enviar para assinatura) antes do e-mail');
  var pdf = ctPdf_(ctHtmlAssinado_(o), 'Contrato ' + ((o.snap || {}).codigo || o.id));
  MailApp.sendEmail({ to: d.para, subject: d.assunto, body: d.corpo, attachments: [pdf], name: ((o.snap || {}).empresa || {}).nome || 'Delta Solar' });
  if (d.para && !o.email) { o.email = d.para; ctGravar_(o); }
  return { ok: true };
}

/* ---------- página pública (implantação "Qualquer pessoa") ---------- */
function contratoPublico(id, t) {
  var o = ctLer_(id);
  if (!o || !t || String(o.token) !== String(t)) return { erro: 'Contrato não encontrado ou link expirado. Peça um novo link à Delta Solar.' };
  if (o.status === 'enviado' && !o.visualizadoEm) { o.visualizadoEm = ctAgora_(); o.status = 'visualizado'; ctGravar_(o); }
  var assin = JSON.parse(JSON.stringify(o.assin || {}));
  return { snap: o.snap, status: o.status, assin: assin };
}
function assinarContratoPublico(id, t, dados) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var o = ctLer_(id);
    if (!o || String(o.token) !== String(t)) return { erro: 'Link inválido ou expirado.' };
    if (o.status === 'cancelado') return { erro: 'Este contrato foi cancelado.' };
    if (o.assin && o.assin.cliente) return { snap: o.snap, status: o.status, assin: o.assin }; // já assinado: não duplica
    var esperado = ctSoDig_(((o.snap || {}).render || {}).partes ? o.snap.render.partes.clienteDoc : '');
    if (esperado && ctSoDig_(dados.doc) !== esperado) return { erro: 'O documento informado não confere com o do contrato.' };
    if (!dados.img || String(dados.img).indexOf('data:image/png;base64,') !== 0) return { erro: 'Assinatura não recebida.' };
    if (dados.hash && o.snap && dados.hash !== o.snap.hash) return { erro: 'O contrato foi atualizado. Recarregue a página e leia a versão nova.' };
    var cli = {
      nome: String(dados.nome || '').slice(0, 120), doc: String(dados.doc || '').slice(0, 20), tipoDoc: dados.tipoDoc || 'CPF',
      email: String(dados.email || '').slice(0, 120), agente: String(dados.agente || '').slice(0, 160), quando: ctAgora_(),
      data: Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd'), img: dados.img
    };
    o.assin = o.assin || {}; o.assin.cliente = cli; o.status = 'assinado_cliente';
    var pasta = ctPasta_(o.nome);
    pasta.createFile(Utilities.newBlob(Utilities.base64Decode(dados.img.split(',')[1]), 'image/png', 'Assinatura ' + o.snap.codigo + '.png'));
    var f = ctSalvarPdf_(o); ctGravar_(o);
    var destinos = [cli.email, o.email].filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    destinos.forEach(function (para) {
      MailApp.sendEmail({ to: para, subject: 'Contrato ' + o.snap.codigo + ' assinado', body: 'Olá, ' + cli.nome + '!\n\nRecebemos a sua assinatura do contrato ' + o.snap.codigo + ' em ' + cli.quando + '. A via assinada segue em anexo.\nCódigo de integridade (SHA-256): ' + o.snap.hash + '\n\n' + (o.snap.empresa || {}).nome, attachments: [f.getBlob()] });
    });
    var emp = (o.snap.empresa || {}).email;
    if (emp) MailApp.sendEmail({ to: emp, subject: '✍ Contrato ' + o.snap.codigo + ' assinado por ' + cli.nome, body: 'O cliente assinou online em ' + cli.quando + '.\nFalta a contra-assinatura da empresa no CRM.\nPDF: ' + o.pdfUrl });
    return { snap: o.snap, status: o.status, assin: o.assin };
  } finally { lock.releaseLock(); }
}
/* Chamado pelo doGet quando a URL tem ?c=…&t=… (ver LEIAME-contratos.md) */
function contratoPaginaPublica(e) {
  var id = e.parameter.c, t = e.parameter.t;
  var boot = { modo: 'contrato', id: id, t: t, dados: contratoPublico(id, t) };
  var html = HtmlService.createHtmlOutputFromFile('Index').getContent()
    .replace('/*__BOOT__*/', 'window.__BOOT__=' + JSON.stringify(boot).replace(/</g, '\\u003c') + ';');
  return HtmlService.createHtmlOutput(html).setTitle('Contrato ' + ((boot.dados.snap || {}).codigo || ''))
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
