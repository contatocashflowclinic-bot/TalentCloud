# Passo a passo de validação (visão do usuário) — Desenvolvimento Contínuo & PDI

**Preparação:** `npm run dev` e entre em uma organização com um usuário **Administrador**, **Recrutador / RH** ou **Gestor da Vaga** (todos podem alterar PDI). Abra **Desenvolvimento** no menu lateral. Não há migration nova: o módulo usa a tabela que já existia. Repita a parte G no celular.

## A. Consultar o PDI

| # | O que fazer | O que deve acontecer |
|---|---|---|
| A1 | Abra **Desenvolvimento**. | Título "Desenvolvimento Contínuo & PDI", um seletor de colaborador e o botão **Novo PDI**. Abaixo, um cartão com o nome, cargo, departamento e: **Gestor, Admissão, Último 1:1, Próximo 1:1** e **Progresso do PDI**. |
| A2 | Olhe o **Próximo 1:1** e os **Prazos** das metas. | Uma data que já passou aparece **em vermelho** com "· atrasado" (1:1) ou "· vencido" (meta). Quando o próximo 1:1 está na Agenda, aparece com o **horário** (ex.: "23/09/2026 às 14:30"). |
| A3 | Troque o colaborador no seletor. | O cartão, as metas e o histórico de 1:1s trocam para o da pessoa escolhida. |

## B. Criar um PDI

| # | O que fazer | O que deve acontecer |
|---|---|---|
| B1 | Clique em **Novo PDI**. | Abre "Para quem é o plano de desenvolvimento?" com uma lista de pessoas: contratações em onboarding (selo **Contratação**) e usuários da organização (selo **Usuário da organização**). **Quem já tem PDI não aparece.** Há busca por nome/cargo. |
| B2 | Escolha alguém da lista. | Abre o formulário **já preenchido** (nome, cargo, departamento e, para contratações, a data de admissão). |
| B3 | Complete o que faltar (para usuários da organização, a **Data de admissão**; se quiser, **Gestor** e **Próximo 1:1**) e clique **Criar PDI**. | O PDI é criado e já fica selecionado, vazio: "Nenhuma meta neste PDI ainda", "Nenhum 1:1 registrado", **Progresso: Sem metas**, **Último 1:1: Nenhum ainda**, **Próximo 1:1: Não agendado**. |
| B4 | **Novo PDI → Cadastrar quem não está na lista.** Preencha nome, cargo e admissão. | Cria o PDI de alguém que não está no sistema (ex.: colaborador antigo). |
| B5 | Clique em **Criar PDI** com o nome ou a data de admissão em branco. | O navegador pede o campo obrigatório; nada é criado. |
| B6 | **Contratação automática:** em **Proposta**, marque uma proposta como **Aceita** (ou use uma já aceita). Volte para **Desenvolvimento**. | O candidato contratado já tem um **PDI vazio**, com cargo, departamento, gestor da vaga e a data de início como admissão. Aceitar de novo **não** cria um segundo PDI. |

## C. Metas do PDI

| # | O que fazer | O que deve acontecer |
|---|---|---|
| C1 | Em **Metas do PDI**, clique **Adicionar Meta**. Informe a meta (ex.: `Certificação Cloud Professional`), competência (`Arquitetura`), prazo e, se quiser, "Como será medido". Salve. | A meta aparece como **NÃO INICIADA**, **0%**. O prazo já vem preenchido com **hoje + 90 dias**. Sem competência, fica "Geral". |
| C2 | Clique **Atualizar progresso**. Arraste a barra (ou digite `40`) e escreva uma observação. Salve. | A meta vira **EM ANDAMENTO**, mostra **40%** e a barra avança. Aparece **Histórico (1)**. |
| C3 | Clique em **Histórico (1)**. | Mostra data e hora, **quem** atualizou, "40% — Em andamento" e a observação. |
| C4 | Atualize de novo para **100%**. | A meta vira **ATINGIDA** (verde), com "Atingida em <data>". O **Progresso do PDI** do cartão sobe. |
| C5 | Numa meta atingida, clique **Reabrir** e salve com 80%. | Volta para **EM ANDAMENTO**, 80%, sem a data de conclusão. |
| C6 | Numa meta em andamento, clique **Cancelar meta** e confirme. | A meta fica **CANCELADA** (riscada, mais clara), **mantém o progresso e o histórico** e sai da média do PDI. **Reabrir** volta a atualizá-la. |
| C7 | Crie outra meta e, **antes de mexer nela**, clique **Excluir** e confirme. | A meta some. (Uma meta que já teve andamento **não** tem "Excluir": só **Cancelar meta**, para não perder o histórico.) |
| C8 | Clique **Editar** numa meta e mude o título ou o prazo. | Os dados mudam; o progresso e o histórico continuam. |

## D. 1:1s

| # | O que fazer | O que deve acontecer |
|---|---|---|
| D1 | Em **Histórico de 1:1s**, clique **Registrar 1:1**. A data vem com **hoje**. Escreva os pontos conversados, uma ação por linha e um **Próximo 1:1** futuro (o **Horário** já vem com 09:00; mude se quiser). Salve. | O 1:1 aparece no topo do histórico, com as ações em lista e "Registrado por <você>". No cartão: **Último 1:1 = a data registrada** e **Próximo 1:1 = a data e o horário combinados**. (O compromisso na Agenda está na parte H.) |
| D2 | Registre um 1:1 com data **no futuro**. | O formulário **recusa** com "A data do 1:1 não pode estar no futuro…" e continua aberto. |
| D3 | Registre um 1:1 sem os pontos conversados. | O navegador pede o campo obrigatório. |
| D4 | Escolha um colaborador cujo **Próximo 1:1** já passou (ex.: **Beatriz Vasconcelos**, marcado em vermelho como atrasado) e registre um 1:1 com a data de **hoje**. | O "Próximo 1:1" atrasado (agora cumprido) **some**: volta a **Não agendado**, e o **Último 1:1** passa a ser hoje. |
| D5 | Clique no lápis de um 1:1, corrija o texto e salve. | O texto muda; a ordem e o "Registrado por" continuam. |
| D6 | Clique na lixeira de um 1:1 e confirme. | O 1:1 sai do histórico e o **Último 1:1** do cartão é recalculado (ou volta a "Nenhum ainda"). |

## E. Dados do colaborador

| # | O que fazer | O que deve acontecer |
|---|---|---|
| E1 | Clique **Editar dados**, mude o cargo, o gestor e o **Próximo 1:1** (data e horário) e salve. | O cartão mostra os novos dados. Esvaziar a data do **Próximo 1:1** volta a "Não agendado". |
| E2 | Num PDI **sem nenhuma meta e sem nenhum 1:1**, clique **Excluir PDI** e confirme. | O PDI é excluído. (Se já tem meta ou 1:1, o botão **não aparece**.) |

## F. Permissões e organizações

| # | O que fazer | O que deve acontecer |
|---|---|---|
| F1 | Em **Usuários e Permissões**, crie um perfil só com **Desenvolvimento → Visualizar**, vincule um usuário e entre com ele. | Ele **vê** os PDIs (com gestor e departamento), mas **não vê** nenhum botão de ação (Novo PDI, Adicionar Meta, Registrar 1:1, Editar, Atualizar progresso). |
| F2 | Entre com um usuário **Entrevistador** ou **Colaborador**. | O item **Desenvolvimento** nem aparece no menu. |
| F3 | Numa segunda organização, abra **Desenvolvimento**. | Ela **não vê** nenhum PDI da primeira. |

## G. Celular

| # | O que fazer | O que deve acontecer |
|---|---|---|
| G1 | Abra **Desenvolvimento** com a tela estreita (ou no celular). | Sem rolagem para os lados: o cartão vira duas colunas, as metas ficam empilhadas e os botões quebram de linha. Os formulários cabem na tela. |

## H. Próximo 1:1 na Agenda Corporativa

Use um colaborador com gestor definido (ex.: **Beatriz Vasconcelos**) e tenha o menu **Agenda Corporativa** à mão.

| # | O que fazer | O que deve acontecer |
|---|---|---|
| H1 | Em **Registrar 1:1** (ou **Editar dados**), informe um **Próximo 1:1** para os próximos dias, com horário `14:30`, e salve. | O cartão mostra "<data> às 14:30". |
| H2 | Abra **Agenda Corporativa** e procure a data. | Existe uma **reunião "1:1 — <nome>"**, das 14:30 às 15:00, com o gestor entre os participantes. Ao abrir: a **pauta** já vem com "Revisar o andamento das metas do PDI", uma linha "Meta: … (x%)" para cada meta em aberto e "Retomar: …" para as ações do último 1:1. |
| H3 | Volte em **Desenvolvimento → Editar dados** e mude só o **horário** para 15:00. | O compromisso na Agenda passa para 15:00–15:30 (é o **mesmo** compromisso, não cria outro). |
| H4 | Mude só a **data** do Próximo 1:1. | O compromisso muda de dia e **mantém o horário**. |
| H5 | Na **Agenda**, abra o compromisso (quem o criou), mude o dia e salve. Volte em **Desenvolvimento**. | O **Próximo 1:1** do cartão acompanha o novo dia. |
| H6 | Na **Agenda**, mude o **Status** do compromisso para **Cancelado** e salve. Volte em **Desenvolvimento**. | O **Próximo 1:1** volta a **Não agendado**. Excluir o compromisso na Agenda tem o mesmo efeito. |
| H7 | Em **Editar dados**, esvazie a data do **Próximo 1:1** e salve. | O compromisso **pendente** some da Agenda. |
| H8 | Agende um Próximo 1:1 para **hoje**, depois **registre um 1:1** com a data de hoje e informe um novo Próximo 1:1 futuro. (Um 1:1 só pode ser registrado com data de hoje ou passada.) | O compromisso antigo fica **Concluído** na Agenda, com o texto do 1:1 no **resumo**, e nasce **outro** compromisso para a nova data. |
| H9 | Edite qualquer outra coisa de um PDI que tenha um Próximo 1:1 **antigo** (ex.: Beatriz, "02/04/2026 · atrasado") — adicione uma meta, por exemplo. | **Nenhum** compromisso é criado na Agenda: só uma data nova ou remarcada cria compromisso. |
| H10 | Renomeie o colaborador ou troque o gestor de um PDI com compromisso pendente. | O título do compromisso acompanha o novo nome; o gestor novo é convidado e o antigo sai. |
| H11 | Exclua um PDI vazio que tenha um Próximo 1:1 agendado. | O compromisso pendente dele some da Agenda. |

## Se algo falhar

- **Mensagem "sistema desatualizado" ao salvar:** o servidor está numa versão antiga. Reinicie o `npm run dev` (ou atualize a página com Ctrl+F5 em produção).
- **O botão de ação não aparece:** o perfil do usuário não tem **Desenvolvimento → Alterar**. Ajuste em **Usuários e Permissões → Perfis**.
- **"Este colaborador já tem um PDI":** já existe um PDI para essa pessoa; selecione-o no seletor do topo.
- Em qualquer outro erro, anote a mensagem exibida no formulário (ela vem do servidor) e a data/hora.
