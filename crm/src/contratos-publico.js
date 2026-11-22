/* ===================== Contratos · página do cliente e assinatura ===================== */
let CTPUB=null;
function ctPubHtml(snap,status,assin,ctx){
  const r=snap.render,s=snap.resumo||{},em=snap.empresa||{};assin=assin||{};
  const assinado=!!assin.cliente,podeAssinar=!assinado&&['enviado','visualizado'].includes(status);
  const wa=waHref(em.whats,`Olá ${em.nome||''}! Estou lendo o contrato nº ${snap.codigo} e tenho uma dúvida.`);
  const friendly=t=>t.charAt(0)+t.slice(1).toLowerCase();
  return `<div class="ctp-prog"><i id="ctpProg"></i></div><div class="ctp">
    ${ctx&&ctx.voltar?`<div class="row ct-noprint" style="margin:6px 0"><button class="btn sm" onclick="go('ct-${ctx.id}')">← Voltar ao CRM</button><span class="pill a">Assinatura presencial neste aparelho</span></div>`:''}
    <div class="ctp-top"><img src="${DELTA_LOGO_DATA}" alt="${esc(em.nome||'')}"><div style="text-align:right"><div class="small muted">Contrato nº</div><b class="mono">${esc(snap.codigo)}</b></div></div>
    <div class="ctp-hero"><small>${assinado?'✓ Contrato assinado':status==='cancelado'?'Contrato cancelado':'Contrato para sua assinatura'}</small>
      <h2>${esc(s.objeto||r.titulo)}</h2><div class="sub">Contratante: <b>${esc(s.cliente||'')}</b> · Contratada: <b>${esc(em.razao||em.nome||'')}</b></div>
      <div class="ctp-sum"><div><span>Valor total</span><b>${brl(s.valor)}</b></div>${s.prazo?`<div><span>Prazo</span><b>${esc(s.prazo)}</b></div>`:''}${s.garantia?`<div><span>Garantia adicional</span><b>${esc(s.garantia)}</b></div>`:''}<div><span>Parcelas</span><b>${(s.parcelas||[]).length}× · 1ª em ${fdata(((s.parcelas||[])[0]||{}).data)}</b></div></div></div>
    <div class="ctp-card"><h3>Resumo em linguagem simples</h3>
      <p class="small" style="margin:0 0 8px;line-height:1.6">Antes do texto jurídico, os pontos principais. O contrato completo está logo abaixo — toque em cada cláusula para abrir ou fechar.</p>
      ${s.equipamentos&&s.equipamentos.length?`<b class="small">O que será instalado</b><ul style="margin:4px 0 10px 18px;padding:0;line-height:1.6">${s.equipamentos.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
      ${s.local?`<b class="small">Onde</b><p style="margin:2px 0 10px">${esc(s.local)}</p>`:''}
      <b class="small">Como você paga</b><table style="margin-top:4px">${(s.parcelas||[]).map(p=>`<tr><td>${fdata(p.data)}</td><td>${esc(p.desc)}</td><td class="num"><b>${brl(p.valor)}</b></td></tr>`).join('')}</table>
      <div class="small muted" style="margin-top:6px">Valor por extenso: ${esc(s.extenso||'')}</div></div>
    <div class="ctp-toc" aria-label="Índice das cláusulas">${r.clausulas.map(cl=>`<a href="javascript:void(0)" onclick="ctpIr(${cl.n})">${cl.n}. ${esc(friendly(cl.titulo.replace(/^D[OA]S?\s+/,'')))}</a>`).join('')}<a href="javascript:void(0)" onclick="document.getElementById('assinar').scrollIntoView({behavior:'smooth'})">✍ Assinar</a></div>
    <div class="ctp-doc">
      <details open><summary><span><small>Partes</small>${esc(r.titulo)}</span><span class="seta">›</span></summary><div class="corpo">${r.preambulo.map(l=>ctLinhaHtml(l,r)).join('')}</div></details>
      ${r.clausulas.map(cl=>`<details open id="ctp-cl${cl.n}"><summary><span><small>Cláusula ${cl.ord.toLowerCase()}</small>${esc(friendly(cl.titulo))}</span><span class="seta">›</span></summary><div class="corpo">${cl.linhas.map(l=>ctLinhaHtml(l,r)).join('')}</div></details>`).join('')}
      <details open><summary><span><small>Encerramento</small>Assinaturas</span><span class="seta">›</span></summary><div class="corpo">${r.fecho.map(l=>ctLinhaHtml(l,r)).join('')}</div></details>
    </div>
    <div class="ctp-card ${assinado?'ctp-ok':'ctp-sign'}" id="assinar">
      ${assinado?`<div class="big" style="color:var(--green)">✓ Contrato assinado</div><div class="small muted" style="margin:6px 0 12px">Por <b>${esc(assin.cliente.nome)}</b> em ${esc(assin.cliente.quando)}${assin.empresa?` · contra-assinado por ${esc(assin.empresa.nome)}`:' · aguardando contra-assinatura da empresa'}</div>
        <div class="small mono" style="word-break:break-all;color:var(--mute)">SHA-256: ${esc(snap.hash||'')}</div>
        <div class="row" style="justify-content:center;margin-top:12px"><button class="btn sun" onclick="ctpPdf()">⬇ Baixar minha via (PDF)</button></div>`
      :status==='cancelado'?'<div class="big muted">Este contrato foi cancelado.</div>'
      :!podeAssinar?'<div class="muted">Prévia — o contrato ainda não foi liberado para assinatura.</div>'
      :`<h3>Assinar o contrato</h3><div class="small muted" style="margin-bottom:10px">Confira seus dados, marque a concordância e desenhe sua assinatura com o dedo.</div>
        <div class="fg"><label class="f w2">Nome completo<input id="cs_nome" autocomplete="name" value="${esc(s.cliente||'')}"></label>
        <label class="f">${esc(r.partes.tipoDoc||'CPF')} (para confirmar)<input id="cs_doc" inputmode="numeric" autocomplete="off" placeholder="Somente números"></label>
        <label class="f">E-mail para receber a via assinada<input id="cs_email" type="email" autocomplete="email"></label></div>
        <label class="small" style="display:flex;gap:8px;align-items:flex-start;margin-top:12px;line-height:1.5"><input type="checkbox" id="cs_ok" style="width:20px;height:20px;flex:0 0 auto"> Li o contrato nº ${esc(snap.codigo)} e concordo com todas as cláusulas. Reconheço esta assinatura eletrônica como válida (Lei nº 14.063/2020).</label>
        <div class="small muted" style="margin-top:12px">Sua assinatura</div><canvas class="sig" id="sig" aria-label="Área para assinar com o dedo"></canvas>
        <div class="row between" style="margin-top:8px"><button class="btn sm" onclick="clearSig()">Limpar</button>${wa?`<a class="btn sm" href="${esc(wa)}" target="_blank" rel="noopener">💬 Tirar dúvida</a>`:''}</div>
        <button class="btn ok" id="cs_btn" style="width:100%;min-height:54px;font-size:16px;margin-top:14px" onclick="ctpAssinar()">✍ Assinar contrato</button>`}
    </div>
    <div class="pub-foot"><div><b>${esc(em.razao||em.nome||'')}</b> · CNPJ ${esc(em.cnpj||'')}${em.crea?' · '+esc(em.crea):''}<br>${esc(em.endereco||'')}</div><div style="text-align:right">${[em.whats,em.whats2].filter(Boolean).map(esc).join(' · ')}<br>${esc(em.email||'')}</div></div>
    ${podeAssinar?`<div class="ctp-bar"><button class="btn" onclick="ctpPdf()">⬇ PDF</button><button class="btn sun" onclick="document.getElementById('assinar').scrollIntoView({behavior:'smooth'})">✍ Ler e assinar</button></div>`:''}
  </div>`;
}
function ctpIr(n){const d=document.getElementById('ctp-cl'+n);if(d){d.open=true;d.scrollIntoView({behavior:'smooth',block:'start'})}}
function ctpProgresso(){const el=document.getElementById('ctpProg');if(!el)return;const h=document.documentElement.scrollHeight-innerHeight;el.style.width=(h>0?Math.min(100,scrollY/h*100):100)+'%'}
window.addEventListener('scroll',ctpProgresso,{passive:true});
function ctpRender(){V(ctPubHtml(CTPUB.snap,CTPUB.status,CTPUB.assin,CTPUB));setTimeout(()=>{if(document.getElementById('sig'))initSig();ctpProgresso()},30)}
async function ctpPdf(){try{toast('Gerando PDF…');const b=await ctPdfBlob(CTPUB.snap,CTPUB.assin);baixarBlob(b,ctNomeArq(CTPUB.snap,'pdf'))}catch(e){toast('Use Imprimir → Salvar como PDF');window.print()}}
async function ctpAssinar(){
  const nome=document.getElementById('cs_nome').value.trim(),doc=soDig(document.getElementById('cs_doc').value),email=document.getElementById('cs_email').value.trim();
  if(nome.split(/\s+/).length<2)return toast('Informe seu nome completo');
  const esperado=soDig(CTPUB.snap.render.partes.clienteDoc);
  if(!doc)return toast('Informe o '+(CTPUB.snap.render.partes.tipoDoc||'CPF')+' para confirmar');
  if(esperado&&doc!==esperado)return toast('O documento não confere com o do contrato');
  if(!validDoc(doc))return toast('Documento inválido');
  if(!document.getElementById('cs_ok').checked)return toast('Marque a concordância com o contrato');
  if(!sigDirty)return toast('Desenhe sua assinatura no quadro');
  const dados={nome,doc:fmtDoc(doc),tipoDoc:CTPUB.snap.render.partes.tipoDoc||'CPF',email,agente:navigator.userAgent.slice(0,120),img:document.getElementById('sig').toDataURL('image/png'),hash:CTPUB.snap.hash};
  const b=document.getElementById('cs_btn');b.disabled=true;b.textContent='Registrando assinatura…';
  try{
    if(CTPUB.local){const c=ctDe(CTPUB.id);ctAssinarLocal(c,dados);CTPUB.assin=c.assin;CTPUB.status=c.status}
    else{const d=await gas('assinarContratoPublico',CTPUB.id,CTPUB.t,dados);if(d&&d.erro)throw new Error(d.erro);CTPUB.assin=d.assin;CTPUB.status=d.status}
    ctpRender();window.scrollTo(0,document.body.scrollHeight);toast('Contrato assinado. Obrigado!');
  }catch(e){b.disabled=false;b.textContent='✍ Assinar contrato';toast('Não foi possível registrar: '+(e&&e.message||e))}
}
function ctAssinarLocal(c,d){
  const agora=new Date();c.assin=c.assin||{};
  c.assin.cliente=Object.assign({},d,{quando:agora.toLocaleString('pt-BR'),data:todayISO(),presencial:true});
  c.status='assinado_cliente';logCt(c,`Assinado pelo cliente (${d.nome}) — presencial neste aparelho`);save();
}
function viewCtAssinaturaPresencial(id){
  const c=ctDe(id);if(!c){go('contratos');return}
  if(c.status==='rascunho'||!c.snap){toast('Gere o contrato (Enviar para assinatura) primeiro');go('ct-'+id);return}
  setHead('Assinatura presencial',`${c.codigo} · entregue o aparelho ao cliente`,'');
  CTPUB={id,local:true,voltar:true,snap:c.snap,status:c.status,assin:c.assin};ctpRender();
}
function viewCtPublicoLocal(id){
  const c=ctDe(id);if(!c||!c.snap){V('<div class="empty">Contrato não encontrado ou link inválido.</div>');return}
  if(c.status==='enviado'){c.status='visualizado';c.visualizadoEm=new Date().toLocaleString('pt-BR');logCt(c,'Aberto pelo cliente');save()}
  CTPUB={id,local:true,snap:c.snap,status:c.status,assin:c.assin};ctpRender();
}
function bootContratoPublico(B){
  entrarModoCliente();
  const bt=document.createElement('button');bt.className='btn sm temabt';bt.style.cssText='position:fixed;right:14px;top:12px;z-index:45;box-shadow:0 2px 10px rgba(0,0,0,.18)';bt.setAttribute('aria-label','Alternar tema');bt.onclick=alternarTema;document.body.appendChild(bt);aplicarTema(temaSalvo());
  const d=B.dados||{};if(!d.snap||d.erro){V(`<div class="ctp"><div class="ctp-card empty">${esc(d.erro||'Contrato não encontrado ou link inválido.')}</div></div>`);return}
  CTPUB={id:B.id,t:B.t,local:false,snap:d.snap,status:d.status,assin:d.assin||{}};ctpRender();
}
/* Modo Google: traz para o CRM as assinaturas feitas pelos clientes no link público */
async function ctSyncGas(){
  if(!GAS)return;try{
    const l=await gas('statusContratos');let mud=0;
    (l||[]).forEach(x=>{const c=ctDe(x.id);if(!c)return;
      if(x.visualizadoEm&&!c.visualizadoEm){c.visualizadoEm=x.visualizadoEm;if(c.status==='enviado')c.status='visualizado';logCt(c,'Aberto pelo cliente');mud++}
      if(x.assin&&x.assin.cliente&&!(c.assin&&c.assin.cliente)){c.assin=Object.assign({},c.assin,{cliente:x.assin.cliente});c.status='assinado_cliente';logCt(c,'Assinado online pelo cliente ('+x.assin.cliente.nome+')');mud++}
      if(x.pdfUrl&&c.pdfUrl!==x.pdfUrl){c.pdfUrl=x.pdfUrl;mud++}});
    if(mud){save();if(/^(contratos|ct-|painel)/.test(curHash()))route();toast(mud+' atualização(ões) de contratos recebida(s)')}
  }catch(e){/* Contratos.gs ainda não instalado: segue sem sincronizar */}
}
/* ---- Templates de contrato ---- */
function viewCTemplates(){
  const L=ctTemplates();if(!L.some(t=>t.id===ctTplEdit))ctTplEdit=L[0].id;const t=ctTemplateDe(ctTplEdit);
  setHead('Templates de contrato','Modelos com cláusulas editáveis e arquivo Word (.docx) opcional — os mesmos códigos {{...}} dos templates de proposta.',
    `<button class="btn" onclick="ctModalVars()">📋 Campos</button><button class="btn" onclick="ctRestaurarTpls()">↺ Restaurar padrões</button><button class="btn sun" onclick="ctNovoTpl()">+ Novo modelo</button>`);
  V(`<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));margin-bottom:16px">${L.map(x=>`<div class="card" style="border:2px solid ${x.id===t.id?'var(--sun)':'var(--line)'};cursor:pointer" onclick="ctTplEdit='${x.id}';viewCTemplates()">
    <div class="row between"><b>${(CT_TIPOS[x.tipo]||CT_TIPOS.outro).ic} ${esc(x.nome)}</b>${x.docx?'<span class="pill b">📄 .docx</span>':''}</div><div class="small muted" style="margin-top:6px;line-height:1.4">${esc(x.descricao||'')}</div><div class="small muted" style="margin-top:6px">${(x.clausulas||[]).length} cláusulas · ${ctLista().filter(c=>c.templateId===x.id).length} contrato(s)</div></div>`).join('')}</div>
  <div class="card" id="tplbody">
    <div class="row between" style="margin-bottom:10px"><h3 style="margin:0">Editando: ${esc(t.nome)}</h3><div class="row"><button class="btn sm" onclick="ctDupTpl('${t.id}')">Duplicar</button>${L.length>1?`<button class="btn sm danger" onclick="ctExcluirTpl('${t.id}')">Excluir</button>`:''}</div></div>
    <div class="fg"><label class="f">Nome<input id="ctt_nome" value="${esc(t.nome)}"></label><label class="f">Tipo<select id="ctt_tipo">${Object.values(CT_TIPOS).map(x=>`<option value="${x.k}" ${x.k===t.tipo?'selected':''}>${x.ic} ${x.label}</option>`).join('')}</select></label><label class="f w2">Descrição<input id="ctt_desc" value="${esc(t.descricao||'')}"></label></div>
    <div class="resbox" style="margin:14px 0"><div class="row between" style="gap:10px"><div><b>📄 Template Word (.docx)</b><div class="small muted" style="margin-top:2px">${t.docx?`Ativo: <b>${esc(t.docx.nome)}</b> (${Math.max(1,Math.round((t.docx.tamanho||0)/1024))} KB · ${fdata(t.docx.atualizadoEm)}). O .docx do contrato sai deste arquivo com os campos preenchidos.`:'Sem arquivo: o .docx sai no layout padrão Delta (logo, CNPJ, tabelas e rodapé).'} Linhas de tabela com {{item_...}} ou {{parcela_...}} são repetidas por item.</div></div>
      <div class="row" style="gap:6px"><label class="btn sm pri" style="cursor:pointer">⬆ ${t.docx?'Trocar':'Importar'} .docx<input type="file" accept=".docx" style="display:none" onchange="ctUploadDocx('${t.id}',this)"></label><button class="btn sm" onclick="ctModeloDocx('${t.id}')">⬇ Modelo .docx editável</button>${t.docx?`<button class="btn sm danger" onclick="ctRmDocx('${t.id}')">✕ Remover</button>`:''}</div></div></div>
    <details class="resbox" style="margin:0 0 12px"><summary class="small" style="cursor:pointer;font-weight:700">Inserir campo ({{...}}) no ponto do cursor</summary><div class="ct-vars" style="margin-top:8px">${CT_VARS_LIST.flatMap(([,a])=>a).map(v=>`<button type="button" onmousedown="event.preventDefault()" onclick="ctInserirVar('${v}')">${v}</button>`).join('')}</div></details>
    <div class="ct-cl-ed"><div class="ct-cl-top"><span class="ct-ord">TÍTULO</span><input class="ct-cl-t" id="ctt_titulo" value="${esc(t.titulo)}"></div><textarea id="ctt_pre" rows="5">${esc(t.preambulo)}</textarea></div>
    ${(t.clausulas||[]).map((cl,i)=>`<div class="ct-cl-ed"><div class="ct-cl-top"><span class="ct-ord">${CT_ORD[i]||i+1}</span><input class="ct-cl-t" data-ti="${i}" value="${esc(cl.titulo)}"><button class="btn sm" ${i?'':'disabled'} onclick="ctTplMover(${i},-1)">↑</button><button class="btn sm" ${i<t.clausulas.length-1?'':'disabled'} onclick="ctTplMover(${i},1)">↓</button><button class="btn sm danger" onclick="ctTplRm(${i})">✕</button></div><textarea data-tx="${i}" rows="${Math.min(14,Math.max(4,Math.ceil(String(cl.texto).length/95)))}">${esc(cl.texto)}</textarea></div>`).join('')}
    <button class="btn" onclick="ctTplAdd()">+ Cláusula</button>
    <div class="ct-cl-ed" style="margin-top:12px"><div class="ct-cl-top"><span class="ct-ord">FECHO</span></div><textarea id="ctt_fecho" rows="3">${esc(t.fecho||'')}</textarea></div>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" onclick="ctTplPrevia('${t.id}')">👁 Prévia com exemplo</button><button class="btn pri" onclick="ctSalvarTpl('${t.id}')">Salvar modelo</button></div>
  </div>`);
  const b=document.getElementById('tplbody');b.addEventListener('focusin',e=>{if(e.target.matches('textarea,input.ct-cl-t'))ctCampoAtivo=e.target});
}
function ctLerTplForm(t){const g=id=>document.getElementById(id);t.nome=g('ctt_nome').value.trim()||t.nome;t.tipo=g('ctt_tipo').value;t.descricao=g('ctt_desc').value.trim();t.titulo=g('ctt_titulo').value;t.preambulo=g('ctt_pre').value;t.fecho=g('ctt_fecho').value;
  document.querySelectorAll('[data-ti]').forEach(i=>t.clausulas[+i.dataset.ti].titulo=i.value);document.querySelectorAll('[data-tx]').forEach(i=>t.clausulas[+i.dataset.tx].texto=i.value)}
function ctSalvarTpl(id){const t=ctTemplateDe(id);ctLerTplForm(t);save();toast('Modelo salvo — vale para os próximos contratos');viewCTemplates()}
function ctTplMover(i,d){const t=ctTemplateDe(ctTplEdit);ctLerTplForm(t);const a=t.clausulas,j=i+d;[a[i],a[j]]=[a[j],a[i]];save();viewCTemplates()}
function ctTplRm(i){const t=ctTemplateDe(ctTplEdit);ctLerTplForm(t);t.clausulas.splice(i,1);save();viewCTemplates()}
function ctTplAdd(){const t=ctTemplateDe(ctTplEdit);ctLerTplForm(t);t.clausulas.push({titulo:'NOVA CLÁUSULA',texto:''});save();viewCTemplates()}
function ctNovoTpl(){const b=JSON.parse(JSON.stringify(defaultCtTemplates()[1]));b.id='ctt_'+uid();b.nome='Novo modelo '+(ctTemplates().length+1);b.tipo='outro';b.descricao='Modelo personalizado';b.docx=null;ctTemplates().push(b);ctTplEdit=b.id;save();viewCTemplates()}
function ctDupTpl(id){const o=ctTemplateDe(id);const b=JSON.parse(JSON.stringify(o));b.id='ctt_'+uid();b.nome=o.nome+' (cópia)';ctTemplates().push(b);ctTplEdit=b.id;save();viewCTemplates()}
function ctExcluirTpl(id){if(!confirm('Excluir este modelo? Contratos já criados não mudam.'))return;S.cfg.ctTemplates=ctTemplates().filter(t=>t.id!==id);save();viewCTemplates()}
function ctRestaurarTpls(){if(!confirm('Restaurar os 3 modelos padrão? Modelos com o mesmo nome padrão serão substituídos; os seus personalizados continuam.'))return;const pad=defaultCtTemplates();S.cfg.ctTemplates=pad.concat(ctTemplates().filter(t=>!pad.some(p=>p.id===t.id)));save();viewCTemplates();toast('Modelos padrão restaurados')}
function ctExemploDe(t){const p=S.propostas.find(x=>x.status!=='rascunho'&&((x.tipoProposta==='eletrica')===(t.tipo==='eletrica')));let c;try{c=p?ctDeProposta(p.id,t.id):ctNovoBase(t)}catch(e){c=ctNovoBase(t)}
  Object.assign(c,{templateId:t.id,tipo:t.tipo,titulo:t.titulo,preambulo:t.preambulo,fecho:t.fecho,clausulas:JSON.parse(JSON.stringify(t.clausulas))});
  Object.assign(c.parte,{nome:c.parte.nome||'Cliente Exemplo',doc:c.parte.doc||'529.982.247-25',logradouro:'Rua Exemplo',numero:'100',bairro:'Centro',cidade:c.parte.cidade||'Pelotas',uf:'RS',cep:'96010-000'});c.codigo='CT-EXEMPLO';return c}
function ctTplPrevia(id){const t=ctTemplateDe(id);ctLerTplForm(t);const c=ctExemploDe(t);
  setHead('Prévia do modelo',t.nome+' · dados de exemplo',`<button class="btn" onclick="go('ctemplates')">← Voltar</button><button class="btn" onclick="window.print()">🖨️ Imprimir</button>`);V(ctPrevHtml(c))}
async function ctUploadDocx(id,input){
  const file=input&&input.files&&input.files[0];if(!file)return;if(!/\.docx$/i.test(file.name))return toast('Selecione um arquivo .docx');
  try{const b64=await new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(String(fr.result).split(',')[1]||'');fr.onerror=rej;fr.readAsDataURL(file)});
    const z=await JSZip.loadAsync(b64,{base64:true});if(!z.file('word/document.xml'))throw new Error('arquivo .docx inválido');
    const xml=await z.file('word/document.xml').async('string');const usados=new Set();xml.replace(/<[^>]+>/g,'').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,(_,k)=>usados.add(k));
    const t=ctTemplateDe(id);const meta={nome:file.name,tamanho:file.size,atualizadoEm:todayISO(),campos:[...usados]};
    if(GAS){const r=await gas('salvarArquivo','Contratos',`Template-${id}-${file.name}`,'application/vnd.openxmlformats-officedocument.wordprocessingml.document',b64);meta.fileId=r.id;meta.url=r.url}
    else{meta.localKey='ct_'+id;await docxStorePut(meta.localKey,b64)}
    t.docx=meta;save();toast(`Template .docx importado (${usados.size} campo(s) {{...}} encontrados)`);viewCTemplates();
  }catch(e){toast('Erro ao importar: '+(e&&e.message||e))}
}
async function ctRmDocx(id){const t=ctTemplateDe(id);if(t.docx&&t.docx.localKey)await docxStoreDel(t.docx.localKey);t.docx=null;save();viewCTemplates()}
async function ctModeloDocx(id){try{const t=ctTemplateDe(id);const c=ctExemploDe(t);c.codigo='{{contrato_numero}}';const r=ctRender(c,'modelo');
  const blob=await ctGerarDocx({codigo:'{{contrato_numero}}',render:r,empresa:{nome:S.cfg.empresa,cnpj:ctCfg().cnpj,crea:ctCfg().crea,email:ctCfg().email,site:S.cfg.site,whats:S.cfg.whats,whats2:S.cfg.whats2}},{},true);
  baixarBlob(blob,`Modelo-Contrato-${t.nome.replace(/[^a-zA-Z0-9]+/g,'-')}.docx`);toast('Modelo .docx baixado: edite no Word e importe de volta')}catch(e){toast('Erro: '+(e&&e.message||e))}}
/* ---- API para o Claude / MCP operar os contratos pela página ---- */
window.DeltaContratos={
  versao:'1.0',
  campos:()=>CT_VARS_LIST.map(([g,v])=>({grupo:g,campos:v})),
  templates:()=>ctTemplates().map(t=>({id:t.id,nome:t.nome,tipo:t.tipo,clausulas:t.clausulas.length,docx:!!t.docx})),
  listar:()=>ctLista().map(c=>({id:c.id,codigo:c.codigo,status:c.status,cliente:c.parte.nome,valor:ctTotal(c),templateId:c.templateId,propostaId:c.propostaId,link:linkContrato(c)})),
  obter:id=>JSON.parse(JSON.stringify(ctDe(id)||null)),
  variaveis:id=>{const c=ctDe(id);if(!c)return null;const v=ctVars(c);delete v.__rows;return v},
  faltando:id=>{const c=ctDe(id);return c?Object.assign(ctValidar(c),{campos:ctFaltando(c)}):null},
  texto:id=>{const c=ctDe(id);return c?ctTextoPlano(ctRender(c,'final')):null},
  criarDeProposta:(propostaId,templateId)=>{const c=ctDeProposta(propostaId,templateId);ctNumerar(c);ctLista().push(c);save();return c.id},
  criarManual:(dados,templateId)=>{const c=ctNovoBase(ctTemplateDe(templateId));ctAplicarPatch(c,dados||{});ctNumerar(c);logCt(c,'Criado via API');ctLista().push(c);save();return c.id},
  atualizar:(id,patch)=>{const c=ctDe(id);if(!c)throw new Error('contrato não encontrado');if(ctRO(c))throw new Error('contrato assinado: somente leitura');ctAplicarPatch(c,patch||{});logCt(c,'Atualizado via API');save();if(curHash()==='ct-'+id)viewContrato(id);return true},
  enviar:async id=>{await ctEnviar(id);closeModal();const c=ctDe(id);return {status:c.status,link:linkContrato(c)}},
  exportarDocx:id=>ctBaixarDocx(id),exportarPdf:id=>ctBaixarPdf(id),abrir:id=>go('ct-'+id)
};
function ctAplicarPatch(c,p){Object.keys(p).forEach(k=>{const v=p[k];if(v&&typeof v==='object'&&!Array.isArray(v)&&c[k]&&typeof c[k]==='object'&&!Array.isArray(c[k]))Object.assign(c[k],v);else c[k]=v})}
