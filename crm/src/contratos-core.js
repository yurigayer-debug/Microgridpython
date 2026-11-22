/* ===================== Contratos · dados, variáveis e texto ===================== */
const CT_ORD=['PRIMEIRA','SEGUNDA','TERCEIRA','QUARTA','QUINTA','SEXTA','SÉTIMA','OITAVA','NONA','DÉCIMA','DÉCIMA PRIMEIRA','DÉCIMA SEGUNDA','DÉCIMA TERCEIRA','DÉCIMA QUARTA','DÉCIMA QUINTA','DÉCIMA SEXTA','DÉCIMA SÉTIMA','DÉCIMA OITAVA','DÉCIMA NONA','VIGÉSIMA'];
const CT_MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
/* ---- número por extenso (pt-BR) ---- */
function _ext3(n){
  const U=['zero','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
  const D=['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
  const C=['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
  if(n===100)return 'cem';const c=Math.floor(n/100),r=n%100,p=[];
  if(c)p.push(C[c]);if(r)p.push(r<20?U[r]:D[Math.floor(r/10)]+(r%10?' e '+U[r%10]:''));
  return p.join(' e ')||'zero';
}
function extensoInt(n){
  n=Math.floor(Math.abs(num(n)));if(!n)return 'zero';
  const b=Math.floor(n/1e9),m=Math.floor(n/1e6)%1000,k=Math.floor(n/1000)%1000,u=n%1000,p=[];
  if(b)p.push(b===1?'um bilhão':_ext3(b)+' bilhões');
  if(m)p.push(m===1?'um milhão':_ext3(m)+' milhões');
  if(k)p.push(k===1?'mil':_ext3(k)+' mil');
  if(u)p.push(_ext3(u));
  if(p.length<2)return p[0];
  const ult=p.pop();return p.join(', ')+((u&&(u<=100||u%100===0))?' e ':' ')+ult;
}
function extensoReais(v){
  v=Math.round(Math.abs(num(v))*100)/100;const r=Math.floor(v),c=Math.round((v-r)*100);
  let s='';
  if(r)s=extensoInt(r)+(r===1?' real':(r%1e6===0?' de reais':' reais'));
  if(c)s+=(s?' e ':'')+extensoInt(c)+(c===1?' centavo':' centavos');
  return (s||'zero real').toUpperCase();
}
function dataExtenso(iso){if(!iso)return '';const [y,m,d]=iso.split('-');return `${d} de ${CT_MESES[+m-1]} de ${y}`}
const nExt=n=>`${n0(n)} (${extensoInt(n)})`;
const pctExt=n=>`${n0(n)}% (${extensoInt(n)} por cento)`;
const soDig=s=>String(s||'').replace(/\D/g,'');
function fmtDoc(s){const d=soDig(s);if(d.length===11)return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');if(d.length===14)return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5');return s||''}
function fmtCep(s){const d=soDig(s);return d.length===8?d.slice(0,5)+'-'+d.slice(5):(s||'')}
function ctGet(o,p){return String(p).split('.').reduce((a,k)=>a==null?a:a[k],o)}
function ctSet(o,p,v){const ks=String(p).split('.');let a=o;for(let i=0;i<ks.length-1;i++){const k=ks[i];if(a[k]==null)a[k]=/^\d+$/.test(ks[i+1])?[]:{};a=a[k]}a[ks[ks.length-1]]=v}
/* ---- configuração e templates ---- */
function ctCfg(){if(!S.cfg.ct)S.cfg.ct=ctCfgPadrao();return Object.assign(ctCfgPadrao(),S.cfg.ct)}
function ctTemplates(){if(!S.cfg.ctTemplates||!S.cfg.ctTemplates.length)S.cfg.ctTemplates=defaultCtTemplates();return S.cfg.ctTemplates}
function ctTemplateDe(id){const l=ctTemplates();return l.find(t=>t.id===id)||l[0]}
function ctLista(){return (S.contratosVenda=S.contratosVenda||[])}
function ctDe(id){return ctLista().find(x=>x.id===id)}
function logCt(c,o){(c.log=c.log||[]).push({quando:new Date().toLocaleString('pt-BR'),o})}
function ctCodigo(n){return `CT-${new Date().getFullYear()}-${String(n||0).padStart(3,'0')}`}
function ctNovoBase(tpl){
  const k=ctCfg();
  return {id:uid(),num:null,codigo:'',templateId:tpl.id,tipo:tpl.tipo,status:'rascunho',criadoEm:todayISO(),propostaId:'',clienteId:'',
    parte:{tipo:'PF',nome:'',doc:'',rg:'',representante:'',fone:'',email:'',cep:'',logradouro:'',numero:'',complemento:'',bairro:'',cidade:'',uf:'RS'},
    obra:{mesmo:true,cep:'',logradouro:'',numero:'',complemento:'',bairro:'',cidade:'',uf:'RS',concessionaria:k.concessionaria,uc:''},
    kit:{modQtd:'',modMarca:'TIER 1',modWp:'',invQtd:1,invDesc:'',invKw:'',batDesc:'',telhado:'Telhado Fibrocimento',estruturaMaterial:'Material em Alumínio e Aço-Inox',extras:''},
    incluso:k.incluso,elEscopo:'',elNormas:'ABNT NBR 5410 · NR-10 · Padrão Técnico CEEE Equatorial',elPrazo:5,elGarantia:'12 meses de garantia sobre os serviços executados',elArt:true,
    contratoOriginal:'',aditivoDesc:'',
    itens:[],parcelas:[],formaPagto:'Pagamento via PIX ou transferência bancária para a conta da CONTRATADA indicada abaixo.',
    prazoDias:k.prazoDias,garantiaAnos:k.garantiaAnos,cidade:k.cidade,data:todayISO(),
    titulo:tpl.titulo,preambulo:tpl.preambulo,fecho:tpl.fecho||CT_FECHO_PADRAO,clausulas:JSON.parse(JSON.stringify(tpl.clausulas||[])),
    testemunhas:[{nome:'',doc:''},{nome:'',doc:''}],docs:{},token:'',snap:null,assin:{},log:[]};
}
function ctNumerar(c){if(c.num==null&&!GAS){S.seq.ct=(S.seq.ct||0)+1;c.num=S.seq.ct}if(!c.codigo)c.codigo=c.num!=null?ctCodigo(c.num):'CT-'+c.id.slice(0,6).toUpperCase()}
function ctItensPadrao(total,kwp,ehEl){
  const k=ehEl?[['Serviços de engenharia elétrica (mão de obra especializada)',.55],['Materiais elétricos (cabos, disjuntores, DPS, eletrodutos)',.35],['Projeto, ART/TRT e testes finais',.10]]
    :[['Kit Gerador Fotovoltaico (módulos, inversor e estrutura de fixação)',.70],['Projeto Elétrico e Instalação, Regularização na Concessionária (Engenharia)',.185],['Mão de Obra Execução / Instalação',.065],['Cabos Elétricos, Quadro de Proteção, Dispositivos de Proteção, Conectores, Eletrodutos, Acessórios e etc.',.05],['Frete',0]];
  let soma=0;const it=k.map(([d,f],i)=>{const v=i===k.length-1&&!ehEl?0:Math.round(total*f*100)/100;soma+=v;return {desc:d,kwp:i===0&&kwp?n2(kwp):'',fornecedor:S.cfg.empresa||'Delta Solar',valor:v}});
  const dif=Math.round((total-soma)*100)/100;if(it.length&&dif)it[0].valor=Math.round((it[0].valor+dif)*100)/100;
  return it;
}
/* Cria um contrato a partir de uma proposta (de preferência aceita): cliente, kit, preço e parcelas */
function ctDeProposta(pid,tplId){
  const p=S.propostas.find(x=>x.id===pid);if(!p)throw new Error('Proposta não encontrada');
  const s=p.snap||snapshotProp(p);const ops=opsDe(s);const opId=(p.aceite&&p.aceite.opcao)||'A';const o=ops.find(x=>x.id===opId)||ops[0];
  const ehEl=(s.tipoProposta||p.tipoProposta)==='eletrica';
  const tpl=ctTemplateDe(tplId||(ehEl?'ct_eletrica':'ct_solar'));
  const c=ctNovoBase(tpl);const cli=S.clientes.find(x=>x.id===p.clienteId)||{};
  c.propostaId=p.id;c.clienteId=p.clienteId||'';
  Object.assign(c.parte,{nome:p.nome||cli.nome||'',doc:p.doc||cli.doc||'',fone:p.fone||cli.fone||'',email:p.email||cli.email||'',cidade:p.cidade||cli.cidade||'',uf:p.uf||cli.uf||'RS',tipo:soDig(p.doc||cli.doc).length===14?'PJ':'PF'});
  if(!ehEl){
    const kitObj=S.kits.find(k=>k.id===(pEfetiva(p,o.id).kitId));
    const invTxt=o.inversor||(kitObj&&kitObj.inversor)||'';
    const mInv=/^(\d+)\s*[×x]\s*(.*)$/.exec(invTxt);
    Object.assign(c.kit,{modQtd:o.nMod||'',modWp:o.modWp||'',invQtd:mInv?+mInv[1]:1,invDesc:mInv?mInv[2]:invTxt,invKw:kitObj?kitObj.invKw:'',batDesc:o.bat?(kitObj&&kitObj.bateria)||`Banco de baterias de ${n2(o.bat,1)} kWh`:''});
  }else{
    Object.assign(c,{elEscopo:s.elEscopo||'',elNormas:s.elNormas||c.elNormas,elPrazo:s.elPrazo||5,elGarantia:s.elGarantia||c.elGarantia,elArt:s.elArt!==false});
  }
  const tits=p.aceite?titulosDoAceite(s,o,p.aceite.forma):((o.pagto&&o.pagto.obra)||[]).map(x=>({desc:`${x.nome} (${n0(x.pct)}%)`,valor:x.valor,dias:x.dias}));
  // Valor do contrato = valor acordado no aceite (ex.: PIX com desconto); sem aceite, o preço da opção
  const somaTits=Math.round(tits.reduce((a,t)=>a+num(t.valor),0)*100)/100;
  const total=p.aceite&&somaTits>0?somaTits:(o.final||s.final||0);
  c.itens=ctItensPadrao(total,ehEl?0:o.kwp,ehEl);
  const base=(p.aceite&&p.aceite.data)||todayISO();
  c.parcelas=(tits.length?tits:[{desc:'Parcela única',valor:total,dias:3}]).map(t=>({data:addDays(base,t.dias||0),desc:t.desc,valor:Math.round(num(t.valor)*100)/100}));
  if(p.aceite)c.formaPagto=`Forma escolhida pelo CONTRATANTE no aceite da proposta: ${formaNome(o,p.aceite.forma)}.`;
  logCt(c,`Criado a partir da proposta ${numP(p)}${p.aceite?' (aceita)':''} · ${tpl.nome}`);
  return c;
}
function ctTotal(c){return Math.round((c.itens||[]).reduce((a,i)=>a+num(i.valor),0)*100)/100}
function ctKwp(c){return num(c.kit.modQtd)*num(c.kit.modWp)/1000}
function fmtEnd(e){
  const l1=[e.logradouro,e.numero].filter(Boolean).join(', ')+(e.complemento?' – '+e.complemento:'');
  return [l1,e.bairro,[e.cidade,e.uf].filter(Boolean).join(' / ')].filter(Boolean).join(' – ')+(soDig(e.cep)?`, CEP ${fmtCep(e.cep)}`:'');
}
function ctListaKit(c){
  const k=c.kit,kwp=ctKwp(c),out=[];
  if(num(k.modQtd))out.push(`• ${n0(k.modQtd)} x módulos fotovoltaicos ${k.modMarca||''}, POTÊNCIA ${n0(k.modWp)}Wp – Total de ${n2(kwp)} kWp;`.replace(/\s+,/,','));
  if(k.invDesc)out.push(`• ${n0(k.invQtd||1)} x ${k.invDesc}${num(k.invKw)?` – Total de ${n2(num(k.invKw)*(num(k.invQtd)||1))} kW`:''};`);
  if(k.batDesc)out.push(`• ${k.batDesc};`);
  if(num(k.modQtd))out.push(`• Estruturas de Fixação para ${n0(k.modQtd)} Módulos Fotovoltaicos em ${k.telhado||'telhado'} – ${k.estruturaMaterial||''};`);
  String(k.extras||'').split('\n').map(s=>s.trim()).filter(Boolean).forEach(s=>out.push('• '+s.replace(/^•\s*/,'')));
  return out.join('\n');
}
/* Todas as variáveis de um contrato: as da proposta vinculada (mesmos códigos do template de proposta) + as do contrato */
function ctVars(c){
  const cfg=S.cfg,k=ctCfg(),pa=cfg.pagina||{};let v={};
  const p=c.propostaId&&S.propostas.find(x=>x.id===c.propostaId);
  if(p){try{const s=p.snap||snapshotProp(p);v=docxVarsDe(s,(p.aceite&&p.aceite.opcao)||'A')}catch(e){}}
  const pt=c.parte||{},ob=c.obra||{},kit=c.kit||{},ehPJ=pt.tipo==='PJ',ehEl=c.tipo==='eletrica';
  const total=ctTotal(c),kwp=ctKwp(c),obraEnd=ob.mesmo!==false?pt:ob;
  const itens=(c.itens||[]).map((it,i)=>({item_n:String(i+1),item_desc:it.desc||'',item_kwp:it.kwp?String(it.kwp):'',item_fornecedor:it.fornecedor||'',item_valor:num(it.valor)?brl(num(it.valor)):'—'}));
  const parcs=(c.parcelas||[]).map((x,i)=>({parcela_n:String(i+1),parcela_data:fdata(x.data),parcela_desc:x.desc||'',parcela_valor:brl(num(x.valor))}));
  const letras='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const assC=c.assin&&c.assin.cliente,assE=c.assin&&c.assin.empresa;
  const doc=fmtDoc(pt.doc);
  return Object.assign(v,{
    empresa:cfg.empresa||'Delta Solar Ltda',empresa_razao:k.razao,empresa_cnpj:k.cnpj,empresa_crea:k.crea,empresa_email:k.email,empresa_endereco:k.endereco||cfg.endereco||'',
    endereco:cfg.endereco||'',site:cfg.site||'',whats:cfg.whats||'',rt_titulo:k.rtTitulo||'',rt_nome:k.rtNome||pa.rtNome||'',rt_crea:k.rtCrea||pa.rtCrea||'',
    contrato_numero:c.codigo||'(a numerar)',contrato_data:fdata(c.data),contrato_data_extenso:dataExtenso(c.data),contrato_cidade:c.cidade||k.cidade,
    contrato_original:c.contratoOriginal||'',aditivo_descricao:c.aditivoDesc||'',
    cliente_nome:pt.nome||'',cliente_doc:doc,cliente_tipo_doc:ehPJ?'CNPJ':'CPF',
    cliente_qualificacao:doc?(ehPJ?`pessoa jurídica inscrita no CNPJ nº ${doc}${pt.representante?`, neste ato representada por ${pt.representante}`:''}`:`pessoa física inscrita no CPF nº ${doc}${pt.rg?`, RG nº ${pt.rg}`:''}`):'',
    cliente_residencia:ehPJ?'com sede':'residente',cliente_rg:pt.rg||'',cliente_representante:pt.representante||'',cliente_fone:pt.fone||'',cliente_email:pt.email||'',
    cliente_cep:fmtCep(pt.cep),cliente_endereco:pt.logradouro||'',cliente_numero:pt.numero||'',cliente_complemento:pt.complemento||'',cliente_bairro:pt.bairro||'',
    cliente_cidade:pt.cidade||'',cliente_uf:pt.uf||'',cliente_endereco_completo:pt.logradouro?fmtEnd(pt):'',
    obra_endereco_completo:obraEnd.logradouro?(fmtEnd(obraEnd)+' – BRASIL'):'',obra_cep:fmtCep(obraEnd.cep),obra_cidade:obraEnd.cidade||'',obra_uf:obraEnd.uf||'',
    concessionaria:ob.concessionaria||k.concessionaria,uc:ob.uc||'',
    itens_inclusos:c.incluso||k.incluso,
    valor_final:brl(total),valor_extenso:extensoReais(total),
    tabela_itens:itens.map(i=>`${i.item_n}. ${i.item_desc}${i.item_kwp?' — '+i.item_kwp+' kWp':''} — ${i.item_fornecedor} — ${i.item_valor}`).join('\n'),
    discriminacao_itens:(c.itens||[]).map((it,i)=>`${letras[i]||i+1}) Item ${i+1}. Refere-se a ${String(it.desc||'').replace(/^./,m=>m.toLowerCase())}.`).join('\n'),
    tabela_parcelas:parcs.map(x=>`${x.parcela_data} — ${x.parcela_desc} — ${x.parcela_valor}`).join('\n'),
    parcelas_lista:parcs.map(x=>`• ${x.parcela_desc}: ${x.parcela_valor} em ${x.parcela_data}`).join('\n'),
    forma_pagamento:c.formaPagto||'',dados_bancarios:k.bancos||'',pix_chave:k.pixChave||'',
    prazo_dias:String(num(c.prazoDias)||k.prazoDias),prazo_extenso:extensoInt(num(c.prazoDias)||k.prazoDias),
    garantia_servico_anos:`${nExt(num(c.garantiaAnos)||k.garantiaAnos)} ${(num(c.garantiaAnos)||k.garantiaAnos)==1?'ano':'anos'}`,
    suspensao_dias:nExt(k.suspensaoDias),multa_rescisao_pct:pctExt(k.multaPct),honorarios_judicial_pct:pctExt(k.honorJud),honorarios_extra_pct:pctExt(k.honorExt),foro:k.foro,
    el_escopo:c.elEscopo||'',el_normas:c.elNormas||'',el_prazo:`${num(c.elPrazo)||5} (${extensoInt(num(c.elPrazo)||5)}) dias úteis`,el_garantia:c.elGarantia||'',el_art:c.elArt!==false?'com emissão de ART/TRT':'sem emissão de ART/TRT',
    testemunha1_nome:(c.testemunhas[0]||{}).nome||'',testemunha1_doc:(c.testemunhas[0]||{}).doc||'',testemunha2_nome:(c.testemunhas[1]||{}).nome||'',testemunha2_doc:(c.testemunhas[1]||{}).doc||'',
    assinatura_cliente:assC?`Assinado eletronicamente por ${assC.nome} em ${assC.quando}`:'______________________________',
    assinatura_empresa:assE?`Assinado eletronicamente por ${assE.nome} em ${assE.quando}`:'______________________________',
    assinatura_data:assC?assC.quando:'',assinatura_hash:(c.snap&&c.snap.hash)||''
  },ehEl?{}:{kwp:n2(kwp)+' kWp',n_modulos:String(num(kit.modQtd)||''),mod_wp:n0(kit.modWp)+' Wp',inversor:kit.invDesc||'',
    kit_mod_qtd:String(num(kit.modQtd)||''),kit_mod_marca:kit.modMarca||'',kit_mod_wp:n0(kit.modWp)+' Wp',kit_inv_qtd:String(num(kit.invQtd)||1),kit_inv_desc:kit.invDesc||'',
    kit_inv_kw:n2(num(kit.invKw)*(num(kit.invQtd)||1))+' kW',kit_bat_desc:kit.batDesc||'',kit_telhado:kit.telhado||'',kit_estrutura_material:kit.estruturaMaterial||'',lista_kit:ctListaKit(c)},
  {__rows:{item:itens,parcela:parcs}});
}
/* Substitui as variáveis. modo: 'marca' (editor: ⟦falta⟧), 'final' (documento), 'modelo' (mantém {{...}}) */
function ctSub(txt,vars,modo){
  return String(txt||'').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,(_,k)=>{
    if(CT_TABELAS.includes(k))return '\uE000T:'+k+'\uE000';
    if(modo==='modelo')return '{{'+k+'}}';
    const val=vars[k];
    if(val==null||String(val).trim()===''||(typeof val!=='string'&&typeof val!=='number'))return modo==='marca'?'⟦'+k+'⟧':'________';
    return String(val);
  });
}
/* Estrutura pronta do contrato (texto já preenchido) — base da prévia, da página do cliente, do PDF e do .docx */
function ctRender(c,modo='final'){
  const vars=ctVars(c);
  const sub=t=>ctSub(t,vars,modo);
  const lin=t=>sub(t).split('\n').map(s=>s.replace(/\s+$/,'')).filter((s,i,a)=>s!==''||false);
  return {titulo:sub(c.titulo),preambulo:lin(c.preambulo),fecho:lin(c.fecho||CT_FECHO_PADRAO),
    clausulas:(c.clausulas||[]).map((cl,i)=>({n:i+1,ord:CT_ORD[i]||String(i+1),titulo:sub(cl.titulo).toUpperCase(),linhas:lin(cl.texto)})),
    itens:(c.itens||[]).map(it=>({desc:it.desc,kwp:it.kwp,fornecedor:it.fornecedor,valor:num(it.valor)})),total:ctTotal(c),
    parcelas:(c.parcelas||[]).map(x=>({data:x.data,desc:x.desc,valor:num(x.valor)})),
    testemunhas:(c.testemunhas||[]).map(t=>({nome:t.nome||'',doc:t.doc||''})),
    partes:{cliente:vars.cliente_nome,clienteDoc:vars.cliente_doc,tipoDoc:vars.cliente_tipo_doc,empresa:vars.empresa_razao}};
}
function ctFaltando(c){const r=ctRender(c,'marca');const txt=JSON.stringify(r);const f=new Set();txt.replace(/⟦([a-z0-9_]+)⟧/g,(_,k)=>f.add(k));return [...f]}
function ctTextoPlano(r){
  const tab=l=>l.replace(/\uE000T:(\w+)\uE000/g,(_,k)=>k==='tabela_itens'?r.itens.map((i,j)=>`${j+1}. ${i.desc} ${i.kwp||''} ${i.fornecedor||''} ${brl(i.valor)}`).join('\n')+`\nTotal ${brl(r.total)}`:r.parcelas.map(p=>`${fdata(p.data)} ${p.desc} ${brl(p.valor)}`).join('\n'));
  return [r.titulo,...r.preambulo.map(tab),...r.clausulas.flatMap(cl=>[`CLÁUSULA ${cl.ord} – ${cl.titulo}`,...cl.linhas.map(tab)]),...r.fecho.map(tab)].join('\n').replace(/\*\*/g,'');
}
async function ctHash(txt){
  try{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(txt));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
  catch(e){let h=0x811c9dc5;for(let i=0;i<txt.length;i++){h^=txt.charCodeAt(i);h=Math.imul(h,16777619)}return 'fnv1a-'+(h>>>0).toString(16)}
}
/* Foto congelada no envio: é o que o cliente lê e assina */
async function ctSnapshot(c){
  const r=ctRender(c,'final'),k=ctCfg(),cfg=S.cfg,vars=ctVars(c);
  const texto=ctTextoPlano(r);
  const objeto=c.tipo==='eletrica'?(c.elEscopo||'Serviços de engenharia elétrica'):c.tipo==='aditivo'?(c.aditivoDesc||'Termo aditivo'):`Sistema fotovoltaico de ${vars.kwp||'—'}${num(c.kit.modQtd)?` (${n0(c.kit.modQtd)} módulos)`:''}`;
  return {codigo:c.codigo,tipo:c.tipo,render:r,texto,hash:await ctHash(texto),emitidoEm:new Date().toLocaleString('pt-BR'),
    resumo:{cliente:c.parte.nome,doc:fmtDoc(c.parte.doc),objeto,valor:r.total,extenso:vars.valor_extenso,
      prazo:c.tipo==='eletrica'?vars.el_prazo:c.tipo==='aditivo'?'':`${vars.prazo_dias} dias após aprovação na concessionária`,
      garantia:c.tipo==='eletrica'?vars.el_garantia:c.tipo==='aditivo'?'':vars.garantia_servico_anos,local:vars.obra_endereco_completo,
      equipamentos:c.tipo==='solar'?ctListaKit(c).split('\n').map(s=>s.replace(/^•\s*/,'').replace(/;$/,'')):[],parcelas:r.parcelas},
    empresa:{nome:cfg.empresa,razao:k.razao,cnpj:k.cnpj,crea:k.crea,email:k.email,site:cfg.site||'',endereco:k.endereco,whats:cfg.whats||'',whats2:cfg.whats2||'',whats3:cfg.whats3||''}};
}
function linkContrato(c){if(GAS&&S.cfg.urlPublica&&c.token)return S.cfg.urlPublica.split('?')[0]+'?c='+encodeURIComponent(c.id)+'&t='+encodeURIComponent(c.token);return ''}
