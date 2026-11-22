# Delta CRM no Docker: passo a passo para testar no seu PC

Aqui o CRM roda inteiro no seu computador, como vai rodar depois no servidor pago (Hostinger ou outro). Nada é contratado e nada sai da sua máquina. Os e-mails ficam presos numa caixa de teste.

## O que vai rodar

| Container | O que faz | Endereço |
|---|---|---|
| `app` | O CRM (as mesmas telas de sempre) + a API que substitui o Google Apps Script | http://localhost:8080 |
| `db` | Banco de dados Postgres (substitui a Planilha) | interno |
| `backup` | Backup automático do banco todo dia: guarda 30 diários, 8 semanais e 12 mensais em `backups\` | interno |
| `pdf` | Gera o PDF dos contratos (Gotenberg) | interno |
| `mailpit` | Caixa de e-mail de teste: tudo que o CRM "envia" aparece aqui | http://localhost:8025 |

O `index.html` é o mesmo do Google e do artefato. Quando roda no servidor, ele usa a API daqui em vez do Apps Script.

---

## Passo 1 — Requisitos do PC

- Windows 10 (22H2) ou 11, 64 bits
- 8 GB de RAM (16 GB é mais confortável)
- Uns 6 GB livres em disco. A imagem que gera PDF é a maior, com cerca de 2,5 GB.
- Virtualização ligada na BIOS. Quase todo PC de hoje já vem assim; o Docker avisa se não estiver.

## Passo 2 — Instalar o Docker Desktop

1. Baixe em **https://www.docker.com/products/docker-desktop/** e clique em *Download for Windows*.
2. Instale e deixe marcada a opção **Use WSL 2**.
3. Reinicie o PC se ele pedir.
4. Abra o **Docker Desktop**, aceite os termos e espere o rodapé mostrar **Engine running**. Não precisa criar conta.

> O Docker Desktop é grátis para uso pessoal e para empresas com menos de 250 funcionários e menos de US$ 10 milhões de faturamento por ano.

## Passo 3 — Baixar o projeto

**Opção A, com Git** (recomendada, porque facilita atualizar). Instale o Git em https://git-scm.com e, no *Prompt de Comando*:

```bat
cd %USERPROFILE%\Documents
git clone https://github.com/yurigayer-debug/Microgridpython.git
cd Microgridpython
git checkout claude/crm-delta-contract-tab-18a2yd
cd crm
```

**Opção B, sem Git.** No GitHub, abra o repositório, troque o branch para `claude/crm-delta-contract-tab-18a2yd` e use **Code → Download ZIP**. Extraia e entre na pasta `crm`.

## Passo 4 — Configurar (1 minuto)

1. Na pasta `crm`, copie `.env.example` e renomeie a cópia para `.env`. Se você pular esta etapa, o `iniciar.bat` cria o arquivo sozinho.
2. Abra o `.env` no Bloco de Notas e troque:
   - `CRM_USUARIOS=` pelos seus e-mails e senhas de acesso, no formato `email:senha,email2:senha2`
   - `POSTGRES_PASSWORD=` por uma senha qualquer do banco
3. Deixe `PUBLIC_URL=http://localhost:8080` por enquanto. O Passo 8 explica como testar no celular.

> O `.env` tem senhas e **não vai para o GitHub**: ele está no `.gitignore`.

## Passo 5 — Subir o CRM

Dê dois cliques em **`iniciar.bat`**.

- Na primeira vez, o Docker baixa cerca de 3 GB e monta a imagem do CRM. Leva de 5 a 15 minutos, conforme a internet. Das próximas vezes leva segundos.
- No fim, o navegador abre em **http://localhost:8080** e na caixa de e-mails de teste.
- O navegador pede **usuário e senha**: use os que você colocou no `CRM_USUARIOS`.

Na primeira entrada o CRM pergunta como começar. Clique em **Carregar dados de exemplo** para ter propostas, kits e clientes para testar.

## Passo 6 — Roteiro de teste (marque cada item)

**Propostas**
- [ ] Abrir **Propostas** e depois uma proposta emitida. Na aba *Emitir*, copiar o **link do cliente**.
- [ ] Abrir esse link numa **janela anônima** (Ctrl+Shift+N). Abre sem pedir senha, como para o cliente.
- [ ] Aceitar a proposta pela página do cliente.
- [ ] Voltar ao CRM, atualizar (F5) e conferir: proposta **Aceita**, usina criada em *Usinas*, títulos em *Financeiro* e visita em *Agenda*.

**Contratos**
- [ ] Na proposta aceita, clicar em **✍ Gerar contrato**, ou em *Contratos → + Novo contrato*.
- [ ] Passo 1: preencher CPF e endereço (digite o CEP: o endereço preenche sozinho).
- [ ] Passo 5: clicar em **Gerar e enviar para assinatura**. Copiar o **link de assinatura**.
- [ ] Abrir o link numa janela anônima, conferir o resumo, digitar o CPF, marcar o aceite, assinar com o mouse e clicar em **Assinar contrato**.
- [ ] Na caixa de e-mails (http://localhost:8025), ver as vias com **PDF anexado**: uma para o cliente, outra para o e-mail da empresa.
- [ ] No CRM (F5), o contrato aparece como **Assinado pelo cliente**. Clicar em **Contra-assinar** e conferir que fica **Concluído** e que o e-mail final chegou.
- [ ] Baixar o **.docx** e o **PDF** do contrato.

**Dados e backup**
- [ ] Rodar **`parar.bat`** e depois **`iniciar.bat`** de novo. Tudo continua lá.
- [ ] Rodar **`backup-agora.bat`** e ver os arquivos `.sql.gz` aparecerem em `backups\`.
- [ ] **Testar a restauração**: anote algo (por exemplo, crie um cliente "TESTE"), arraste um arquivo de `backups\last\` para cima de **`restaurar.bat`** e digite `SIM`. O CRM volta ao estado do backup.

## Passo 7 — Usar o Claude Code no seu PC (opcional)

Com o Claude Code instalado no Windows, abra a pasta `crm` e peça, por exemplo:
- "suba o CRM com docker compose e me diga se está saudável"
- "mostre os logs do app"
- "faça um backup e teste a restauração numa base separada"

O Claude Code roda os mesmos comandos deste guia.

## Passo 8 — Testar no celular (mesmo Wi-Fi)

1. No PC, rode `ipconfig` e anote o **Endereço IPv4**, por exemplo `192.168.0.15`.
2. No `.env`, troque para `PUBLIC_URL=http://192.168.0.15:8080` e rode **`iniciar.bat`** de novo.
3. Se o Windows perguntar sobre o firewall, permita o acesso em **Redes privadas**.
4. No celular, abra `http://192.168.0.15:8080`. Os links de proposta e de contrato gerados depois disso já abrem no celular.

> Links criados antes da troca continuam com `localhost`. Gere de novo (Reenviar) para testar no celular.

## Backup: o que fica onde

| O quê | Onde | Frequência |
|---|---|---|
| Código do CRM | GitHub (este repositório) | a cada commit |
| Banco completo (`.sql.gz`) | `crm\backups\daily`, `weekly`, `monthly` e `last` | automático, todo dia |
| Foto em JSON (botão *Fazer backup agora* em Configurações) | `crm\backups\manual-*.json.gz` | quando você clicar |
| Configurações e senhas (`.env`) | só no seu PC | guarde uma cópia num lugar seguro |

**Não suba a pasta `backups` nem o `.env` para o GitHub.** Os backups têm CPF, endereços e assinaturas, que são dados pessoais protegidos pela LGPD. Para ter cópia fora do PC, use uma pasta sincronizada com o Google Drive ou o OneDrive. Na produção, o backup vai criptografado para um armazenamento próprio.

## Comandos úteis (Prompt de Comando, dentro da pasta `crm`)

```bat
docker compose ps              :: o que está rodando e se está saudável
docker compose logs -f app     :: acompanhar o log do CRM (Ctrl+C sai)
docker compose restart app     :: reiniciar só o CRM
git pull && iniciar.bat        :: atualizar para a versão nova do GitHub
docker compose down -v         :: APAGA TUDO (dados inclusive) para recomeçar do zero
```

## Problemas comuns

- **"Docker Desktop não está aberto"**: abra o Docker Desktop e espere *Engine running*.
- **Porta 8080 ou 8025 ocupada**: no `docker-compose.yml`, troque `"8080:8080"` por `"8090:8080"`, use `http://localhost:8090` e ajuste o `PUBLIC_URL`.
- **O navegador não pede senha ou dá "Login necessário"**: feche todas as janelas do navegador e abra de novo. A senha é a do `CRM_USUARIOS`, no formato `email:senha`.
- **PDF não chega no e-mail**: confira se o container `pdf` está *Up* com `docker compose ps`. Na primeira subida ele pode levar alguns segundos a mais.
- **Busca de CEP não preenche**: precisa de internet no PC (usa o ViaCEP). Sem internet, digite o endereço.

## Depois de aprovado: ir para o servidor

O **mesmo** `docker-compose.yml` vai para a VPS. Mudam só três coisas:
1. `PUBLIC_URL=https://crm.seudominio.com.br`, com HTTPS automático (Caddy).
2. O SMTP de verdade no `.env`, no lugar do Mailpit.
3. A cópia dos backups criptografada para fora do servidor, além do backup semanal da própria Hostinger.

Os arquivos dessa etapa (Caddy, cópia externa do backup e publicação pelo GitHub Actions) entram quando vocês decidirem contratar.
