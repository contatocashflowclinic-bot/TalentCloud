# Passo a passo de validação (visão do usuário) — Retenção de Talentos & Clima

**Preparação:** aplique a migration nova (`20260921000020_retention.sql`, com `npm run db -- migrate`) e rode `npm run dev`. Entre em uma organização dos planos **Scale** ou **Enterprise** (a Retenção não existe no Starter) com um usuário **Administrador**. Para as partes de pesquisa você precisa de **pelo menos 5 pessoas ativas** na organização (crie usuários em **Usuários e Permissões** se preciso; o perfil **Colaborador** basta). Repita a parte D no celular.

O módulo tem quatro abas: **Visão geral**, **Alertas de risco**, **Pesquisas** e **Responder pesquisa**. Quem gerencia vê as três primeiras; qualquer colaborador vê só a última.

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
| E6 | Num comentário que cita uma pessoa, clique **Ocultar**. | Ele vira "Comentário oculto pelo RH." e sai da contagem; **Reexibir** desfaz. (Só quem altera a Retenção vê o botão.) |
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

## Se algo falhar

- **A Retenção some do menu ou dá "sistema desatualizado":** o servidor precisa da versão nova e da migration aplicada. Atualize a página com Ctrl+F5.
- **O colaborador não vê a pesquisa:** confirme que o perfil dele tem **Pesquisa de Clima → Visualizar**, que ele está **ativo** e faz parte do **público** (organização inteira ou o departamento escolhido).
- **O resultado não abre:** com menos de 5 respostas isso é o esperado; peça mais respostas.
- **Não consigo publicar:** o público escolhido não tem nenhuma pessoa ativa.
