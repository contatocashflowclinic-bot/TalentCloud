# Passo a passo de validação (visão do usuário) — Conta Mãe com controle total

Cobre: **editar organizações, planos, status e módulos liberados**, **criar usuários e vinculá-los a organizações**, **liberar rotinas por perfil/usuário** — sempre isolando os dados de cada empresa.
Tempo estimado: 25–35 minutos. Use duas janelas: **janela 1** (normal) para a Conta Mãe e **janela 2** (anônima) para um usuário de organização.

## 0. Preparação

1. No terminal: `npm run db -- migrate` (aplica as migrations 6 e 7) e depois `npm run dev`.
2. Abra `http://localhost:3000`, **janela 1**: entre como Conta Mãe (`admin@admin.com.br` / sua senha), **sem** informar organização.
3. Tenha uma organização de teste com um administrador que consiga entrar (a `Validação Ltda` do guia anterior serve; ou crie uma em **Organizações → Criar Organização** e guarde a senha temporária). Na **janela 2**, entre como esse administrador.

---

## Parte D — Editar organização, plano, status e módulos

| # | O que fazer | O que deve acontecer |
|---|---|---|
| D1 | Janela 1 → **Organizações**. | Tabela com busca e paginação (20 por página). Cada linha mostra o plano, a quantidade de **módulos** liberados e o armazenamento. Botões: **Editar**, **Usuários**, **Senha do admin**, **Suspender/Reativar**. |
| D2 | Digite parte do nome ou o identificador na busca. | A lista filtra em instantes; limpar a busca volta a lista completa. |
| D3 | Clique **Editar** na sua organização de teste. | Abre o formulário com razão social, nome fantasia, CNPJ, e-mail de contato, logo, **plano**, **status** e a lista de **módulos liberados**. O identificador aparece como "não editável". |
| D4 | Mude o **plano** para *Starter* e clique **Padrão do plano Starter**. | Ficam desmarcados: Avaliação por IA, Desenvolvimento, Retenção e Indicadores. **Usuários e Permissões** aparece com cadeado e **não pode ser desmarcado**. |
| D5 | Altere o *Nome fantasia* e **Salvar organização**. | Volta para a lista; a linha mostra **11 módulos** e o plano Starter. |
| D6 | **Janela 2** (administrador da organização): troque de aba do navegador e volte (ou recarregue). | O menu lateral **perde** Avaliação IA, Desenvolvimento, Retenção e Indicadores. Continuam Usuários, DNA, Vagas, Candidatos etc. |
| D7 | Na janela 2 → **Usuários e Permissões → Perfis de acesso → Novo perfil**. | Na matriz, as linhas dos módulos bloqueados aparecem **desabilitadas** (cinza): o administrador da empresa não consegue liberar o que o contrato não inclui. |
| D8 | Janela 1 → **Editar** → **Padrão do plano Scale** → Salvar. | Janela 2, ao voltar o foco: os módulos **reaparecem** no menu. |
| D9 | Janela 1 → **Editar** → status **Suspenso** → Salvar. | A linha fica vermelha. Janela 2: qualquer ação passa a ser recusada e um novo login informa "Organização suspensa". |
| D10 | Janela 1 → **Editar** → status **Ativo** → Salvar. | A janela 2 volta a funcionar. |

**Se falhar:** o menu da janela 2 não mudou → clique em outra aba e volte (a tela atualiza permissões ao voltar o foco) ou recarregue; a API já bloqueia na hora.

---

## Parte E — Usuários e acessos de uma organização (visão Conta Mãe)

| # | O que fazer | O que deve acontecer |
|---|---|---|
| E1 | Organizações → botão **Usuários** na sua organização. | Abre "Usuários e acessos — {organização}" com as abas **Usuários** e **Perfis de acesso** (mesmas telas que o administrador da empresa vê). |
| E2 | **Vincular Usuário**: nome `Beto Teste`, e-mail `beto.teste@exemplo.com`, perfil *Recrutador*. | Aparece a **senha temporária (única vez)**. Copie. |
| E3 | Clique **Acesso** em Beto → **Personalizar permissões** → marque *Indicadores: Visualizar* (se o módulo estiver liberado). | A célula fica destacada em amarelo; ícone de "sliders" na linha do Beto. Módulos **não liberados** para a organização ficam desabilitados. |
| E4 | Janela 2 (anônima nova) → entre como Beto e troque a senha. | Beto vê os módulos do perfil Recrutador (+ a exceção), **dentro da organização dele**. |
| E5 | Aba **Perfis de acesso** → **Novo perfil** `Somente DNA` (só DNA: Visualizar) → depois altere o perfil do Beto para ele. | Beto, ao voltar o foco, passa a ver **só o DNA**. |
| E6 | **Senha** na linha do Beto. | Nova senha temporária (única vez); a sessão do Beto cai. |
| E7 | **Desativar** o Beto. | Status Inativo; o login dele é recusado nessa organização. **Reativar** devolve o acesso. |

---

## Parte F — Usuários da plataforma (uma pessoa, várias organizações)

| # | O que fazer | O que deve acontecer |
|---|---|---|
| F1 | Menu lateral → **Usuários**. | Lista de pessoas (mais recentes primeiro) com **chips "Organização · Perfil"**, status e último acesso. Busca por início do nome ou e-mail. |
| F2 | **Novo usuário**: nome `Carla Global`, e-mail `carla.global@exemplo.com`, **sem** escolher organização. | Criada com senha temporária (única vez). Na lista aparece "Sem vínculo". Se ela tentar entrar agora: "conta ainda não foi vinculada a nenhuma organização". |
| F3 | Clique **Vincular** na Carla → busque a organização de teste → escolha o perfil *Colaborador* → **Vincular**. | Mensagem verde "vinculado (a senha atual foi mantida)"; o chip aparece na linha dela. |
| F4 | Crie uma **segunda organização** (Organizações → Criar) e **Vincular** a Carla também a ela, com outro perfil. | A Carla mostra **dois chips**. |
| F5 | Clique num chip da Carla. | Abre "Usuários e acessos" **daquela organização** já filtrado na Carla, para trocar perfil/exceções. |
| F6 | Tente **Novo usuário** repetindo o e-mail `carla.global@exemplo.com`. | Erro: já existe usuário com esse e-mail (a senha nunca é sobrescrita). |
| F7 | **Novo usuário** com organização e perfil escolhidos já na criação (`diego.global@exemplo.com`). | Criado já vinculado; aparece **somente** nessa organização. |
| F8 | Carla entra (janela 2) → menu com as duas organizações no cabeçalho → troca entre elas. | Cada organização mostra apenas os dados e permissões dela. |
| F9 | Conta Mãe → **Senha** na Carla. | A nova senha vale para **todas** as organizações dela e derruba as sessões. |
| F10 | **Desativar** a Carla (plataforma inteira). | Login recusado em **qualquer** organização; **Reativar** restaura. |

---

## Parte G — Auditoria, isolamento e desempenho

| # | O que fazer | O que deve acontecer |
|---|---|---|
| G1 | **Auditoria** → filtro *Segurança / Governança* e busca por `Editada` ou o nome da organização. | Aparecem eventos como **TENANT_UPDATED** (com "plano Scale → Starter" e "módulos bloqueados: ..."), **USER_CREATED**, **USER_LINKED**, **USER_ACCESS_UPDATED**, **PASSWORD_RESET_ISSUED**. |
| G2 | Role até o fim e clique **Carregar mais** (se houver). | Mais eventos são adicionados sem recarregar tudo. |
| G3 | Conta Mãe: procure por qualquer tela com candidatos, vagas ou dados de negócio. | **Não existe** — a Conta Mãe só vê organizações, pessoas, perfis, permissões e auditoria. |
| G4 | Numa organização (janela 2), abra **Usuários**. | Lista só as pessoas **daquela** organização; pessoas vinculadas apenas a outra empresa não aparecem. |
| G5 | Observe a fluidez: buscas, troca de páginas e abertura de modais. | Respostas rápidas mesmo com muitas linhas: as listas são paginadas (20–25 por página) e buscadas no servidor; nada carrega "tudo de uma vez". |

---

## Limpeza (opcional)

`delete from tenants where slug in ('validacao', ...);` e `delete from app_users where email like '%@exemplo.com';` no SQL do Supabase (ou peça a limpeza).
