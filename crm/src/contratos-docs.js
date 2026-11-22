/* ===================== Contratos · documento (HTML, PDF e .docx) ===================== */
function ctInline(s){
  return esc(s).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/⟦([a-z0-9_]+)⟧/g,'<mark class="ct-falta" title="Campo vazio">$1</mark>').replace(/\*\*/g,'');
}
function ctTabItensHtml(r){
  return `<table><thead><tr><th style="width:44px">Item</th><th>Descrição</th><th style="width:60px">kWp</th><th style="width:110px">Fornecedor</th><th class="r" style="width:120px">Valor R$</th></tr></thead><tbody>${r.itens.map((i,j)=>`<tr><td style="text-align:center">${j+1}</td><td>${esc(i.desc)}</td><td style="text-align:center">${esc(i.kwp||'')}</td><td style="text-align:center">${esc(i.fornecedor||'')}</td><td class="r">${i.valor?brl(i.valor):''}</td></tr>`).join('')}<tr><td colspan="4" class="r"><b>Total</b></td><td class="r"><b>${brl(r.total)}</b></td></tr></tbody></table>`;
}
function ctTabParcHtml(r){
  return `<table><thead><tr><th style="width:120px">Data</th><th>Descrição</th><th class="r" style="width:140px">Valor R$</th></tr></thead><tbody>${r.parcelas.map(p=>`<tr><td style="text-align:center">${fdata(p.data)}</td><td>${esc(p.desc)}</td><td class="r">${brl(p.valor)}</td></tr>`).join('')}</tbody></table>`;
}
function ctLinhaHtml(l,r){
  const m=/^\u0000T:(\w+)\u0000$/.exec(l.trim());
  if(m)return m[1]==='tabela_itens'?ctTabItensHtml(r):ctTabParcHtml(r);
  if(l.indexOf('\u0000T:')>=0)return l.split(/(\u0000T:\w+\u0000)/).map(x=>/^\u0000T:/.test(x)?ctLinhaHtml(x,r):(x.trim()?`<p>${ctInline(x)}</p>`:'')).join('');
  if(/^\s*•\s/.test(l))return `<p class="ct-bul">${ctInline(l.trim())}</p>`;
  return `<p>${ctInline(l)}</p>`;
}
function ctCertHtml(snap,assin){
  const a=(assin||{}).cliente,e=(assin||{}).empresa;if(!a)return '';
  return `<div class="ct-cert"><b>Certificado de assinatura eletrônica</b><br>
    Documento: ${esc(snap.codigo)} · emitido em ${esc(snap.emitidoEm||'')}<br>
    Assinado pelo CONTRATANTE: <b>${esc(a.nome)}</b> · ${esc(a.tipoDoc||'CPF')} ${esc(a.doc||'')} · ${esc(a.quando)}${a.email?' · '+esc(a.email):''}<br>
    Aparelho: ${esc(a.agente||'—')}${a.ip?' · IP '+esc(a.ip):''}<br>
    ${e?`Assinado pela CONTRATADA: <b>${esc(e.nome)}</b> · ${esc(e.quando)}<br>`:''}
    Código de integridade (SHA-256 do texto assinado): <code>${esc(snap.hash||'')}</code><br>
    Assinatura eletrônica nos termos da Lei nº 14.063/2020 e do art. 10, § 2º, da MP nº 2.200-2/2001.</div>`;
}
/* Documento completo, com aparência de papel (prévia, impressão e PDF) */
function ctDocHtml(snap,assin,opts={}){
  const r=snap.render,em=snap.empresa||{};assin=assin||{};
  const sig=(lbl,nome,doc,a)=>`<div class="ct-sig"><div class="ln">${a&&a.img?`<img src="${a.img}" alt="Assinatura">`:''}</div><b>${lbl}: ${esc(nome||'')}</b>${doc?`<small>${esc(doc)}</small>`:''}${a?`<small>Assinado eletronicamente em ${esc(a.quando)}</small>`:''}</div>`;
  return `<div class="ct-doc" id="${opts.id||''}">
    ${opts.semCabecalho?'':`<div class="ct-dh"><img src="${DELTA_LOGO_DATA}" alt="${esc(em.nome||'Delta Solar')}"><span>CNPJ: ${esc(em.cnpj||'')}</span></div>`}
    <h1>${ctInline(r.titulo)}${snap.codigo?`<br><span style="font-size:12px;font-weight:400">Nº ${esc(snap.codigo)}</span>`:''}</h1>
    ${r.preambulo.map(l=>ctLinhaHtml(l,r)).join('')}
    ${r.clausulas.map(cl=>`<div class="ct-cl" id="${opts.id?opts.id+'-':''}cl${cl.n}">${cl.linhas.map((l,i)=>i===0?ctLinhaHtml(`**CLÁUSULA ${cl.ord} – ${cl.titulo}:** ${l}`,r):ctLinhaHtml(l,r)).join('')||`<p><b>CLÁUSULA ${cl.ord} – ${esc(cl.titulo)}</b></p>`}</div>`).join('')}
    <div style="margin-top:14px">${r.fecho.map(l=>ctLinhaHtml(l,r)).join('')}</div>
    <div class="ct-sigs">${sig('CONTRATANTE',r.partes.cliente,r.partes.clienteDoc?`${r.partes.tipoDoc} ${r.partes.clienteDoc}`:'',assin.cliente)}${sig('CONTRATADA',r.partes.empresa,em.cnpj?'CNPJ '+em.cnpj:'',assin.empresa)}</div>
    <div style="margin-top:18px"><b style="font-size:12.5px">TESTEMUNHAS:</b><div class="ct-test" style="margin-top:22px">${(r.testemunhas.length?r.testemunhas:[{},{}]).slice(0,2).map(t=>`<div>Nome: ${t.nome?esc(t.nome):'_______________________'}<br>RG/CPF: ${t.doc?esc(t.doc):'_____________________'}<div style="border-bottom:1px solid #111;height:30px"></div></div>`).join('')}</div></div>
    ${ctCertHtml(snap,assin)}
    ${opts.semCabecalho?'':`<div class="ct-df">${esc(em.nome||'')} – CNPJ ${esc(em.cnpj||'')}${em.crea?' – '+esc(em.crea):''}<br>${[em.whats,em.whats2].filter(Boolean).map(esc).join(' / ')}<br>${esc(em.site||'')}${em.email?' / '+esc(em.email):''}</div>`}
  </div>`;
}
/* ---- PDF (html2pdf.js carregado só quando precisa) ---- */
function ctCarregarScript(src){return new Promise((res,rej)=>{if(document.querySelector(`script[src="${src}"]`)&&window.html2pdf)return res();const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=()=>rej(new Error('Não foi possível carregar o gerador de PDF (sem internet?).'));document.head.appendChild(s)})}
async function ctPdfBlob(snap,assin){
  await ctCarregarScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
  const host=document.createElement('div');host.style.cssText='position:fixed;left:-10000px;top:0;width:794px;background:#fff';
  host.innerHTML=ctDocHtml(snap,assin,{semCabecalho:true});const el=host.firstElementChild;el.style.cssText='border:0;box-shadow:none;max-width:none;padding:0;font-size:13.5px';
  document.body.appendChild(host);
  try{
    const em=snap.empresa||{};
    const w=window.html2pdf().set({margin:[24,16,20,16],image:{type:'jpeg',quality:.95},html2canvas:{scale:2,backgroundColor:'#ffffff'},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},pagebreak:{mode:['css','legacy'],avoid:['tr','.ct-sig','.ct-cert','p']}}).from(el).toPdf();
    const pdf=await w.get('pdf');
    const n=pdf.internal.getNumberOfPages(),W=pdf.internal.pageSize.getWidth(),H=pdf.internal.pageSize.getHeight();
    for(let i=1;i<=n;i++){pdf.setPage(i);
      try{pdf.addImage(DELTA_LOGO_DATA,'JPEG',16,5,26,12)}catch(e){}
      pdf.setFontSize(9);pdf.setTextColor(40);pdf.text('CNPJ: '+(em.cnpj||''),W-16,15,{align:'right'});pdf.setDrawColor(20);pdf.setLineWidth(.5);pdf.line(16,18,W-16,18);
      pdf.line(16,H-15,W-16,H-15);pdf.setFontSize(7.5);
      pdf.text(`${em.nome||''} – CNPJ ${em.cnpj||''}${em.crea?' – '+em.crea:''}`,W/2,H-11,{align:'center'});
      pdf.text(`${[em.whats,em.whats2].filter(Boolean).join(' / ')}  ·  ${em.site||''}${em.email?' / '+em.email:''}`,W/2,H-7.5,{align:'center'});
      pdf.text(`${snap.codigo||''} · página ${i} de ${n}`,W-16,H-3.5,{align:'right'});}
    return pdf.output('blob');
  }finally{host.remove()}
}
function ctNomeArq(snap,ext){const cli=String(snap.resumo&&snap.resumo.cliente||'Cliente').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40);return `Contrato-${snap.codigo||'rascunho'}-${cli}.${ext}`}
async function ctSnapAtual(c){return (c.status!=='rascunho'&&c.snap)?c.snap:await ctSnapshot(c)}
async function ctBaixarPdf(id){
  const c=ctDe(id);if(!c)return;ctNumerar(c);
  try{toast('Gerando PDF…');const snap=await ctSnapAtual(c);const b=await ctPdfBlob(snap,c.assin);baixarBlob(b,ctNomeArq(snap,'pdf'));toast('PDF gerado')}
  catch(e){toast('PDF: '+(e&&e.message||e)+' — use Baixar .docx ou Imprimir na prévia')}
}
async function ctCompartilhar(id){
  const c=ctDe(id);if(!c)return;ctNumerar(c);
  try{
    const snap=await ctSnapAtual(c);const b=await ctPdfBlob(snap,c.assin);
    const f=new File([b],ctNomeArq(snap,'pdf'),{type:'application/pdf'});const link=linkContrato(c);
    const dados={files:[f],title:'Contrato '+snap.codigo,text:`Contrato ${snap.codigo} — ${S.cfg.empresa}${link?'\nAssine online: '+link:''}`};
    if(navigator.canShare&&navigator.canShare(dados)){await navigator.share(dados);logCt(c,'PDF compartilhado pelo celular');save()}
    else{baixarBlob(b,f.name);toast('Este navegador não compartilha arquivos: o PDF foi baixado para você anexar')}
  }catch(e){if(e&&e.name==='AbortError')return;toast('Não foi possível compartilhar: '+(e&&e.message||e))}
}
/* ---- .DOCX ---- */
function ctDocxRuns(txt,o={}){
  const rpr=b=>`<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>${b?'<w:b/>':''}${o.color?`<w:color w:val="${o.color}"/>`:''}<w:sz w:val="${o.sz||22}"/></w:rPr>`;
  return String(txt).split('**').map((seg,i)=>seg?`<w:r>${rpr(o.bold||i%2===1)}<w:t xml:space="preserve">${xesc(seg)}</w:t></w:r>`:'').join('');
}
function ctDocxP(txt,o={}){
  return `<w:p><w:pPr><w:spacing w:before="${o.before??0}" w:after="${o.after??140}" w:line="${o.line||300}" w:lineRule="auto"/>${o.ind?`<w:ind w:left="${o.ind}" w:hanging="220"/>`:''}<w:jc w:val="${o.align||'both'}"/></w:pPr>${ctDocxRuns(txt,o)}</w:p>`;
}
function ctDocxTbl(cols,rows){
  const W=cols.reduce((a,c)=>a+c.w,0);
  const cell=(t,c,o={})=>`<w:tc><w:tcPr><w:tcW w:w="${c.w}" w:type="dxa"/>${o.fill?`<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>`:''}${o.span?`<w:gridSpan w:val="${o.span}"/>`:''}<w:vAlign w:val="center"/></w:tcPr>${ctDocxP(t,{sz:18,after:40,before:40,line:240,align:o.align||c.align||'left',bold:o.bold,font:'Arial'})}</w:tc>`;
  const hdr=`<w:tr><w:trPr><w:tblHeader/></w:trPr>${cols.map(c=>cell(c.t,c,{fill:'EEF1EC',bold:true,align:'center'})).join('')}</w:tr>`;
  const body=rows.map(r=>r.total?`<w:tr>${cell('Total',{w:W-cols[cols.length-1].w},{span:cols.length-1,bold:true,align:'right'})}${cell(r.total,cols[cols.length-1],{bold:true,align:'right'})}</w:tr>`:`<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((t,i)=>cell(t,cols[i])).join('')}</w:tr>`).join('');
  const b='<w:top w:val="single" w:sz="6" w:color="444444"/><w:left w:val="single" w:sz="6" w:color="444444"/><w:bottom w:val="single" w:sz="6" w:color="444444"/><w:right w:val="single" w:sz="6" w:color="444444"/><w:insideH w:val="single" w:sz="4" w:color="444444"/><w:insideV w:val="single" w:sz="4" w:color="444444"/>';
  return `<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:tblBorders>${b}</w:tblBorders></w:tblPr><w:tblGrid>${cols.map(c=>`<w:gridCol w:w="${c.w}"/>`).join('')}</w:tblGrid>${hdr}${body}</w:tbl>${ctDocxP('',{after:80})}`;
}
function ctDocxImg(rid,cx,cy,id){return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="img${id}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="img${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`}
/* Gera o .docx no layout do contrato Delta (cabeçalho com logo e CNPJ, rodapé com contatos).
   modelo=true: mantém as variáveis {{...}} e cria linhas de tabela repetidoras — é o arquivo para editar no Word e reimportar. */
async function ctGerarDocx(snap,assin,modelo=false){
  if(typeof JSZip==='undefined')throw new Error('Biblioteca JSZip não carregou. Verifique sua conexão com a internet.');
  const r=snap.render,em=snap.empresa||{};assin=assin||{};
  const COLI=[{t:'Item',w:700,align:'center'},{t:'Descrição',w:4300},{t:'kWp',w:800,align:'center'},{t:'Fornecedor',w:1600,align:'center'},{t:'Valor R$',w:2000,align:'right'}];
  const COLP=[{t:'Data',w:1800,align:'center'},{t:'Descrição',w:5200},{t:'Valor R$',w:2400,align:'right'}];
  const tab=k=>k==='tabela_itens'
    ?ctDocxTbl(COLI,modelo?[['{{item_n}}','{{item_desc}}','{{item_kwp}}','{{item_fornecedor}}','{{item_valor}}'],{total:'{{valor_final}}'}]:[...r.itens.map((i,j)=>[String(j+1),i.desc,i.kwp||'',i.fornecedor||'',i.valor?brl(i.valor):'']),{total:brl(r.total)}])
    :ctDocxTbl(COLP,modelo?[['{{parcela_data}}','{{parcela_desc}}','{{parcela_valor}}']]:r.parcelas.map(p=>[fdata(p.data),p.desc,brl(p.valor)]));
  const linha=(l,pre)=>{
    const t=(pre||'')+l;const m=/^\u0000T:(\w+)\u0000$/.exec(l.trim());if(m&&!pre)return tab(m[1]);
    if(t.indexOf('\u0000T:')>=0)return t.split(/(\u0000T:\w+\u0000)/).map(x=>{const mm=/^\u0000T:(\w+)\u0000$/.exec(x);return mm?tab(mm[1]):(x.trim()?ctDocxP(x):'')}).join('');
    if(/^\s*•\s/.test(t))return ctDocxP(t.trim(),{ind:500,align:'left',after:80});
    return ctDocxP(t);
  };
  const body=[];
  body.push(ctDocxP(`**${r.titulo}**`,{align:'center',sz:24,after:60}));
  if(snap.codigo)body.push(ctDocxP(`Nº ${snap.codigo}`,{align:'center',sz:20,after:240}));
  if(modelo)body.push(ctDocxP('**MODELO EDITÁVEL** — personalize no Word mantendo as variáveis {{...}}. Linhas de tabela com {{item_...}} ou {{parcela_...}} se repetem uma vez por item. Depois envie em Templates de contrato.',{sz:18,color:'8A5A00',align:'left'}));
  r.preambulo.forEach(l=>body.push(linha(l)));
  r.clausulas.forEach(cl=>{const ls=cl.linhas.length?cl.linhas:[''];ls.forEach((l,i)=>body.push(i===0?linha(l,`**CLÁUSULA ${cl.ord} – ${cl.titulo}:** `):linha(l)))});
  r.fecho.forEach(l=>body.push(linha(l)));
  const rels=[],media=[];let imgId=10;
  const sigBloco=(lbl,nome,doc,a,rid)=>{
    let img='';if(a&&a.img&&/^data:image\/png;base64,/.test(a.img)){media.push([rid+'.png',a.img.split(',')[1]]);rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${rid}.png"/>`);img=ctDocxImg(rid,2200000,700000,++imgId)}
    return `<w:p><w:pPr><w:spacing w:before="360" w:after="0"/></w:pPr><w:r><w:t xml:space="preserve">${lbl}: </w:t></w:r>${img||'<w:r><w:t>____________________________________________________</w:t></w:r>'}</w:p>`+ctDocxP(`**${nome||(modelo?'':'')}**${doc?'  ·  '+doc:''}${a?`  ·  assinado eletronicamente em ${a.quando}`:''}`,{ind:1400,align:'left',after:120});
  };
  body.push(sigBloco('CONTRATANTE',modelo?'{{cliente_nome}}':r.partes.cliente,modelo?'{{cliente_tipo_doc}} {{cliente_doc}}':(r.partes.clienteDoc?`${r.partes.tipoDoc} ${r.partes.clienteDoc}`:''),assin.cliente,'rIdSigC'));
  body.push(sigBloco('CONTRATADA',modelo?'{{empresa_razao}}':r.partes.empresa,em.cnpj?'CNPJ '+em.cnpj:'',assin.empresa,'rIdSigE'));
  body.push(ctDocxP('TESTEMUNHAS:',{before:240,align:'left'}));
  const ts=modelo?[{nome:'{{testemunha1_nome}}',doc:'{{testemunha1_doc}}'},{nome:'{{testemunha2_nome}}',doc:'{{testemunha2_doc}}'}]:(r.testemunhas.length?r.testemunhas:[{},{}]);
  ts.slice(0,2).forEach(t=>body.push(ctDocxP(`Nome: ${t.nome||'_______________________________'}    RG/CPF: ${t.doc||'_______________________'}    Ass.: ____________________`,{align:'left',before:200})));
  if(assin.cliente){const a=assin.cliente,e=assin.empresa;
    body.push(ctDocxP('**Certificado de assinatura eletrônica**',{before:360,align:'left',color:'0D5C3C'}));
    [`Documento: ${snap.codigo} · emitido em ${snap.emitidoEm||''}`,`CONTRATANTE: ${a.nome} · ${a.tipoDoc||'CPF'} ${a.doc||''} · ${a.quando}${a.email?' · '+a.email:''}`,`Aparelho: ${a.agente||'—'}${a.ip?' · IP '+a.ip:''}`,e?`CONTRATADA: ${e.nome} · ${e.quando}`:'',`SHA-256 do texto assinado: ${snap.hash||''}`,'Assinatura eletrônica nos termos da Lei nº 14.063/2020 e do art. 10, § 2º, da MP nº 2.200-2/2001.'].filter(Boolean).forEach(t=>body.push(ctDocxP(t,{sz:16,align:'left',after:40})));
  }
  const XH='<'+'?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const NS='xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
  const zip=new JSZip();
  zip.file('[Content_Types].xml',XH+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>');
  zip.file('_rels/.rels',XH+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels',XH+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'+rels.join('')+'</Relationships>');
  zip.file('word/_rels/header1.xml.rels',XH+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.jpg"/></Relationships>');
  zip.file('word/media/logo.jpg',DELTA_LOGO_B64,{base64:true});
  media.forEach(([n,b])=>zip.file('word/media/'+n,b,{base64:true}));
  zip.file('word/styles.xml',XH+'<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="22"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>');
  const bdr='<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="2" w:color="111111"/></w:pBdr>';
  zip.file('word/header1.xml',XH+`<w:hdr ${NS}><w:p><w:pPr>${bdr}<w:tabs><w:tab w:val="right" w:pos="9600"/></w:tabs><w:spacing w:after="120"/></w:pPr>${ctDocxImg('rIdLogo',1100000,510000,1)}<w:r><w:tab/></w:r>${ctDocxRuns('CNPJ: '+(em.cnpj||''),{sz:18})}</w:p></w:hdr>`);
  zip.file('word/footer1.xml',XH+`<w:ftr ${NS}><w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="12" w:space="2" w:color="111111"/></w:pBdr><w:jc w:val="center"/><w:spacing w:after="0"/></w:pPr>${ctDocxRuns(`${em.nome||''} – CNPJ ${em.cnpj||''}${em.crea?' – '+em.crea:''}`,{sz:15})}</w:p>${ctDocxP(`${[em.whats,em.whats2].filter(Boolean).join(' / ')}`,{sz:15,align:'center',after:0,line:240})}${ctDocxP(`${em.site||''}${em.email?' / '+em.email:''}`,{sz:15,align:'center',after:0,line:240})}</w:ftr>`);
  zip.file('word/document.xml',XH+`<w:document ${NS}><w:body>${body.join('')}<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:footerReference w:type="default" r:id="rIdF"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1300" w:right="1150" w:bottom="1300" w:left="1150" w:header="450" w:footer="400"/></w:sectPr></w:body></w:document>`);
  return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
async function ctBaixarDocx(id){
  const c=ctDe(id);if(!c)return;ctNumerar(c);
  try{
    toast('Gerando .docx…');const snap=await ctSnapAtual(c);const tpl=ctTemplateDe(c.templateId);let blob=null;
    if(tpl.docx){let b64=null;if(GAS&&tpl.docx.fileId)b64=await gas('lerArquivoBase64',tpl.docx.fileId);else if(tpl.docx.localKey)b64=await docxStoreGet(tpl.docx.localKey);
      if(b64){const v=ctVars(c);Object.keys(v).forEach(k=>{if(typeof v[k]==='string')v[k]=v[k].replace(/\*\*/g,'')});blob=await preencherDocxBase64(b64,v)}}
    if(!blob)blob=await ctGerarDocx(snap,c.assin,false);
    baixarBlob(blob,ctNomeArq(snap,'docx'));toast(tpl.docx?'Contrato .docx gerado com o seu template Word':'Contrato .docx gerado');
  }catch(e){toast('Erro ao gerar .docx: '+(e&&e.message||e))}
}
