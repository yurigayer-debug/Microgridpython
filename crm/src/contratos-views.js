/* ===================== Contratos · telas ===================== */
let ctFiltro='',ctPasso=0,ctTplEdit='',ctCampoAtivo=null;
const CT_PASSOS=['Contratante','Obra e kit','Preço e pagamento','Cláusulas','Revisar e enviar'];
const ctRO=c=>['assinado_cliente','concluido','cancelado'].includes(c.status);
function ctStatusPill(c){const st=CT_STATUS[c.status]||CT_STATUS.rascunho;return `<span class="pill ${st[1]}">${st[0]}</span>`}
function ctDiasEspera(c){const d=c.enviadoEm||c.criadoEm;return d?daysBetween(d,todayISO()):0}
function viewContratos(){
  setHead('Contratos','Gere contratos a partir da proposta aprovada ou manualmente, envie por WhatsApp/e-mail e receba a assinatura online.',
    `<button class="btn" onclick="go('ctemplates')">◧ Templates</button><button class="btn" onclick="ctModalVars()">📋 Campos</button><button class="btn sun" onclick="ctModalNovo()">+ Novo contrato</button>`);
  const L=ctLista(),mes=todayISO().slice(0,7),k=ctCfg();
  const aguard=L.filter(c=>['enviado','visualizado'].includes(c.status));
  const assMes=L.filter(c=>['assinado_cliente','concluido'].includes(c.status)&&String(c.assin&&c.assin.cliente&&c.assin.cliente.data||'').startsWith(mes));
  const lista=L.filter(c=>!ctFiltro||c.status===ctFiltro).slice().reverse();
  const chips=[['','Todos',L.length],...Object.entries(CT_STATUS).map(([s,v])=>[s,v[0],L.filter(c=>c.status===s).length]).filter(x=>x[2])];
  V(`<div class="grid kpis" style="margin-bottom:14px">
    ${kpi('Rascunhos',L.filter(c=>c.status==='rascunho').length,'em preparação')}
    ${kpi('Aguardando assinatura',aguard.length,brl(aguard.reduce((a,c)=>a+ctTotal(c),0)),null,aguard.filter(c=>ctDiasEspera(c)>k.lembreteDias).length)}
    ${kpi('Assinados no mês',assMes.length,brl(assMes.reduce((a,c)=>a+ctTotal(c),0)))}
    ${kpi('A contra-assinar',L.filter(c=>c.status==='assinado_cliente').length,'assinados pelo cliente')}
  </div>
  <div class="ct-chips">${chips.map(([s,n,q])=>`<button class="ct-chip ${ctFiltro===s?'on':''}" onclick="ctFiltro='${s}';viewContratos()">${esc(n)}<b>${q}</b></button>`).join('')}</div>
  <div class="card">${lista.length?`<table><tr><th>Nº</th><th>Contratante</th><th>Modelo</th><th class="num">Valor</th><th>Situação</th><th>Atualizado</th><th></th></tr>
  ${lista.map(c=>{const t=CT_TIPOS[c.tipo]||CT_TIPOS.outro;const esp=['enviado','visualizado'].includes(c.status)?ctDiasEspera(c):0;return `<tr><td class="mono">${esc(c.codigo||'—')}</td><td><b>${esc(c.parte.nome||'(sem nome)')}</b><div class="small muted">${esc([c.parte.cidade,c.parte.uf].filter(Boolean).join('/'))}</div></td><td>${t.ic} ${esc(ctTemplateDe(c.templateId).nome)}</td><td class="num">${brl(ctTotal(c))}</td><td>${ctStatusPill(c)}${esp>k.lembreteDias?` <span class="pill a">${esp} dias</span>`:''}</td><td>${esc((c.log&&c.log.length?c.log[c.log.length-1].quando:fdata(c.criadoEm)).split(',')[0])}</td><td class="num"><button class="btn sm pri" onclick="go('ct-${c.id}')">Abrir</button> <button class="btn sm" onclick="go('ctv-${c.id}')">Prévia</button></td></tr>`}).join('')}</table>`
  :`<div class="empty">Nenhum contrato ${ctFiltro?'nesta situação':'ainda'}. Use “+ Novo contrato” para gerar a partir de uma proposta aprovada ou em branco.</div>`}</div>`);
}
let _ctNovo={modo:'proposta',prop:'',tpl:''};
function ctModalNovo(propId){
  _ctNovo={modo:propId?'proposta':'proposta',prop:propId||'',tpl:''};ctRenderModalNovo();
}
function ctRenderModalNovo(){
  const props=S.propostas.filter(p=>p.status!=='rascunho').sort((a,b)=>(b.status==='aceita')-(a.status==='aceita'));
  const tpls=ctTemplates();
  if(_ctNovo.modo==='proposta'&&!_ctNovo.prop&&props.length)_ctNovo.prop=props[0].id;
  const pSel=props.find(p=>p.id===_ctNovo.prop);
  if(!_ctNovo.tpl)_ctNovo.tpl=(pSel&&pSel.tipoProposta==='eletrica')?'ct_eletrica':(tpls[0]||{}).id;
  openModal(`<h2>Novo contrato</h2>
    <div class="choice-grid">
      <div class="choice-card ${_ctNovo.modo==='proposta'?'on':''}" onclick="_ctNovo.modo='proposta';ctRenderModalNovo()"><b>📄 A partir de proposta</b><small>Puxa cliente, kit, valores e parcelas da proposta aprovada.</small></div>
      <div class="choice-card ${_ctNovo.modo==='manual'?'on':''}" onclick="_ctNovo.modo='manual';ctRenderModalNovo()"><b>✎ Em branco (manual)</b><small>Você digita contratante, kit e valores.</small></div>
    </div>
    ${_ctNovo.modo==='proposta'?(props.length?`<label class="f" style="margin-top:12px">Proposta<select onchange="_ctNovo.prop=this.value;_ctNovo.tpl='';ctRenderModalNovo()">${props.map(p=>`<option value="${p.id}" ${p.id===_ctNovo.prop?'selected':''}>${p.status==='aceita'?'✓ ':''}${numP(p)} · ${esc(p.nome)} · ${brl((p.snap||{}).final||calcProp(p).final)} · ${STATUS_PROP[p.status][0]}</option>`).join('')}</select></label>${pSel&&pSel.status!=='aceita'?'<div class="hint" style="margin-top:8px">Esta proposta ainda não foi aceita: os valores e parcelas vêm da opção A.</div>':''}`:'<div class="hint" style="margin-top:12px">Nenhuma proposta emitida ainda. Use o modo manual.</div>'):''}
    <div class="small muted" style="margin:14px 0 6px">Modelo de contrato:</div>
    <div class="choice-grid">${tpls.map(t=>`<div class="choice-card ${_ctNovo.tpl===t.id?'on':''}" onclick="_ctNovo.tpl='${t.id}';ctRenderModalNovo()"><b>${(CT_TIPOS[t.tipo]||CT_TIPOS.outro).ic} ${esc(t.nome)}</b><small>${esc(t.descricao||'')}</small></div>`).join('')}</div>
    <div class="row between" style="margin-top:16px"><button class="btn sm" onclick="closeModal();go('ctemplates')">⚙ Gerenciar modelos</button>
    <div class="row"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn sun" onclick="ctCriar()">Criar contrato →</button></div></div>`);
}
function ctCriar(){
  let c;
  try{
    if(_ctNovo.modo==='proposta'&&_ctNovo.prop)c=ctDeProposta(_ctNovo.prop,_ctNovo.tpl);
    else{c=ctNovoBase(ctTemplateDe(_ctNovo.tpl));logCt(c,'Criado em branco · '+ctTemplateDe(_ctNovo.tpl).nome)}
  }catch(e){return toast(String(e&&e.message||e))}
  ctNumerar(c);ctLista().push(c);save();closeModal();ctPasso=0;go('ct-'+c.id);toast('Contrato '+c.codigo+' criado');
}
function ctIn(c,path,label,type='text',extra=''){
  const w=/class="w2"/.test(extra);extra=extra.replace('class="w2"','');const v=ctGet(c,path);
  return `<label class="f${w?' w2':''}">${label}<input data-f="${path}" type="${type}" value="${esc(v??'')}" ${type==='number'?'step="any" data-num="1"':''} ${extra}></label>`;
}
function ctEndFields(c,base,cepId){
  return `<label class="f">CEP<div class="row" style="flex-wrap:nowrap;gap:6px"><input data-f="${base}.cep" inputmode="numeric" placeholder="00000-000" value="${esc(fmtCep(ctGet(c,base+'.cep')))}" style="flex:1" oninput="if(soDig(this.value).length===8)ctBuscarCep('${c.id}','${base}',this.value)"><button type="button" class="btn sm" onclick="ctBuscarCep('${c.id}','${base}',this.previousElementSibling.value)" title="Buscar endereço pelo CEP">🔎</button></div></label>
    ${ctIn(c,base+'.logradouro','Rua / logradouro','text','class="w2"')}${ctIn(c,base+'.numero','Número')}${ctIn(c,base+'.complemento','Complemento')}${ctIn(c,base+'.bairro','Bairro')}${ctIn(c,base+'.cidade','Cidade')}${ctIn(c,base+'.uf','UF','text','maxlength=2')}`;
}
async function ctBuscarCep(id,base,cep){
  const d=soDig(cep);if(d.length!==8)return toast('CEP deve ter 8 dígitos');
  const c=ctDe(id);if(!c)return;
  try{
    const r=await fetch(`https://viacep.com.br/ws/${d}/json/`);const j=await r.json();
    if(j.erro)return toast('CEP não encontrado — preencha o endereço manualmente');
    const e=ctGet(c,base);Object.assign(e,{cep:fmtCep(d),logradouro:j.logradouro||e.logradouro,bairro:j.bairro||e.bairro,cidade:j.localidade||e.cidade,uf:j.uf||e.uf});
    save();viewContrato(id);toast('Endereço preenchido pelo CEP');
    setTimeout(()=>{const n=document.querySelector(`[data-f="${base}.numero"]`);if(n)n.focus()},50);
  }catch(e){toast('Sem acesso à busca de CEP agora. Preencha manualmente.')}
}
function ctPassoHtml(c){
  const k=ctCfg(),ehSol=c.tipo==='solar',ehEl=c.tipo==='eletrica',ehAd=c.tipo==='aditivo';
  switch(ctPasso){
  case 0:return `<h3>Contratante</h3><div class="fg">
      <label class="f">Cliente cadastrado<select onchange="ctUsarCliente('${c.id}',this.value)"><option value="">— preencher manualmente —</option>${S.clientes.map(x=>`<option value="${x.id}" ${x.id===c.clienteId?'selected':''}>${esc(x.nome)}</option>`).join('')}</select></label>
      <label class="f">Tipo<select data-f="parte.tipo" data-rerender="1"><option value="PF" ${c.parte.tipo==='PF'?'selected':''}>Pessoa física (CPF)</option><option value="PJ" ${c.parte.tipo==='PJ'?'selected':''}>Pessoa jurídica (CNPJ)</option></select></label>
      ${ctIn(c,'parte.nome',c.parte.tipo==='PJ'?'Razão social *':'Nome completo *','text','class="w2"')}
      ${ctIn(c,'parte.doc',c.parte.tipo==='PJ'?'CNPJ *':'CPF *','text','inputmode="numeric"')}
      ${c.parte.tipo==='PJ'?ctIn(c,'parte.representante','Representante legal'):ctIn(c,'parte.rg','RG (opcional)')}
      ${ctIn(c,'parte.fone','WhatsApp','tel')}${ctIn(c,'parte.email','E-mail','email')}
    </div>
    <h3 style="margin-top:16px">Endereço do contratante</h3><div class="fg">${ctEndFields(c,'parte')}</div>
    ${ehAd?`<h3 style="margin-top:16px">Aditivo</h3><div class="fg"><label class="f">Contrato original<select data-f="contratoOriginal"><option value="">—</option>${ctLista().filter(x=>x.id!==c.id&&x.tipo!=='aditivo').map(x=>`<option value="${esc(x.codigo)}" ${x.codigo===c.contratoOriginal?'selected':''}>${esc(x.codigo)} · ${esc(x.parte.nome)}</option>`).join('')}</select></label><label class="f w2">O que muda (objeto do aditivo) *<textarea data-f="aditivoDesc" rows="3">${esc(c.aditivoDesc||'')}</textarea></label></div>`:''}`;
  case 1:return `<h3>Local da obra</h3>
    <label class="small" style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><input type="checkbox" data-f="obra.mesmo" data-rerender="1" ${c.obra.mesmo!==false?'checked':''}> A obra é no mesmo endereço do contratante</label>
    <div class="fg">${c.obra.mesmo!==false?'':ctEndFields(c,'obra')}${ctIn(c,'obra.concessionaria','Concessionária')}${ctIn(c,'obra.uc','Unidade consumidora (UC)')}</div>
    ${ehSol?`<div class="row between" style="margin-top:18px"><h3 style="margin:0">Kit solar do contrato</h3><div class="row">${c.propostaId?`<button class="btn sm" onclick="ctPuxarProposta('${c.id}')">↻ Puxar da proposta</button>`:''}<select class="btn sm" onchange="ctPuxarKit('${c.id}',this.value)"><option value="">Puxar do catálogo de kits…</option>${S.kits.map(x=>`<option value="${x.id}">${esc(x.nome)}</option>`).join('')}</select></div></div>
    <div class="small muted" style="margin:4px 0 10px">Seção própria do contrato: o que for alterado aqui não muda a proposta.</div>
    <div class="fg">${ctIn(c,'kit.modQtd','Nº de módulos','number')}${ctIn(c,'kit.modWp','Potência do módulo (Wp)','number')}${ctIn(c,'kit.modMarca','Marca / classe dos módulos')}
      ${ctIn(c,'kit.invQtd','Qtd. de inversores','number')}${ctIn(c,'kit.invDesc','Inversor / microinversor','text','class="w2"')}${ctIn(c,'kit.invKw','Potência de cada inversor (kW)','number')}
      ${ctIn(c,'kit.batDesc','Bateria (opcional)','text','class="w2"')}
      <label class="f">Tipo de telhado<select data-f="kit.telhado">${['Telhado Fibrocimento','Telhado Cerâmico','Telhado Metálico','Laje','Solo','Carport'].map(x=>`<option ${x===c.kit.telhado?'selected':''}>${x}</option>`).join('')}</select></label>
      ${ctIn(c,'kit.estruturaMaterial','Material da estrutura')}
      <label class="f w2">Outros itens do kit (1 por linha)<textarea data-f="kit.extras" rows="2">${esc(c.kit.extras||'')}</textarea></label>
      <label class="f w2">Inclusos no objeto (Parágrafo primeiro)<textarea data-f="incluso" rows="2">${esc(c.incluso||'')}</textarea></label></div>
    <div class="resbox"><b class="small">Como aparece no contrato</b><div class="small" style="white-space:pre-line;margin-top:6px">${esc(ctListaKit(c))||'—'}</div></div>`:''}
    ${ehEl?`<h3 style="margin-top:18px">Escopo do serviço elétrico</h3><div class="fg"><label class="f w2">Escopo *<textarea data-f="elEscopo" rows="3">${esc(c.elEscopo||'')}</textarea></label>${ctIn(c,'elNormas','Normas','text','class="w2"')}${ctIn(c,'elPrazo','Prazo (dias úteis)','number')}${ctIn(c,'elGarantia','Garantia')}<label class="small" style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-f="elArt" ${c.elArt!==false?'checked':''}> Com ART/TRT</label></div>`:''}`;
  case 2:{const tot=ctTotal(c),sp=Math.round((c.parcelas||[]).reduce((a,p)=>a+num(p.valor),0)*100)/100;
    return `<div class="row between"><h3 style="margin:0">Itens e valores</h3><div class="row"><button class="btn sm" onclick="ctAddLinha('${c.id}','itens')">+ Item</button><button class="btn sm" onclick="ctItensModelo('${c.id}')">↻ Montar itens padrão</button></div></div>
    <div class="fg" style="margin:10px 0"><label class="f">Valor total do contrato (R$)<input data-f="totalManual" type="number" step="0.01" data-num="1" value="${esc(ctTotal(c))}"></label><div class="small muted" style="align-self:end">Ao digitar o total, os itens são redistribuídos na mesma proporção.</div></div>
    <table class="ct-tbl" style="margin-top:8px"><tr class="h"><th>#</th><th>Descrição</th>${c.tipo==='solar'?'<th>kWp</th>':''}<th>Fornecedor</th><th class="num">Valor (R$)</th><th></th></tr>
    ${(c.itens||[]).map((it,i)=>`<tr><td data-l="Item">${i+1}</td><td data-l="Descrição"><input data-f="itens.${i}.desc" value="${esc(it.desc)}"></td>${c.tipo==='solar'?`<td data-l="kWp" style="width:80px"><input data-f="itens.${i}.kwp" value="${esc(it.kwp||'')}"></td>`:''}<td data-l="Fornecedor" style="width:130px"><input data-f="itens.${i}.fornecedor" value="${esc(it.fornecedor||'')}"></td><td data-l="Valor" style="width:130px"><input data-f="itens.${i}.valor" data-num="1" type="number" step="0.01" value="${esc(it.valor)}" style="text-align:right"></td><td><button class="btn sm danger" onclick="ctRmLinha('${c.id}','itens',${i})" aria-label="Remover item">✕</button></td></tr>`).join('')}</table>
    <div class="resbox resgrid"><div><small>Valor total</small><b id="ctTot">${brl(tot)}</b></div><div style="grid-column:span 2"><small>Por extenso</small><b style="font-size:13px" id="ctExt">${esc(extensoReais(tot))}</b></div></div>
    <div class="row between" style="margin-top:18px"><h3 style="margin:0">Parcelas</h3><div class="row"><button class="btn sm" onclick="ctAddLinha('${c.id}','parcelas')">+ Parcela</button><button class="btn sm" onclick="ctDividir('${c.id}')">÷ Dividir o total</button></div></div>
    <table class="ct-tbl" style="margin-top:8px"><tr class="h"><th>Data</th><th>Descrição</th><th class="num">Valor (R$)</th><th></th></tr>
    ${(c.parcelas||[]).map((p,i)=>`<tr><td data-l="Data" style="width:150px"><input type="date" data-f="parcelas.${i}.data" value="${esc(p.data)}"></td><td data-l="Descrição"><input data-f="parcelas.${i}.desc" value="${esc(p.desc)}"></td><td data-l="Valor" style="width:140px"><input data-f="parcelas.${i}.valor" data-num="1" type="number" step="0.01" value="${esc(p.valor)}" style="text-align:right"></td><td><button class="btn sm danger" onclick="ctRmLinha('${c.id}','parcelas',${i})" aria-label="Remover parcela">✕</button></td></tr>`).join('')}</table>
    <div id="ctParcAviso">${Math.abs(sp-tot)>0.009?`<div class="err" style="margin-top:8px">As parcelas somam ${brl(sp)} e o total é ${brl(tot)}.</div>`:''}</div>
    <div class="fg" style="margin-top:14px"><label class="f w2">Forma de pagamento (texto no contrato)<textarea data-f="formaPagto" rows="2">${esc(c.formaPagto||'')}</textarea></label>
      ${c.tipo==='solar'?ctIn(c,'prazoDias','Prazo de conclusão (dias após aprovação)','number')+ctIn(c,'garantiaAnos','Garantia adicional da CONTRATADA (anos)','number'):''}
      ${ctIn(c,'cidade','Cidade da assinatura')}${ctIn(c,'data','Data do contrato','date')}</div>
    <div class="small muted" style="margin-top:8px">Dados bancários, multas, foro e responsável técnico vêm de Configurações → Contratos.</div>`}
  case 3:{const tpl=ctTemplateDe(c.templateId);
    return `<div class="row between"><h3 style="margin:0">Cláusulas</h3><div class="row"><select class="btn sm" onchange="ctTrocarTemplate('${c.id}',this.value)">${ctTemplates().map(t=>`<option value="${t.id}" ${t.id===c.templateId?'selected':''}>${esc(t.nome)}</option>`).join('')}</select><button class="btn sm" onclick="ctModalVars()">📋 Campos</button></div></div>
    <div class="small muted" style="margin:6px 0 10px">Edite o texto livremente. Toque num campo abaixo para inserir no ponto do cursor. <b>**texto**</b> = negrito · linha começando com “• ” = tópico.</div>
    <details class="resbox" style="margin:0 0 12px"><summary class="small" style="cursor:pointer;font-weight:700">Inserir campo ({{...}})</summary><div class="ct-vars" style="margin-top:8px">${CT_VARS_LIST.flatMap(([,a])=>a).map(v=>`<button type="button" onmousedown="event.preventDefault()" onclick="ctInserirVar('${v}')">${v}</button>`).join('')}</div></details>
    <div class="ct-cl-ed"><div class="ct-cl-top"><span class="ct-ord">TÍTULO</span><input class="ct-cl-t" data-f="titulo" value="${esc(c.titulo)}"></div><textarea data-f="preambulo" rows="5" aria-label="Preâmbulo">${esc(c.preambulo)}</textarea></div>
    ${(c.clausulas||[]).map((cl,i)=>`<div class="ct-cl-ed"><div class="ct-cl-top"><span class="ct-ord">${CT_ORD[i]||i+1}</span><input class="ct-cl-t" data-f="clausulas.${i}.titulo" value="${esc(cl.titulo)}" aria-label="Título da cláusula"><button class="btn sm" ${i?'':'disabled'} onclick="ctMoverCl('${c.id}',${i},-1)" aria-label="Subir">↑</button><button class="btn sm" ${i<c.clausulas.length-1?'':'disabled'} onclick="ctMoverCl('${c.id}',${i},1)" aria-label="Descer">↓</button><button class="btn sm danger" onclick="ctRmCl('${c.id}',${i})" aria-label="Remover cláusula">✕</button></div><textarea data-f="clausulas.${i}.texto" rows="${Math.min(16,Math.max(4,Math.ceil(String(cl.texto).length/95)+String(cl.texto).split('\n').length))}">${esc(cl.texto)}</textarea></div>`).join('')}
    <button class="btn" onclick="ctAddCl('${c.id}')">+ Cláusula</button>
    <div class="ct-cl-ed" style="margin-top:12px"><div class="ct-cl-top"><span class="ct-ord">FECHO</span></div><textarea data-f="fecho" rows="4">${esc(c.fecho||'')}</textarea></div>
    <h3 style="margin-top:16px">Testemunhas (opcional)</h3><div class="fg">${ctIn(c,'testemunhas.0.nome','Testemunha 1 — nome')}${ctIn(c,'testemunhas.0.doc','RG/CPF')}${ctIn(c,'testemunhas.1.nome','Testemunha 2 — nome')}${ctIn(c,'testemunhas.1.doc','RG/CPF')}</div>`}
  case 4:return ctRevisarHtml(c);
  }
}
function ctValidar(c){
  const e=[],w=[];const pt=c.parte;
  if(!String(pt.nome||'').trim())e.push('Nome do contratante');
  if(!soDig(pt.doc))e.push(pt.tipo==='PJ'?'CNPJ':'CPF');else if(!validDoc(pt.doc))e.push((pt.tipo==='PJ'?'CNPJ':'CPF')+' válido');
  if(!pt.logradouro)e.push('Endereço do contratante');if(!soDig(pt.cep))w.push('CEP do contratante não informado');
  if(c.obra.mesmo===false&&!c.obra.logradouro)e.push('Endereço da obra');
  if(c.tipo==='solar'&&(!num(c.kit.modQtd)||!num(c.kit.modWp)||!c.kit.invDesc))e.push('Kit solar (módulos e inversor)');
  if(c.tipo==='eletrica'&&!String(c.elEscopo||'').trim())e.push('Escopo do serviço elétrico');
  if(c.tipo==='aditivo'&&!String(c.aditivoDesc||'').trim())e.push('Objeto do aditivo');
  const tot=ctTotal(c);if(!tot)e.push('Itens com valor');
  const sp=(c.parcelas||[]).reduce((a,p)=>a+num(p.valor),0);if(!(c.parcelas||[]).length)e.push('Parcelas');else if(Math.abs(sp-tot)>0.009)e.push('Parcelas somando o total');
  const f=ctFaltando(c).filter(k=>!['testemunha1_nome','testemunha1_doc','testemunha2_nome','testemunha2_doc','assinatura_data','assinatura_hash','uc','cliente_rg','cliente_complemento','cliente_representante','kit_bat_desc','contrato_original','aditivo_descricao'].includes(k));
  if(f.length)w.push('Campos vazios no texto: '+f.join(', '));
  if(!pt.email&&!pt.fone)w.push('Sem e-mail e sem WhatsApp do contratante para o envio');
  if(c.propostaId){const pr=S.propostas.find(x=>x.id===c.propostaId);if(pr){const ref=num((pr.snap||{}).final)||calcProp(pr).final;
    if(Math.abs(ref-ctTotal(c))>0.5)w.push(`Total do contrato (${brl(ctTotal(c))}) difere da proposta (${brl(ref)}). Confirme que a diferença é intencional.`)}}
  return {e,w};
}
function ctRevisarHtml(c){
  const {e,w}=ctValidar(c);const link=linkContrato(c);const ro=ctRO(c);const snapDif=c.snap&&c.status!=='rascunho'&&!ro;
  const ck=(ok,t)=>`<div class="ct-check"><span class="i">${ok?'✅':'⬜'}</span><span>${t}</span></div>`;
  return `<h3>Revisar e enviar</h3>
    ${e.length?`<div class="err" style="margin-bottom:10px"><b>Falta para enviar:</b> ${e.map(esc).join(' · ')}</div>`:'<div class="hint" style="margin-bottom:10px;background:var(--pg);border-color:var(--pg);color:var(--pgi)">✓ Tudo pronto para enviar.</div>'}
    ${w.length?`<div class="hint" style="margin-bottom:10px">${w.map(esc).join('<br>')}</div>`:''}
    ${snapDif?`<div class="hint" style="margin-bottom:10px">Se você alterou algo depois do envio, toque em <b>Reenviar</b> para atualizar o que o cliente vê.</div>`:''}
    ${link?`<div class="small" style="margin-bottom:10px">Link de assinatura: <span class="mono" style="word-break:break-all">${esc(link)}</span> <button class="btn sm" onclick="navigator.clipboard&&navigator.clipboard.writeText('${esc(link)}');toast('Link copiado')">Copiar</button></div>`:(!GAS?'<div class="hint" style="margin-bottom:10px">Modo navegador: o link remoto de assinatura funciona no modo Google (Apps Script + Contratos.gs). Aqui você pode colher a assinatura <b>presencialmente</b> neste aparelho, ou enviar o PDF.</div>':(c.status!=='rascunho'&&!S.cfg.urlPublica?'<div class="hint">Configure a URL pública em Configurações para gerar o link.</div>':''))}
    ${c.pdfUrl?`<div class="hint" style="margin-bottom:10px;background:var(--pg);border-color:var(--pg);color:var(--pgi)">📎 PDF assinado guardado no servidor: <a href="${esc(c.pdfUrl)}" target="_blank" rel="noopener">abrir</a></div>`:''}
    <div class="ct-acts">
      ${ro?'':`<button class="btn sun" onclick="ctEnviar('${c.id}')">📤 ${c.status==='rascunho'?'Gerar e enviar para assinatura':'Reenviar (atualizar)'}</button>`}
      <button class="btn ok" onclick="ctModalWhats('${c.id}')">💬 Enviar por WhatsApp</button>
      <button class="btn" onclick="ctModalEmail('${c.id}')">✉ Enviar por e-mail</button>
      <button class="btn" onclick="ctCompartilhar('${c.id}')">📲 Compartilhar PDF</button>
      <button class="btn" onclick="ctBaixarPdf('${c.id}')">⬇ Baixar PDF</button>
      <button class="btn" onclick="ctBaixarDocx('${c.id}')">📄 Baixar .docx</button>
      <button class="btn" onclick="go('ctv-${c.id}')">👁 Prévia do documento</button>
      ${c.status!=='rascunho'&&!(c.assin&&c.assin.cliente)?`<button class="btn" onclick="go('ca-${c.id}')">✍ Assinatura presencial (cliente)</button>`:''}
      ${c.assin&&c.assin.cliente&&!(c.assin&&c.assin.empresa)?`<button class="btn pri" onclick="ctContraAssinar('${c.id}')">✍ Contra-assinar (empresa)</button>`:''}
      ${GAS&&c.token&&!ro?`<button class="btn" onclick="ctRevogar('${c.id}')">⛔ Revogar link</button>`:''}
      <button class="btn" onclick="ctDuplicar('${c.id}')">⧉ Duplicar</button>
      ${c.tipo!=='aditivo'&&['assinado_cliente','concluido'].includes(c.status)?`<button class="btn" onclick="ctNovoAditivo('${c.id}')">＋ Termo aditivo</button>`:''}
      ${c.status!=='cancelado'&&c.status!=='concluido'?`<button class="btn danger" onclick="ctCancelar('${c.id}')">Cancelar contrato</button>`:''}
    </div>
    <h3 style="margin-top:18px">Documentos do cliente</h3>
    ${CT_DOCS.map(([k,t])=>`<label class="ct-check" style="cursor:pointer"><input type="checkbox" ${c.docs&&c.docs[k]?'checked':''} onchange="ctDoc('${c.id}','${k}',this.checked)"><span>${t}</span></label>`).join('')}
    <h3 style="margin-top:18px">Andamento</h3>
    ${ck(c.status!=='rascunho','Enviado ao cliente'+(c.enviadoEm?' em '+fdata(c.enviadoEm):''))}${ck(!!c.visualizadoEm||!!(c.assin&&c.assin.cliente),'Aberto pelo cliente'+(c.visualizadoEm?' em '+esc(c.visualizadoEm):''))}${ck(!!(c.assin&&c.assin.cliente),'Assinado pelo cliente'+(c.assin&&c.assin.cliente?' — '+esc(c.assin.cliente.nome)+' em '+esc(c.assin.cliente.quando):''))}${ck(!!(c.assin&&c.assin.empresa),'Contra-assinado pela empresa')}
    ${c.log&&c.log.length?`<h3 style="margin-top:18px">Histórico</h3><table>${c.log.slice().reverse().map(l=>`<tr><td class="mono" style="white-space:nowrap">${esc(l.quando)}</td><td>${esc(l.o)}</td></tr>`).join('')}</table>`:''}`;
}
function ctPassoBar(c){
  const i=ctPasso,ult=i>=CT_PASSOS.length-1,pct=Math.round((i+1)/CT_PASSOS.length*100);
  return `<div class="pb-prog"><i style="width:${pct}%"></i></div>
  <button class="pb-info" onclick="ctListaPassos('${c.id}')"><span>Passo ${i+1} de ${CT_PASSOS.length} · <b>${CT_PASSOS[i]}</b> ▾</span><span class="pb-preco">${brl(ctTotal(c))}</span></button>
  <div class="pb-botoes"><button class="btn pb-btn pb-ant" ${i>0?`onclick="ctIr('${c.id}',${i-1})"`:'disabled'}><span class="pb-seta">◀</span><span class="pb-txt"><small>Anterior</small>${i>0?CT_PASSOS[i-1]:'—'}</span></button>
  ${!ult?`<button class="btn sun pb-btn" onclick="ctIr('${c.id}',${i+1})"><span class="pb-txt"><small>Próximo</small>${CT_PASSOS[i+1]}</span><span class="pb-seta">▶</span></button>`
    :(ctRO(c)?`<button class="btn ok pb-btn" onclick="ctModalWhats('${c.id}')"><span class="pb-txt"><small>Compartilhar</small>WhatsApp</span><span class="pb-seta">💬</span></button>`:`<button class="btn ok pb-btn" onclick="ctEnviar('${c.id}')"><span class="pb-txt"><small>Concluir</small>${c.status==='rascunho'?'Enviar p/ assinatura':'Reenviar'}</span><span class="pb-seta">📤</span></button>`)}</div>`;
}
function ctIr(id,j){ctPasso=Math.max(0,Math.min(CT_PASSOS.length-1,j));viewContrato(id);window.scrollTo(0,0)}
function ctListaPassos(id){openModal(`<h2>Ir para o passo</h2><div class="pb-lista">${CT_PASSOS.map((t,j)=>`<button class="btn ${j===ctPasso?'pri':''}" onclick="closeModal();ctIr('${id}',${j})"><span class="pb-n">${j+1}</span>${t}</button>`).join('')}</div><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" onclick="closeModal()">Fechar</button></div>`)}
function ctPrevHtml(c){const r=ctRender(c,'marca');return ctDocHtml({codigo:c.codigo,render:r,empresa:{nome:S.cfg.empresa,cnpj:ctCfg().cnpj,crea:ctCfg().crea,email:ctCfg().email,site:S.cfg.site,whats:S.cfg.whats,whats2:S.cfg.whats2}},c.assin)}
function viewContrato(id){
  const c=ctDe(id);if(!c){go('contratos');return}
  const ro=ctRO(c);const tpl=ctTemplateDe(c.templateId);
  setHead(`Contrato ${c.codigo||''}`,`${c.parte.nome||'Novo contrato'} · ${(CT_TIPOS[c.tipo]||CT_TIPOS.outro).label} · ${(CT_STATUS[c.status]||CT_STATUS.rascunho)[0]}${ro?' · somente leitura':''}`,
    `<button class="btn" onclick="go('contratos')">← Voltar</button><button class="btn" onclick="go('ctv-${c.id}')">👁 Prévia</button><button class="btn ok" onclick="ctIr('${c.id}',4)">📤 Enviar</button>`);
  V(`<div class="tpl-bar"><span class="pill ${c.tipo==='eletrica'?'b':c.tipo==='aditivo'?'s':'g'}">${(CT_TIPOS[c.tipo]||CT_TIPOS.outro).ic} ${esc(tpl.nome)}</span>${ctStatusPill(c)}${c.propostaId?`<a class="small" href="#prop-${c.propostaId}">Proposta vinculada ›</a>`:''}<span class="small muted" style="margin-left:auto">${esc(c.codigo||'')}</span></div>
  <div class="tabs">${CT_PASSOS.map((t,i)=>`<button class="tab ${i===ctPasso?'on':''}" onclick="ctIr('${c.id}',${i})">${i+1} · ${t}</button>`).join('')}</div>
  <div class="passobar" id="passobar">${ctPassoBar(c)}</div>
  <div class="ct-grid2"><div class="card" id="tabbody" ${ro&&ctPasso<4?'style="pointer-events:none;opacity:.85"':''}>${ctPassoHtml(c)}</div>
  <div class="card ct-prev" id="ctPrev"><div class="ct-prev-h"><span>Prévia ao vivo</span><button class="btn sm" onclick="go('ctv-${c.id}')">Abrir ⤢</button></div><div id="ctPrevBody">${ctPrevHtml(c)}</div></div></div>`);
  const body=document.getElementById('tabbody');
  const val=el=>el.type==='checkbox'?el.checked:(el.dataset.num?num(el.value):el.value);
  let tmr=null;
  body.addEventListener('focusin',e=>{if(e.target.matches('textarea,input.ct-cl-t'))ctCampoAtivo=e.target});
  body.addEventListener('input',e=>{const f=e.target.dataset.f;if(!f||ro||f==='totalManual')return;ctSet(c,f,val(e.target));
    if(f.startsWith('itens.')||f.startsWith('parcelas.')){const t=ctTotal(c),sp=(c.parcelas||[]).reduce((a,p)=>a+num(p.valor),0);const a=document.getElementById('ctTot');if(a)a.textContent=brl(t);const b=document.getElementById('ctExt');if(b)b.textContent=extensoReais(t);const d=document.getElementById('ctParcAviso');if(d)d.innerHTML=Math.abs(sp-t)>0.009?`<div class="err" style="margin-top:8px">As parcelas somam ${brl(sp)} e o total é ${brl(t)}.</div>`:'';const tm=document.querySelector('[data-f="totalManual"]');if(tm&&document.activeElement!==tm)tm.value=t;const pb=document.getElementById('passobar');if(pb)pb.innerHTML=ctPassoBar(c)}
    clearTimeout(tmr);tmr=setTimeout(()=>{save();const pv=document.getElementById('ctPrevBody');if(pv&&getComputedStyle(document.getElementById('ctPrev')).display!=='none')pv.innerHTML=ctPrevHtml(c)},450)});
  body.addEventListener('change',e=>{const f=e.target.dataset.f;if(f==='totalManual'&&!ro){ctDistribuirTotal(c,num(e.target.value));save();viewContrato(id);return}if(!f||ro)return;ctSet(c,f,val(e.target));if(f==='parte.doc'&&soDig(e.target.value).length===14&&c.parte.tipo!=='PJ'){c.parte.tipo='PJ';e.target.dataset.rerender=1}save();if(e.target.dataset.rerender)viewContrato(id)});
}
function ctInserirVar(v){const t=ctCampoAtivo;if(!t||!document.body.contains(t)){navigator.clipboard&&navigator.clipboard.writeText(v);return toast('Toque antes no texto da cláusula. Copiado: '+v)}
  const s=t.selectionStart??t.value.length,e=t.selectionEnd??s;t.value=t.value.slice(0,s)+v+t.value.slice(e);t.focus();t.selectionStart=t.selectionEnd=s+v.length;t.dispatchEvent(new Event('input',{bubbles:true}))}
function ctUsarCliente(id,cid){const c=ctDe(id),x=S.clientes.find(y=>y.id===cid);if(!c||!x)return;c.clienteId=x.id;Object.assign(c.parte,{nome:x.nome,doc:x.doc||c.parte.doc,fone:x.fone||c.parte.fone,email:x.email||c.parte.email,cidade:x.cidade||c.parte.cidade,uf:x.uf||c.parte.uf,tipo:soDig(x.doc).length===14?'PJ':'PF'});save();viewContrato(id)}
function ctPuxarProposta(id){const c=ctDe(id);const n=ctDeProposta(c.propostaId,c.templateId);c.kit=n.kit;c.itens=n.itens;c.parcelas=n.parcelas;logCt(c,'Kit, itens e parcelas atualizados pela proposta');save();viewContrato(id);toast('Dados puxados da proposta')}
function ctPuxarKit(id,kid){const c=ctDe(id),k=S.kits.find(x=>x.id===kid);if(!c||!k)return;const m=/^(\d+)\s*[×x]\s*(.*)$/.exec(k.inversor||'');Object.assign(c.kit,{modQtd:k.nMod,modWp:k.modWp,invQtd:m?+m[1]:1,invDesc:m?m[2]:k.inversor,invKw:m?num(k.invKw)/+m[1]:k.invKw,batDesc:k.bateria||''});save();viewContrato(id);toast('Kit aplicado')}
function ctAddLinha(id,col){const c=ctDe(id);(c[col]=c[col]||[]).push(col==='itens'?{desc:'',kwp:'',fornecedor:S.cfg.empresa||'Delta Solar',valor:0}:{data:addDays(todayISO(),30),desc:'Parcela',valor:0});save();viewContrato(id)}
function ctRmLinha(id,col,i){const c=ctDe(id);c[col].splice(i,1);save();viewContrato(id)}
/* Total digitado: os itens são redistribuídos na mesma proporção; o centavo de diferença vai para o último item */
function ctDistribuirTotal(c,alvo){const its=c.itens||[],atual=ctTotal(c);if(!its.length||!(alvo>0)){toast('Informe o valor total e pelo menos um item');return}
  if(!atual){its.forEach(it=>it.valor=0);its[0].valor=alvo;logCt(c,'Valor total definido: '+brl(alvo));return}
  const f=alvo/atual;let soma=0;its.forEach((it,i)=>{if(i<its.length-1){it.valor=Math.round(num(it.valor)*f*100)/100;soma+=it.valor}});
  its[its.length-1].valor=Math.round((alvo-soma)*100)/100;logCt(c,'Valor total ajustado para '+brl(alvo))}
function ctItensModelo(id){const c=ctDe(id);const t=ctTotal(c)||num(prompt('Valor total do contrato (R$):','0'));c.itens=ctItensPadrao(t,c.tipo==='solar'?ctKwp(c):0,c.tipo==='eletrica');save();viewContrato(id)}
function ctDividir(id){const c=ctDe(id);const n=parseInt(prompt('Dividir o total em quantas parcelas?','2'))||0;if(n<1)return;const t=ctTotal(c),v=Math.floor(t/n*100)/100;
  c.parcelas=Array.from({length:n},(_,i)=>({data:addDays(c.data||todayISO(),i===0?3:30*i),desc:n===1?'Parcela única':(i===0?'Sinal':`Parcela ${i+1}/${n}`),valor:i===n-1?Math.round((t-v*(n-1))*100)/100:v}));save();viewContrato(id)}
function ctTrocarTemplate(id,tid){const c=ctDe(id),t=ctTemplateDe(tid);if(!confirm(`Trocar para o modelo "${t.nome}"? As cláusulas atuais deste contrato serão substituídas.`))return viewContrato(id);
  Object.assign(c,{templateId:t.id,tipo:t.tipo,titulo:t.titulo,preambulo:t.preambulo,fecho:t.fecho||CT_FECHO_PADRAO,clausulas:JSON.parse(JSON.stringify(t.clausulas))});logCt(c,'Modelo trocado para '+t.nome);save();viewContrato(id)}
function ctMoverCl(id,i,d){const c=ctDe(id),a=c.clausulas;const j=i+d;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];save();viewContrato(id)}
function ctRmCl(id,i){const c=ctDe(id);if(!confirm('Remover a cláusula "'+c.clausulas[i].titulo+'"?'))return;c.clausulas.splice(i,1);save();viewContrato(id)}
function ctAddCl(id){const c=ctDe(id);c.clausulas.push({titulo:'NOVA CLÁUSULA',texto:''});save();viewContrato(id);setTimeout(()=>{const t=document.querySelectorAll('#tabbody .ct-cl-ed textarea');const x=t[t.length-2];if(x){x.focus();x.scrollIntoView({block:'center'})}},50)}
function ctDoc(id,k,v){const c=ctDe(id);c.docs=c.docs||{};c.docs[k]=v;save()}
async function ctEnviar(id){
  const c=ctDe(id);if(!c||ctRO(c))return;const {e}=ctValidar(c);
  if(e.length){ctIr(id,4);return toast('Falta: '+e.join(', '))}
  ctNumerar(c);c.token=c.token||token();c.snap=await ctSnapshot(c);
  const novo=c.status==='rascunho';if(novo){c.status='enviado';c.enviadoEm=todayISO()}
  logCt(c,novo?'Contrato gerado e liberado para assinatura':'Contrato reenviado (texto atualizado)');
  if(GAS){try{save();clearTimeout(save._t);await flush();await gas('publicarContrato',{id:c.id,token:c.token,snap:c.snap,html:ctDocHtml(c.snap,{}),nome:c.parte.nome,email:c.parte.email,status:c.status});}catch(err){toast('Falha ao publicar no Google: '+(err&&err.message||err))}}
  save();ctPasso=4;viewContrato(id);ctModalWhats(id);
}
function ctMsg(c){
  const link=linkContrato(c),first=String(c.parte.nome||'').split(' ')[0];const s=c.snap||{resumo:{}};
  return `Olá, ${first}! Segue o seu contrato nº ${c.codigo} com a ${S.cfg.empresa}:\n• ${s.resumo.objeto||''}\n• Valor total: ${brl(ctTotal(c))}\n${link?'Leia com calma e assine online pelo link (leva 1 minuto):\n'+link:'Segue o PDF do contrato para leitura e assinatura.'}`+assinaturaMsg();
}
function ctModalWhats(id){
  const c=ctDe(id);if(!c)return;const txt=ctMsg(c),fone=c.parte.fone;const wa=waHref(fone,txt);
  openModal(`<h2>Enviar por WhatsApp</h2><textarea id="msgWa" style="width:100%" rows="9">${esc(txt)}</textarea>
    <div class="small muted">${wa?`Vai para ${esc(fmtZap(fone))}.`:'Cadastre o WhatsApp do contratante no passo 1.'}${linkContrato(c)?'':' Sem link remoto: use “Compartilhar PDF” para anexar o arquivo no WhatsApp.'}</div>
    <div class="row" style="justify-content:flex-end;margin-top:10px;flex-wrap:wrap"><button class="btn" onclick="closeModal()">Fechar</button><button class="btn" onclick="copiarMsgWa()">Copiar</button><button class="btn" onclick="ctCompartilhar('${c.id}')">📲 Compartilhar PDF</button>${wa?`<button class="btn ok" onclick="abrirWa('${soDig(fone)}');ctLogEnvio('${c.id}','WhatsApp')">Abrir no WhatsApp</button>`:''}</div>`);
}
function ctLogEnvio(id,canal){const c=ctDe(id);if(c){logCt(c,'Enviado por '+canal);save()}}
function ctModalEmail(id){
  const c=ctDe(id);if(!c)return;const link=linkContrato(c);
  const assunto=`Contrato ${c.codigo} — ${S.cfg.empresa}`;
  const corpo=ctMsg(c).replace(/^Olá/,'Olá')+(link?'':'\n\n(O PDF do contrato segue em anexo.)');
  openModal(`<h2>Enviar por e-mail</h2><div class="fg"><label class="f w2">Para<input id="em_para" type="email" value="${esc(c.parte.email||'')}"></label><label class="f w2">Assunto<input id="em_ass" value="${esc(assunto)}"></label><label class="f w2">Mensagem<textarea id="em_corpo" rows="8">${esc(corpo)}</textarea></label></div>
    <div class="small muted" style="margin-top:6px">${GAS?'“Enviar pelo Gmail” envia pela conta Google do sistema, com o PDF do contrato em anexo.':'No modo navegador o e-mail abre no seu aplicativo; anexe o PDF (botão Compartilhar PDF faz isso direto no celular).'}</div>
    <div class="row" style="justify-content:flex-end;margin-top:12px;flex-wrap:wrap"><button class="btn" onclick="closeModal()">Fechar</button><button class="btn" onclick="ctCompartilhar('${c.id}')">📲 Compartilhar PDF</button><button class="btn" onclick="ctMailto('${c.id}')">Abrir no app de e-mail</button>${GAS?`<button class="btn ok" onclick="ctEmailGas('${c.id}')">✉ Enviar pelo Gmail</button>`:''}</div>`);
}
function ctMailto(id){const g=k=>document.getElementById(k).value;location.href=`mailto:${encodeURIComponent(g('em_para'))}?subject=${encodeURIComponent(g('em_ass'))}&body=${encodeURIComponent(g('em_corpo'))}`;ctLogEnvio(id,'e-mail (app)')}
async function ctEmailGas(id){
  const c=ctDe(id);const g=k=>document.getElementById(k).value;if(!g('em_para'))return toast('Informe o e-mail');
  if(!c.snap)return toast('Gere o contrato (Enviar para assinatura) antes do e-mail');
  try{toast('Enviando e-mail…');await gas('enviarContratoEmail',{id:c.id,para:g('em_para'),assunto:g('em_ass'),corpo:g('em_corpo')});closeModal();ctLogEnvio(id,'e-mail (Gmail) para '+g('em_para'));toast('E-mail enviado com o PDF')}
  catch(e){toast('Falha no envio: '+(e&&e.message||e))}
}
function ctContraAssinar(id){
  const c=ctDe(id);openModal(`<h2>Contra-assinatura da empresa</h2><div class="small muted">Contrato ${esc(c.codigo)} — assinado pelo cliente em ${esc(c.assin.cliente.quando)}.</div>
  <label class="f" style="margin-top:10px">Nome de quem assina pela ${esc(ctCfg().razao)}<input id="ce_nome" value="${esc(meuPerfil().nome||'')}"></label>
  <h3 style="margin-top:12px">Assinatura</h3><canvas class="sig" id="sig"></canvas><button class="btn sm" style="margin-top:6px" onclick="clearSig()">Limpar</button>
  <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" onclick="closeModal()">Cancelar</button><button class="btn ok" onclick="ctConfirmaEmpresa('${id}')">✓ Assinar</button></div>`);initSig();
}
async function ctConfirmaEmpresa(id){
  const c=ctDe(id);const nome=document.getElementById('ce_nome').value.trim();if(nome.length<3)return toast('Informe o nome');if(!sigDirty)return toast('Desenhe a assinatura');
  c.assin.empresa={nome,quando:new Date().toLocaleString('pt-BR'),data:todayISO(),img:document.getElementById('sig').toDataURL('image/png')};
  c.status='concluido';logCt(c,'Contra-assinado pela empresa: '+nome);ctPosAssinatura(c);
  if(GAS){try{await gas('contraAssinarContrato',{id:c.id,empresa:c.assin.empresa,html:ctDocHtml(c.snap,c.assin)})}catch(e){toast('Assinado aqui; falha ao atualizar o Drive: '+(e&&e.message||e))}}
  save();closeModal();viewContrato(id);toast('Contrato concluído ✓');
}
/* Ao concluir: lança os títulos a receber das parcelas (se a proposta ainda não lançou) */
function ctPosAssinatura(c){
  if(c.titulosCriados)return;const p=c.propostaId&&S.propostas.find(x=>x.id===c.propostaId);
  if(p&&p.status==='aceita'){c.titulosCriados=true;return}
  (c.parcelas||[]).forEach(x=>S.titulos.push({id:uid(),tipo:'receber',desc:`${x.desc} — ${c.parte.nome} (${c.codigo})`,pessoa:c.parte.nome,valor:num(x.valor),venc:x.data||todayISO(),pago:false,contratoVendaId:c.id}));
  c.titulosCriados=true;logCt(c,`${(c.parcelas||[]).length} título(s) a receber lançados no Financeiro`);
}
function ctRevogar(id){const c=ctDe(id);if(!confirm('Revogar o link atual? O cliente precisará de um novo link.'))return;c.token=token();logCt(c,'Link anterior revogado');if(c.snap)gas('publicarContrato',{id:c.id,token:c.token,snap:c.snap,html:ctDocHtml(c.snap,{}),nome:c.parte.nome,email:c.parte.email,status:c.status}).catch(()=>{});save();viewContrato(id);toast('Novo link gerado')}
function ctDuplicar(id){const o=ctDe(id);const c=JSON.parse(JSON.stringify(o));Object.assign(c,{id:uid(),num:null,codigo:'',status:'rascunho',token:'',snap:null,assin:{},log:[],enviadoEm:'',visualizadoEm:'',titulosCriados:false,criadoEm:todayISO(),data:todayISO()});logCt(c,'Duplicado de '+o.codigo);ctNumerar(c);ctLista().push(c);save();ctPasso=0;go('ct-'+c.id)}
function ctNovoAditivo(id){const o=ctDe(id);const t=ctTemplateDe('ct_aditivo');const c=ctNovoBase(t);c.parte=JSON.parse(JSON.stringify(o.parte));c.obra=JSON.parse(JSON.stringify(o.obra));c.contratoOriginal=o.codigo;c.clienteId=o.clienteId;logCt(c,'Aditivo ao contrato '+o.codigo);ctNumerar(c);ctLista().push(c);save();ctPasso=0;go('ct-'+c.id)}
function ctCancelar(id){const c=ctDe(id);if(!confirm('Cancelar o contrato '+c.codigo+'?'))return;c.status='cancelado';logCt(c,'Contrato cancelado');if(GAS&&c.token)gas('publicarContrato',{id:c.id,token:c.token,snap:c.snap,status:'cancelado'}).catch(()=>{});save();viewContrato(id)}
function ctModalVars(){
  openModal(`<h2>Campos do contrato</h2><p class="small muted">Use estes códigos nas cláusulas ou no seu arquivo Word (.docx). Todos os campos da proposta (${DOCX_VARS_LIST.reduce((a,[,v])=>a+v.length,0)}) também funcionam. Toque para copiar.</p>
  ${CT_VARS_LIST.map(([g,vs])=>`<div style="margin-top:10px"><b class="small">${esc(g)}</b><div class="ct-vars" style="margin-top:5px">${vs.map(v=>`<button onclick="navigator.clipboard&&navigator.clipboard.writeText('${v}');toast('Copiado: ${v}')">${v}</button>`).join('')}</div></div>`).join('')}
  <details style="margin-top:12px"><summary class="small" style="cursor:pointer;font-weight:700">Campos da proposta</summary>${DOCX_VARS_LIST.map(([g,vs])=>`<div style="margin-top:8px"><b class="small">${esc(g)}</b><div class="ct-vars" style="margin-top:5px">${vs.map(v=>`<button onclick="navigator.clipboard&&navigator.clipboard.writeText('${v}');toast('Copiado: ${v}')">${v}</button>`).join('')}</div></div>`).join('')}</details>
  <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn pri" onclick="closeModal()">Fechar</button></div>`);
}
/* ---- Prévia do documento (o mesmo que vai para PDF/impressão) ---- */
async function viewCtPrevia(id){
  const c=ctDe(id);if(!c){go('contratos');return}
  const snap=(c.status!=='rascunho'&&c.snap)?c.snap:null;
  setHead(`Prévia · ${c.codigo||''}`,snap?'Documento como enviado ao cliente':'Rascunho — campos em amarelo estão vazios',
    `<button class="btn" onclick="go('ct-${c.id}')">← Editar</button><button class="btn" onclick="ctBaixarDocx('${c.id}')">📄 .docx</button><button class="btn" onclick="ctBaixarPdf('${c.id}')">⬇ PDF</button><button class="btn" onclick="window.print()">🖨️ Imprimir</button><button class="btn sun" onclick="ctModalWhats('${c.id}')">💬 Enviar</button>`);
  V(snap?ctDocHtml(snap,c.assin):ctPrevHtml(c));
}
