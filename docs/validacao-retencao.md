# Passo a passo de validação (visão do usuário) — Retenção de Talentos & Clima

## Roteiro rápido (uns 15 minutos)

**Antes:** rode `npm run dev`, abra o sistema e entre como **Administrador** de uma organização. Se estiver logado desde antes, saia e entre de novo.

### Parte 1 — Alertas de risco

| # | Faça isto | Deve acontecer |
|---|---|---|
| 1 | Menu **Retenção** → aba **Visão geral**. | Aparecem 3 cartões (eNPS, Alertas ativos, Retenção 90 dias). Onde não há dado, aparece **—**, sem número inventado. |
| 2 | Aba **Alertas de risco** → **Registrar Sinal de Risco** → escolha uma pessoa da lista. | O formulário abre já com o nome preenchido. |
| 3 | Escolha o risco **Alto**, escreva um sinal e uma ação (uma por linha) → **Salvar alerta**. | O cartão aparece com **Risco Alto** e situação **Aberto**. |
| 4 | No cartão, **Registrar ação** → escreva algo → salvar. | A situação vira **Em acompanhamento** e a ação aparece em **Última ação**. |
| 5 | Clique em **Histórico**. | Mostra cada passo com quem fez e quando. |
| 6 | **Alterar situação** → **Resolvido** → salvar. | O alerta sai da lista (filtro "Ativos") e o contador da Visão geral diminui. |
| 7 | Tente abrir outro alerta para a **mesma pessoa** enquanto houver um ativo. | O sistema recusa: "Já existe um alerta ativo…". |

### Parte 2 — Pesquisa de clima

| # | Faça isto | Deve acontecer |
|---|---|---|
| 8 | Aba **Pesquisas** → **Nova pesquisa** → dê um nome → **Criar rascunho**. | Aparece um cartão **Rascunho**. |
| 9 | Clique **Publicar** e confirme. | O cartão vira **Aberta**, com "Participação 0 de N". |
| 10 | Abra o sistema como **outra pessoa** (perfil Colaborador; aba anônima ou outro navegador). | Na tela inicial aparece a faixa **"Você tem uma pesquisa de clima aberta"**. |
| 11 | Clique na faixa, dê as notas (recomendação + 5 categorias) → **Enviar resposta**. | Aparece "Obrigado! Sua resposta foi registrada de forma anônima" e a faixa some. Esse usuário **não vê** alertas nem resultados. |
| 12 | Volte como Administrador → **Pesquisas** → **Ver resultado**. | Participação "1 de N". Com menos de 5 respostas **não mostra notas nem comentários**, só o aviso de que o resultado é liberado a partir de 5 (proteção do anonimato). |
| 13 | **Encerrar** a pesquisa e confirme. | Vira **Encerrada**. Ninguém mais consegue responder. |

**Opcional:** para ver o resultado completo (eNPS, notas, comentários), faça **5 pessoas diferentes** responderem antes de encerrar. Ao chegar na 5ª resposta, o resultado é liberado.

### Parte 3 — Templates e perguntas por cargo

| # | Faça isto | Deve acontecer |
|---|---|---|
| 14 | Aba **Templates**. | Aparece a **Biblioteca do sistema** (Clima geral, Liderança, Tecnologia, Comercial, Atendimento, Saúde, Primeiros 90 dias, Trabalho híbrido, Cultura). Embaixo, **Da sua organização**, vazia no começo. |
| 15 | Num template (ex.: **Tecnologia e produto**), clique **Ver perguntas**. | Mostra os blocos, cada pergunta, o tipo (escala, escolha, texto) e para quais cargos o bloco vale. |
| 16 | Antes, em **Usuários e Permissões**, edite as pessoas e escolha o **Cargo** de cada uma **na lista** (só aparecem cargos do módulo **Cargos**). Depois, no template **Tecnologia e produto**, clique **Usar em nova pesquisa**. | A pesquisa abre com o template e o nome sugerido. O bloco de tecnologia já vem com os **cargos cadastrados** da trilha Técnica marcados (agrupados por departamento) e mostra quantas pessoas veem o bloco. |
| 17 | Ajuste os cargos marcados, se quiser, e clique **Criar rascunho** e depois **Publicar**. | O cartão mostra "10 perguntas estratégicas em 2 blocos". |
| 18 | Entre como uma pessoa **vinculada a um cargo marcado** e responda. Depois, como uma **sem cargo** ou de outro cargo. | Quem tem o cargo marcado vê o bloco de tecnologia; quem não tem **não vê**. As perguntas para todos aparecem para todos. |
| 19 | Volte à aba **Templates** → **Copiar e editar** num template da biblioteca, mude o nome e salve. | A cópia aparece em **Da sua organização** e pode ser editada ou excluída. A biblioteca do sistema não muda. |

### Parte 4 — Sigilo dos alertas, cargos em lote, exportação

| # | Faça isto | Deve acontecer |
|---|---|---|
| 20 | Como **Administrador**, abra **Retenção → Alertas de risco**. | Vê todos os alertas. O topo diz "Sigiloso para RH e Administração". |
| 21 | Entre como **Gestor da Vaga** (ou outro perfil sem "Alertas de toda a organização") e abra **Retenção → Alertas de risco**. | Aparece o aviso "Você vê só os alertas da sua equipe". Só listam os alertas de pessoas que ele gerencia (no PDI ou chefiando o departamento), que ele abriu ou de que é responsável. Os números da Visão geral contam só esses. |
| 22 | Em **Usuários e Permissões**, clique **Vincular cargos em lote**. | Abre a lista de pessoas ativas sem cargo cadastrado, cada uma com uma **lista de cargos cadastrados** (nada de texto livre). Se o rótulo antigo for igual a um cargo cadastrado, ele já vem escolhido. Escolha e clique **Vincular N pessoas**. |
| 23 | Abra **Desenvolvimento → Novo PDI → Cadastrar quem não está na lista**. | O **Cargo** é uma lista de cargos cadastrados (sem campo de texto). |
| 24 | Em **Pesquisas**, clique **Duplicar** numa pesquisa. | Abre "Duplicar pesquisa" com o nome "… (cópia)", o mesmo público e as mesmas perguntas estratégicas. |
| 25 | Em **Pesquisas → Ver resultado**, clique **Exportar resultado**. | Escolha **Planilha CSV** ou **Relatório PDF**: baixa o resultado como está na tela (nada abaixo de 5 respostas, sem autor, sem o que o RH ocultou). |
| 26 | Entre como uma pessoa com pesquisa aberta para responder. | No menu, o item **Retenção** mostra um selo amarelo "1 pesquisa". Depois de responder, o selo some. |

**Se algo não bater:** atualize a página com Ctrl+F5. Se o colaborador não vê a pesquisa, confira se o perfil dele tem **Pesquisa de Clima → Visualizar** (perfis personalizados antigos precisam dessa marcação).

---

## Guia detalhado

**Preparação:** aplique as migrations novas (`20260921000020_retention.sql`, `20260921000021_survey_templates.sql` e `20260921000022_member_position.sql` e `20260921000023_alert_scope_pdi_position.sql`, com `npm run db -- migrate`) e rode `npm run dev`. Entre em uma organização dos planos **Scale** ou **Enterprise** (a Retenção não existe no Starter) com um usuário **Administrador**. Para as partes de pesquisa você precisa de **pelo menos 5 pessoas ativas** na organização (crie usuários em **Usuários e Permissões** se preciso; o perfil **Colaborador** basta). Repita a parte D no celular.

O módulo tem cinco abas: **Visão geral**, **Alertas de risco**, **Pesquisas**, **Templates** e **Responder pesquisa**. Quem gerencia vê as quatro primeiras; qualquer colaborador vê só a última.

## A. Visão geral (sem números inventados)

| # | O que fazer | O que deve acontecer |
|---|---|---|
| A1 | Abra **Retenção** no menu lateral, aba **Visão geral**. | Três cartões: **eNPS da Organização**, **Alertas de Risco Ativos** e **Taxa de Retenção (90 dias)**, mais **Notas por categoria** e **Evolução do eNPS**. |
| A2 | Numa organização **nova** (sem pesquisa nenhuma). | O eNPS mostra **—** com "Ainda não há pesquisa com resultado liberado". A retenção mostra **—** ("Sem base de cálculo"). Nada de "+85" nem "96,8%" inventados. |
| A3 | Na organização de demonstração (TechCorp). | eNPS **+100**, "2 promotores · 0 neutros · 0 detratores — 2026-Q1", selo **Zona de Excelência**. A retenção é **100 − a rotatividade dos primeiros 90 dias** do módulo **Indicadores** (mesmo número nos dois lugares). |
| A4 | Compare o número de **Alertas de Risco Ativos** com a aba **Alertas de risco**. | É a quantidade de alertas **abertos ou em acompanhamento**, com a divisão por risco (alto · médio · baixo). Alertas encerrados não contam. |

## B. Alertas de risco de turnover

| # | O que fazer | O que deve acontecer |
|---|---|---|
| B1 | Aba **Alertas de risco**. | Lista os alertas ativos (maior risco primeiro). Cada cartão mostra nome, departamento, **Risco** e **situação** (Aberto, Em acompanhamento…), sinais, ações recomendadas, última ação e **Histórico**. |
| B2 | Clique em **Histórico (n)** de um alerta. | Abre a linha do tempo, da mais recente para a mais antiga: quem fez, quando e o quê ("Alerta aberto com risco Médio.", ações, mudanças de situação). |
| B3 | Clique em **Registrar Sinal de Risco**. | Abre "Sobre quem é o sinal de risco?" com a lista de pessoas: quem já tem **PDI**, **contratações** em onboarding e **usuários** da organização. **Quem já tem alerta ativo não aparece.** Há busca por nome/cargo. |
| B4 | Escolha alguém. | O formulário vem preenchido (nome e departamento). Escolha o **Nível de risco**, o **Responsável pelo acompanhamento** (opcional), digite os **sinais** e as **ações preventivas** (um por linha) e clique **Salvar alerta**. |
| B5 | Repita B3 → **Cadastrar quem não está na lista** e informe só um nome. | O alerta é criado para alguém fora do sistema (departamento "Geral", se não escolher). |
| B6 | Tente abrir outro alerta para uma pessoa que já tem um ativo. | Recusado: "Já existe um alerta ativo para …". (Vale para o mesmo nome também.) |
| B7 | Num alerta **Aberto**, clique **Registrar ação**, escreva o que foi feito e salve. | A ação aparece como **Última ação** e no histórico, e o alerta passa para **Em acompanhamento**. |
| B8 | Clique **Alterar situação** → **Resolvido** (com uma observação, opcional) e salve. | O alerta sai da lista de ativos (filtro padrão), mostra "Resolvido em <data> — <observação>" e some do contador da Visão geral. |
| B9 | Tente **Descartado** ou **Colaborador saiu** sem escrever a observação. | Recusado: é preciso informar o motivo. |
| B10 | Mude o filtro para **Todos** (ou **Resolvido**) e abra um alerta encerrado. | Aparece só **Alterar situação → Reabrir o alerta** (sem Registrar ação nem Editar). Reabrir volta para **Aberto** e apaga a data de encerramento. |
| B11 | Encerre um alerta, abra um **novo** para a mesma pessoa e depois tente **Reabrir** o antigo. | Recusado: a pessoa já tem outro alerta ativo. |
| B12 | Clique **Editar** num alerta ativo, mude o risco e o responsável e salve. | Os dados mudam e o histórico registra "Nível de risco alterado de … para …" e "Responsável definido: …". |
| B13 | Num alerta **recém-criado, sem nenhuma ação**, clique na lixeira e confirme. | O alerta é excluído. (Alerta que já teve andamento **não** tem lixeira: encerre-o para manter o histórico.) |
| B14 | Num alerta de quem tem PDI, clique **Abrir PDI** (aparece para quem também acessa **Desenvolvimento**). | Abre o módulo **Desenvolvimento** já no PDI dessa pessoa. |
| B15 | Use os filtros (situação, risco) e a busca por nome/departamento. | A lista acompanha os filtros; sem resultado: "Nenhum alerta com esses filtros". |

## C. Pesquisa de clima interna — criar e publicar (RH)

| # | O que fazer | O que deve acontecer |
|---|---|---|
| C1 | Aba **Pesquisas** numa organização sem pesquisas. | "Nenhuma pesquisa criada ainda." |
| C2 | Clique **Nova pesquisa**. Informe o **Nome** (ex.: `Pesquisa de Clima 3º trimestre`), confira o **Período** (vem sugerido, ex.: `2026-Q3`), a **mensagem** para quem vai responder e, se quiser, a data em **Encerra em**. Deixe **Toda a organização** e clique **Criar rascunho**. | Aparece o cartão com o selo **Rascunho**. |
| C3 | Crie outro rascunho escolhendo **Departamentos específicos** e marque um ou mais. | O cartão mostra "N departamentos: <nomes>". Sem marcar nenhum, o sistema recusa. |
| C4 | Informe uma data de encerramento **no passado**. | Recusado: "A data de encerramento não pode estar no passado." |
| C5 | No rascunho, clique **Editar**, mude o nome e salve. Depois **Excluir** (lixeira) um rascunho descartável. | O nome muda; o rascunho excluído some. |
| C6 | Clique **Publicar** e confirme. | Selo **Aberta**, com a barra **Participação — 0 de N (0%)**, onde N são as pessoas ativas do público. **Publicar** fica desabilitado se o público não tem ninguém. |
| C7 | Numa pesquisa **aberta**, clique **Editar**. | Só dá para mudar **Encerra em** e o **Plano de ação**. O nome, o público e o período ficam travados. Uma pesquisa aberta não tem lixeira. |

## D. Responder à pesquisa (colaborador — faça no celular)

| # | O que fazer | O que deve acontecer |
|---|---|---|
| D1 | Entre com um usuário **Colaborador** (ou qualquer perfil de sistema) que faz parte do público. | Na tela inicial aparece a faixa **"Você tem uma pesquisa de clima aberta"**, com **Responder**. |
| D2 | Clique na faixa (ou em **Retenção** no menu). | Abre só a tela **Responder pesquisa**: o colaborador **não vê** abas, alertas nem resultados. |
| D3 | Veja a pesquisa. | Mostra o nome, o período, a mensagem do RH, a pergunta de recomendação (0 a 10), as **cinco categorias** (Liderança, Cultura, Crescimento, Remuneração, Ambiente), o comentário opcional e o aviso **"Sua resposta é anônima"**. |
| D4 | Toque em **Enviar resposta** sem responder tudo. | O botão fica desabilitado até a recomendação e as cinco categorias terem nota. |
| D5 | Dê as notas, escreva um comentário (opcional) e envie. | "Obrigado! Sua resposta foi registrada de forma anônima." e o selo **Respondida**. A faixa da tela inicial **desaparece**. |
| D6 | Tente responder de novo (recarregue a página e abra a pesquisa). | Não abre o formulário: a pesquisa aparece como respondida. (Enviar duas vezes ao mesmo tempo também grava só uma resposta.) |
| D7 | Com um usuário de **fora do público** (pesquisa por departamento). | Ele não vê a pesquisa nem a faixa. |
| D8 | Volte como RH em **Pesquisas**. | A **Participação** subiu (ex.: "1 de 6 (17%)"). |

## E. Resultado e anonimato

| # | O que fazer | O que deve acontecer |
|---|---|---|
| E1 | Com **menos de 5 respostas**, clique **Ver resultado**. | Mostra só a **Participação** e "Há N resposta(s). O resultado é liberado a partir de 5, para proteger o anonimato." Nenhuma nota nem comentário aparece. |
| E2 | Peça mais respostas até chegar a **5**. | O resultado é liberado: **eNPS** (com a faixa), promotores/neutros/detratores, **Notas por categoria** e, se houver, **Comentários anônimos**. |
| E3 | Confira o eNPS. | É **% de promotores (notas 9–10) − % de detratores (0–6)**, de −100 a +100. Ex.: 5 promotores, 2 neutros e 2 detratores em 9 respostas dão **+33**. |
| E4 | Olhe **Por departamento**. | Só aparecem departamentos com **5 respostas ou mais** (com eNPS e médias). Com 4, o departamento **não aparece**. |
| E5 | Olhe os comentários. | Aparecem **sem autor e sem data**, em ordem embaralhada (não é a ordem em que chegaram). |
| E6 | Num comentário que cita uma pessoa, clique **Ocultar**. | Ele vira "Resposta ocultada pelo RH." e sai da contagem; **Reexibir** desfaz. (Só quem altera a Retenção vê o botão. Vale também para respostas de texto das perguntas estratégicas.) |
| E7 | Volte à **Visão geral**. | O eNPS da organização passa a ser o da pesquisa mais recente com resultado liberado, e ela entra na **Evolução do eNPS** (com "antes: … " no resultado quando há pesquisa anterior). |

## F. Encerrar e plano de ação

| # | O que fazer | O que deve acontecer |
|---|---|---|
| F1 | Numa pesquisa **Aberta**, clique **Encerrar** e confirme. | Selo **Encerrada**. Ninguém mais consegue responder; o resultado continua disponível. |
| F2 | Numa pesquisa **Encerrada**, clique **Plano de ação**, escreva o que será feito e salve. | O texto aparece no cartão e no fim do resultado. Nada mais pode ser alterado. |
| F3 | Defina uma data de encerramento e espere ela passar (ou peça a alguém do suporte para antecipá-la). | No dia seguinte à data, a pesquisa **aparece como Encerrada sozinha** e deixa de aceitar respostas. |

## G. Permissões e planos

| # | O que fazer | O que deve acontecer |
|---|---|---|
| G1 | Em **Usuários e Permissões → Perfis**, procure a rotina **Pesquisa de Clima** ("Responder às pesquisas de clima abertas para você"). | Existe, com a ação **Visualizar**. Os perfis de sistema (Recrutador, Gestor, Entrevistador e Colaborador) já a têm; o Administrador tem tudo. |
| G2 | Crie um perfil **personalizado** só com **Retenção → Visualizar** e vincule um usuário. | Ele vê a Visão geral, os alertas e as pesquisas (e os resultados), mas **não vê nenhum botão de ação**. |
| G3 | Perfil **personalizado** criado antes desta versão, sem **Pesquisa de Clima**. | Essas pessoas **não recebem** a pesquisa até o administrador marcar **Pesquisa de Clima → Visualizar** no perfil. |
| G4 | Entre com **Entrevistador** ou **Colaborador** e abra **Retenção**. | Só a tela **Responder pesquisa** (não veem alertas, resultados nem "Nova pesquisa"). |
| G5 | Na **Conta Mãe**, mude uma organização para o plano **Starter**. | O item **Retenção** e a rotina **Pesquisa de Clima** somem para essa organização (ela não responde nem à API). No plano **Scale/Enterprise** voltam. |

## H. Auditoria (Conta Mãe)

| # | O que fazer | O que deve acontecer |
|---|---|---|
| H1 | Na Conta Mãe, abra **Auditoria** e filtre a categoria **Dados de pessoas**. | Estão registrados: alerta aberto, mudança de situação, alerta excluído, pesquisa publicada/encerrada e comentário ocultado/reexibido. **Nenhum registro traz o texto de uma resposta ou de um comentário.** |

## I. Templates e perguntas estratégicas por cargo

| # | O que fazer | O que deve acontecer |
|---|---|---|
| I1 | Aba **Templates**. | Nove templates do sistema (somente leitura) e a área **Da sua organização**. Quem só consulta a Retenção vê tudo, mas **sem botões** de usar, copiar ou editar. |
| I2 | **Novo template**. Dê um nome e clique **Adicionar bloco de perguntas**. | Um bloco pede título, uma explicação curta e **Quem responde**: **Todos** ou **Só alguns cargos**. Para cargos, o template marca **Nível do cargo** e **Trilha de carreira** (caixas de seleção, dados do cadastro de Cargos). **Não existe campo para digitar cargos ou palavras.** |
| I3 | Adicione perguntas de cada tipo: **Escala de 0 a 10**, **Escolha única** (uma opção por linha, de 2 a 8) e **Texto livre**. Use as setas para reordenar. | Cada pergunta tem "Resposta obrigatória". Texto livre começa como opcional. |
| I4 | Salve com um bloco **sem perguntas**, ou com uma escolha de **uma só opção**. | O sistema recusa e explica o motivo. Limites: 6 blocos, 12 perguntas por bloco e 30 no total. |
| I5 | Crie outro template com o **mesmo nome** (maiúsculas não importam). | Recusado: "Já existe um template chamado …". |
| I6 | Numa **nova pesquisa**, escolha um template no campo **Começar de um template**. | Os blocos entram na pesquisa e ficam **editáveis** até publicar. Em blocos por cargo, os **cargos cadastrados** que combinam com o nível e a trilha do template já vêm marcados; a lista é agrupada por departamento e mostra quantas pessoas estão vinculadas a cada cargo. |
| I7 | Num bloco por cargo, deixe **nenhum cargo** marcado e tente **Publicar**. | Recusado: "Escolha ao menos um cargo para o bloco …". Um bloco sem perguntas também impede a publicação. (Um template que não encontra nenhum cargo combinando **não vira "todos"**: o bloco fica sem cargos até você escolher.) |
| I8 | Marque cargos que somam **menos de 5 pessoas**. | Aparece o aviso de que o resultado desse bloco só será liberado com 5 respostas (proteção do anonimato). Se houver pessoas **sem cargo cadastrado**, aparece também um aviso dizendo que elas não verão os blocos por cargo. |
| I9 | Publique e tente alterar os blocos. | Depois de publicada, os blocos **não mudam** mais (só a data de encerramento e o plano de ação). |
| I10 | Responda como pessoas de cargos diferentes e como alguém sem cargo cadastrado. | Cada pessoa vê **só os blocos dos cargos a que está vinculada** (o cargo vem do cadastro de Cargos). Quem não tem cargo cadastrado vê só os blocos para todos. Perguntas obrigatórias travam o envio até serem respondidas. |
| I11 | **Ver resultado** com 5 ou mais respostas de um bloco. | O bloco mostra "X de Y responderam" e, por pergunta: **média** (escala), **quantidade e % por opção** (escolha) ou **respostas em texto sem autor** (texto, com **Ocultar**). |
| I12 | Olhe um bloco com menos de 5 respostas. | Só aparece "O resultado é liberado a partir de 5". Uma pergunta de texto com menos de 5 respostas também não é detalhada, mesmo que o bloco esteja liberado. |

## J. O cargo é sempre o cadastrado (nunca digitado)

| # | O que fazer | O que deve acontecer |
|---|---|---|
| J1 | Em **Usuários e Permissões**, clique **Cadastrar Usuário** (ou **Editar** numa pessoa) e olhe o campo **Cargo**. | É uma **lista**, não um campo de texto. Ela traz só os cargos **ativos** do módulo **Cargos** e a opção "— sem cargo cadastrado —". Embaixo: "Só cargos do módulo Cargos. Para incluir um novo, cadastre-o lá." |
| J2 | Escolha um cargo e salve. | A lista de usuários mostra o **título do cargo cadastrado**. |
| J3 | Olhe as pessoas que ainda não têm cargo escolhido (por exemplo, as criadas antes desta versão). | Aparece **"sem cargo cadastrado"** embaixo do cargo antigo (só o rótulo que já existia). Elas não veem blocos de pesquisa por cargo até você escolher o cargo delas. |
| J4 | No módulo **Cargos**, arquive um cargo e volte ao formulário de usuários. | O cargo arquivado **não aparece** mais na lista. |
| J5 | No módulo **Cargos**, mude o **título** de um cargo. | O cargo mostrado nas pessoas vinculadas a ele acompanha o novo título. |
| J6 | Na **Conta Mãe**, abra os usuários de uma organização. | O campo de cargo mostra "O cargo é escolhido pela própria organização, no cadastro de Cargos." A Conta Mãe não digita cargo. |

> Nas pessoas que já existiam, o sistema vincula o cargo **automaticamente** quando o texto antigo é igual ao título de **um único** cargo ativo da organização. As demais ficam para o RH escolher.

## K. Sigilo dos alertas por equipe

| # | O que fazer | O que deve acontecer |
|---|---|---|
| K1 | Em **Usuários e Permissões → Perfis**, procure **Alertas de toda a organização** ("Ver todos os alertas de risco de turnover…"). | É uma rotina própria, com a ação **Visualizar**. O **Administrador** e o perfil **Recrutador / RH** já a têm. O **Gestor da Vaga** não. Perfis personalizados só a têm se você marcar. |
| K2 | Com um perfil **sem** essa permissão, abra **Retenção → Alertas de risco**. | Aviso "Você vê só os alertas da sua equipe". A equipe de uma pessoa é: quem ela **gerencia no PDI**, os membros do departamento que ela **chefia** (Estrutura Organizacional → gestor do departamento), os alertas de que ela é **responsável** e os que ela **abriu**. |
| K3 | Como Administrador, abra um alerta de alguém fora da equipe do gestor e, com o gestor, tente mexer nele (por exemplo, por um link antigo). | O sistema responde como se o alerta **não existisse**: o gestor não consegue ver, editar, registrar ação, encerrar nem excluir. |
| K4 | Como gestor, clique **Registrar Sinal de Risco**. | A lista de pessoas traz **só a equipe dele**. Ele consegue abrir alerta para essas pessoas, e para um nome digitado (que fica visível para ele). Para uma pessoa de fora da equipe, o sistema recusa. |
| K5 | Compare a **Visão geral** do administrador e a do gestor. | O número de alertas ativos e a divisão por risco do gestor contam **só** os alertas que ele enxerga. eNPS e pesquisas continuam os da organização. |

## L. Vincular cargos em lote

| # | O que fazer | O que deve acontecer |
|---|---|---|
| L1 | Em **Usuários e Permissões**, clique **Vincular cargos em lote** (aparece para quem pode alterar usuários). | Lista as pessoas **ativas sem cargo cadastrado**, com o rótulo antigo e uma lista de cargos ativos do módulo Cargos. |
| L2 | Escolha o cargo de cada pessoa (ou deixe "manter sem cargo") e clique **Vincular N pessoas**. | Aviso "N pessoas vinculadas a cargos do cadastro" e a lista de usuários mostra os cargos. Tudo ou nada: se uma escolha for inválida, nenhuma é aplicada. |
| L3 | Não há cargos ativos cadastrados. | O modal avisa para cadastrar os cargos no módulo **Cargos** primeiro. |
| L4 | Em **Conta Mãe → Usuários da organização**. | O botão não existe: só a própria organização vincula cargos. |

## M. Cargo do PDI

| # | O que fazer | O que deve acontecer |
|---|---|---|
| M1 | **Desenvolvimento → Novo PDI** e escolha alguém da lista (ou "Cadastrar quem não está na lista"). | O campo **Cargo** é uma lista de cargos cadastrados. Para quem já tem cargo cadastrado, ele vem escolhido. Não existe campo de texto. |
| M2 | Crie um PDI sem escolher cargo. | O PDI é criado e mostra "Sem cargo cadastrado". O cargo deixou de ser obrigatório: o que não pode é ser digitado. |
| M3 | Edite um PDI e troque o cargo. | O cartão passa a mostrar o título do novo cargo. Limpar o cargo mantém o último título só como rótulo. |
| M4 | Aceite uma proposta (**Propostas**) e abra o PDI da contratação. | O PDI já vem com o **cargo cadastrado da vaga**. |

## N. Exportar, duplicar e selo no menu

| # | O que fazer | O que deve acontecer |
|---|---|---|
| N1 | **Pesquisas → Ver resultado → Exportar resultado → Planilha CSV**. | Baixa um CSV (abre no Excel) com resumo, participação, eNPS, notas, departamentos, perguntas estratégicas e respostas em texto. |
| N2 | Mesma tela → **Relatório PDF**. | Baixa o PDF com as mesmas seções. |
| N3 | Exporte uma pesquisa com **menos de 5 respostas**. | O arquivo traz só o resumo e a participação, com a nota de que o resultado é liberado a partir de 5. |
| N4 | Oculte um comentário e exporte de novo. | O comentário oculto **não** vai para o arquivo. |
| N5 | **Duplicar** uma pesquisa (rascunho, aberta ou encerrada). | Cria um novo rascunho com o mesmo público e as mesmas perguntas (e os mesmos cargos). O período vem no trimestre atual e sem data de encerramento. Nada da pesquisa original muda. |
| N6 | Com uma pesquisa aberta e uma pessoa que ainda não respondeu, olhe o menu lateral. | **Retenção** mostra o selo "1 pesquisa" (no menu recolhido, um ponto amarelo). Some assim que a pessoa responde. |

## Se algo falhar

- **A Retenção some do menu ou dá "sistema desatualizado":** o servidor precisa da versão nova e da migration aplicada. Atualize a página com Ctrl+F5.
- **O colaborador não vê a pesquisa:** confirme que o perfil dele tem **Pesquisa de Clima → Visualizar**, que ele está **ativo** e faz parte do **público** (organização inteira ou o departamento escolhido).
- **O resultado não abre:** com menos de 5 respostas isso é o esperado; peça mais respostas.
- **Não consigo publicar:** o público escolhido não tem nenhuma pessoa ativa.
