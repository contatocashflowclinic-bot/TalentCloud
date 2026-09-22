# Passo a passo de validação (visão do usuário) — Triagem Inteligente de Currículos

Cobre o novo módulo de **Triagem de Currículos**: enviar vários currículos (PDF ou Word) de uma vez para uma vaga, a
IA ler cada um contra o Cargo cadastrado e o DNA da organização, a lista ranqueada, os selos, o detalhe explicado,
decisões em lote (avançar, manter em espera, arquivar) e todos os limites de permissão, LGPD e custo.
Tempo estimado: 30–40 minutos.

## 0. Preparação

1. No terminal do projeto: `npm run db -- migrate`. Deve aplicar a migration `20260921000024_resume_screening`
   (se disser "Nenhuma migration pendente", já está aplicada). **Faça isso antes de subir a nova versão.**
2. `npm run dev` e abra `http://localhost:3000`.
3. Entre com um usuário **Administrador** ou **Recrutador / RH** de uma organização com o módulo de IA contratado
   (as organizações de demonstração já têm). Confirme em **DNA Organizacional** que existe ao menos 1 pilar cultural,
   e em **Cargos** que existe um cargo com requisitos técnicos cadastrados.
4. Tenha à mão 3 ou 4 arquivos PDF ou Word quaisquer no computador (podem ser currículos reais seus ou de colegas, ou
   qualquer PDF/Word de teste — o conteúdo não precisa fazer sentido para os passos A a E; para o passo F, use
   currículos de verdade).
5. **Sobre a chave do Gemini:** se o `.env.local` não tiver `GEMINI_API_KEY`, os passos que dependem da IA (D em
   diante) mostram "Aguardando IA" em vez de uma leitura — isso é o comportamento correto (a triagem nunca inventa
   uma nota). A Parte D tem uma nota sobre isso.

---

## Parte A — Onde fica e quem vê

| # | O que fazer | O que deve acontecer |
|---|---|---|
| A1 | Abra **Processo Seletivo**, escolha uma vaga. | Ao lado do seletor de vaga aparece um alternador **Quadro \| Triagem de Currículos** (só para quem tem o módulo de IA). |
| A2 | Clique **Triagem de Currículos**. | Abre a aba: bloco de critérios (se houver problema), caixa de envio (se você pode enviar), filtros e a lista da vaga. |
| A3 | Entre com um perfil **Entrevistador**. | O alternador **não aparece**; a aba de Triagem não existe para esse perfil. |
| A4 | Entre com **Gestor da Vaga**. | O alternador aparece e a lista abre normalmente, mas **não há** caixa de envio (ele decide, não envia). |
| A5 | Na Conta Mãe, desmarque o módulo **Avaliação por IA** dessa organização (Organizações → editar) e volte à janela da organização (F5). | O alternador some por completo, junto com o resto do rastro de IA (como já acontece hoje). Religue o módulo ao terminar o passo H. |

---

## Parte B — Cargo ou DNA incompletos

| # | O que fazer | O que deve acontecer |
|---|---|---|
| B1 | Em **DNA Organizacional**, apague temporariamente todos os pilares e salve. Volte à Triagem da vaga. | Faixa vermelha: "O DNA Organizacional ainda não tem pilares cadastrados." A caixa de envio some. |
| B2 | Devolva ao menos um pilar ao DNA e salve. | O aviso some e a caixa de envio volta. |
| B3 | Crie uma vaga nova com um Cargo **sem** requisitos técnicos nem comportamentais. Abra a Triagem dessa vaga. | Faixa amarela (aviso, não bloqueio): "O Cargo desta vaga não tem requisitos cadastrados: a triagem fica menos precisa." A caixa de envio continua disponível. |

---

## Parte C — Enviar currículos: formato, tamanho e duplicidade

| # | O que fazer | O que deve acontecer |
|---|---|---|
| C1 | Arraste 2 ou 3 arquivos PDF/Word para a caixa de envio (ou clique para escolher). | Cada um aparece na fila com **Enviando…** e depois **Lendo…**. |
| C2 | Tente enviar um arquivo `.txt` ou uma imagem. | A fila mostra **Não foi possível ler**, com a mensagem "Formato não permitido. Envie o currículo em PDF ou Word (.docx)." |
| C3 | Tente enviar um Word antigo (`.doc`, não `.docx`). | Mensagem própria: "Este arquivo é um Word antigo (.doc). Abra no Word e use 'Salvar como' para gerar um .docx ou um PDF." |
| C4 | Envie de novo o **mesmo arquivo** que já está na lista. | A fila mostra que o arquivo já foi enviado para esta vaga (não duplica). |
| C5 | Tente enviar um arquivo maior que 4 MB. | Recusado antes mesmo de subir, com o aviso de limite de 4 MB. |

---

## Parte D — A leitura pela IA

> **Sem `GEMINI_API_KEY` configurada:** os arquivos ficam com o estado **"Aguardando IA"** — a triagem nunca mostra uma
> nota inventada quando a IA está indisponível. Preencha a chave no `.env.local`, reinicie `npm run dev` e clique
> **Analisar pendentes** (ou reenvie) para ver os passos D2 em diante de verdade.

| # | O que fazer | O que deve acontecer |
|---|---|---|
| D1 | Sem a chave configurada, observe a fila depois do envio. | Status **"Aguardando IA"** em vez de uma nota. Nenhum candidato é criado. A caixa de envio mostra o aviso de quantas análises restam no mês (ou que a IA não está disponível). |
| D2 | Com a chave configurada, envie um currículo de verdade. | A fila mostra **Lendo…** e depois **Pronto**. O candidato aparece na lista ranqueada, com candidatura criada na primeira etapa do funil. |
| D3 | Clique na linha do candidato. | Abre o painel de detalhe: nota geral, técnica e cultural, parecer, **requisitos do Cargo** cada um com "Atende / Atende em parte / Não atende / Sem evidência" e um trecho do currículo como evidência, **pilares do DNA** com nível de confiança, pontos fortes, pontos de atenção e perguntas sugeridas para a entrevista. |
| D4 | Clique **Baixar currículo original**. | Baixa o arquivo exatamente como foi enviado. |
| D5 | Clique **Reanalisar**. | Pede confirmação (conta como nova análise no limite mensal), refaz a leitura e atualiza o detalhe. |

---

## Parte E — Ranking, selos e filtros

| # | O que fazer | O que deve acontecer |
|---|---|---|
| E1 | Envie e analise 2 ou 3 currículos diferentes. | A lista vem ordenada da **maior** para a **menor** nota geral. |
| E2 | Use os filtros no topo (**Alta aderência, Aderência média, Aderência baixa, Segunda olhada, Revisar, Sem currículo, Arquivadas**). | Cada filtro mostra só as candidaturas correspondentes. "Arquivadas" mostra as arquivadas; os demais filtros as escondem. |
| E3 | Suba bastante o **corte de aderência cultural** no DNA Organizacional (ex.: 99%) e volte à Triagem. | Alguém com boa aderência cultural mas nota geral abaixo de 60% ganha o selo **Segunda olhada** (nunca é escondido). Devolva o valor original do corte ao terminar. |
| E4 | Uma candidatura veio do **Portal de Vagas** (sem arquivo). | Aparece na lista com o selo **Sem currículo** e sem nota (a menos que já tenha sido avaliada manualmente pela tela de Avaliação por IA). |
| E5 | Edite o Cargo da vaga (mude um requisito) e volte à Triagem sem reanalisar ninguém. | As candidaturas já lidas ganham o selo **Critérios mudaram**. |

---

## Parte F — Currículo incompleto ou com e-mail ausente

| # | O que fazer | O que deve acontecer |
|---|---|---|
| F1 | Envie um currículo sem e-mail visível (ou edite um PDF de teste para remover o e-mail). | Depois de lido, o arquivo aparece na lista **"Arquivos ainda sem candidatura"**, com o botão **Completar dados**. |
| F2 | Clique **Completar dados**, preencha nome e e-mail e confirme. | O candidato e a candidatura são criados normalmente; o arquivo sai da lista de pendentes e entra no ranking. |
| F3 | Envie um currículo praticamente em branco (poucas linhas). | O selo **Currículo incompleto** aparece, e os requisitos ficam como "Sem evidência" (nunca uma nota baixa inventada). |

---

## Parte G — Decisão em lote (a IA nunca decide sozinha)

| # | O que fazer | O que deve acontecer |
|---|---|---|
| G1 | Marque a caixa de 2 ou 3 linhas (ou use **Selecionar Alta aderência** / **Selecionar Segunda olhada**). | Aparece uma barra fixa embaixo com o total selecionado e os botões **Avançar**, **Manter em espera**, **Arquivar**. |
| G2 | Clique **Avançar**. | As candidaturas selecionadas vão para a próxima etapa do funil; confira em **Processo Seletivo → Quadro**. |
| G3 | Selecione outras e clique **Arquivar**. | Pede um motivo (obrigatório); sem motivo, o botão fica desabilitado. Depois de confirmar, aparecem como arquivadas e continuam na lista (filtro "Arquivadas"). |
| G4 | Reabra o quadro Kanban. | As mudanças de etapa e os arquivamentos feitos na Triagem aparecem lá também — é a mesma candidatura, duas visões. |
| G5 | Como **Gestor da Vaga**, repita G2/G3. | Funciona (ele decide). Como **Entrevistador**, tente pela API ou confirme que os botões nem aparecem. |

---

## Parte H — Consumo de IA e limite mensal

| # | O que fazer | O que deve acontecer |
|---|---|---|
| H1 | Antes de enviar um lote grande, olhe o aviso acima da caixa de envio. | Mostra quantas análises ainda restam no mês para a organização (ou que não há limite). |
| H2 | Na **Conta Mãe → Uso da IA**, defina um limite mensal bem baixo (ex.: 1) para a organização de teste. | Ao tentar analisar outro currículo, o arquivo fica **"Aguardando IA"** (política "estimativa") ou a análise é recusada com a mensagem do limite (política "bloquear") — igual ao que já acontece na Avaliação por IA hoje. |
| H3 | Volte à **Conta Mãe → Uso da IA**. | As leituras de currículo aparecem contabilizadas junto com as demais avaliações de IA (mesmo painel, mesmo custo estimado). |
| H4 | Remova o limite de teste. | Volta ao padrão da plataforma. |
| H5 | Religue o módulo **Avaliação por IA** da organização, se você o desligou no passo A5. | Tudo volta ao normal. |

---

## Se algo falhar

- **A aba "Triagem de Currículos" não aparece:** confirme que o módulo **Avaliação por IA** está ligado para a
  organização (Conta Mãe) e que o seu perfil tem as permissões de **Processo Seletivo**, **Candidatos** e
  **Avaliação por IA** para visualizar.
- **A caixa de envio não aparece, mas a lista sim:** seu perfil só tem permissão de visualizar/decidir (ex.: Gestor
  da Vaga), não de enviar (Recrutador/RH ou Administrador). Isso é o esperado.
- **Tudo fica "Aguardando IA":** confirme `GEMINI_API_KEY` no `.env.local` e reinicie `npm run dev`; ou confira se a
  IA está pausada ou sem limite na Conta Mãe.
- **Erro "vaga não encontrada" ou "sistema desatualizado":** rode `npm run db -- migrate` e recarregue com Ctrl+F5.
- **Um currículo fica "Não foi possível ler" mesmo com a chave configurada:** clique para tentar de novo; se persistir,
  confira no terminal do servidor a linha de erro do Gemini (mesma causa das falhas na Avaliação por IA comum: chave
  inválida ou modelo incorreto configurado na Conta Mãe).
