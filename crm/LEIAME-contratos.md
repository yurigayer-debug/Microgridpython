# Aba Contratos — CRM Delta Solar

Versão `2026-11-23a` do CRM (`index.html`), construída a partir do **CRM (teste) 2026-11-22d**.

## O que tem

- **Contratos** (menu Vender): lista com situação, editor em 5 passos (Contratante → Obra e kit → Preço e pagamento → Cláusulas → Revisar e enviar), prévia ao vivo, PDF, `.docx`, WhatsApp, e-mail, compartilhar PDF pelo celular, assinatura online/presencial, contra-assinatura, termo aditivo, duplicar, cancelar, histórico e checklist de documentos.
- **Templates de contrato**: Solar On-Grid/Híbrido, Serviços de Elétrica e Termo Aditivo, editáveis; importar `.docx`; baixar modelo `.docx` editável.
- Campos `{{...}}`: todos os da proposta + os de contrato (lista no botão **📋 Campos**). Em tabelas do Word, uma linha com `{{item_...}}` ou `{{parcela_...}}` é repetida para cada item.
- Texto-base = contrato padrão Delta Solar, **sem dados de cliente, obra ou kit**.
- `window.DeltaContratos`: API para o Claude (MCP de navegador) ou automações listarem, criarem, preencherem e enviarem contratos. O formato está em `src/contratos-schema.json`.

## Código

`index.html` é arquivo único (exigência do Apps Script). O módulo fica em `src/` e é injetado com:

```
python3 build.py
```

## Assinatura online (modo Google / Apps Script)

1. No projeto do Apps Script do CRM: **Arquivo → + → Script**, nome `Contratos`, cole `Contratos.gs`.
2. No `doGet` do `Code.gs`, logo no início:
   ```js
   if (e && e.parameter && e.parameter.c) return contratoPaginaPublica(e);
   ```
3. Inclua `'contratosVenda'` na lista de coleções (abas) que o `Code.gs` salva/carrega — a mesma lista que já tem `'propostas'`, `'contratos'` etc.
4. Cole o `index.html` novo no arquivo `Index` e publique **nova versão** nas duas implantações (interna e “Propostas públicas”). Na primeira execução, autorize Drive e Gmail.

Resultado: o link `URL-pública?c=<id>&t=<token>` abre a página de leitura/assinatura no celular do cliente; ao assinar, o PDF assinado e a imagem da assinatura vão para a pasta **Delta CRM - Contratos/<cliente>** no Drive e a via segue por e-mail para o cliente e para o e-mail oficial da empresa. O CRM busca as assinaturas sozinho ao carregar.

No modo navegador (artefato), não existe link remoto: use **Assinatura presencial** ou envie o PDF.

## Antes de usar com clientes

- Revisar o texto com o jurídico (multas, honorários, foro) — Configurações → Contratos.
- Conferir dados bancários, responsável técnico e CREA em Configurações → Contratos.
- A assinatura eletrônica simples registra nome, CPF/CNPJ conferido, data/hora, aparelho e hash SHA-256 do texto. Para exigência de certificado ICP-Brasil, use um provedor específico.
