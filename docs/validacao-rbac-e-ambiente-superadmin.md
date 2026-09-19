# Passo a passo de validação (visão do usuário)

Cobre: **ambiente SuperAdmin (Conta Mãe)**, **usuários por organização** e **permissões por rotina (RBAC)**.
Tempo estimado: 20–30 minutos. Use duas janelas do navegador (uma normal e uma anônima) para ver dois usuários ao mesmo tempo.

## 0. Preparação

1. No terminal do projeto: `npm run db -- migrate` (aplica as migrations 4 e 5; se disser "Nenhuma migration pendente", já está aplicado) e depois `npm run dev`.
2. Abra `http://localhost:3000`.
3. Credencial da Conta Mãe: `admin@admin.com.br` / `Admin@123` (se você já trocou a senha, use a nova).

> Todos precisam entrar de novo depois da migration (as sessões antigas foram encerradas).

---

## Parte A — Ambiente da Conta Mãe (SuperAdmin)

| # | O que fazer | O que deve acontecer |
|---|---|---|
| A1 | Na tela de login, informe o e-mail e a senha da Conta Mãe. **Deixe "Organização" vazio.** Clique em **Entrar**. | Abre um ambiente **escuro no topo, com o selo "Conta Mãe"** (âmbar). Se a senha ainda for a padrão, aparece um aviso amarelo "Alterar agora". |
| A2 | Olhe o menu lateral. | Só existem **3 itens: Visão geral, Organizações, Auditoria**. **Não** aparecem os módulos de recrutamento (Usuários, DNA, Vagas, Candidatos…), nem seletor de empresa, nem "Portal de Vagas", nem busca de candidatos. |
| A3 | Clique em **Visão geral**. | 4 cartões (organizações, isolamento, armazenamento, latência), a tabela "Saúde por organização" e os últimos 5 eventos de auditoria. |
| A4 | Clique em **Organizações → Criar Organização**. Preencha: Nome `Validação Ltda`, identificador `validacao`, e-mail de contato e do administrador `admin.validacao@exemplo.com`. Salve. | Aparece "Organização criada" com **senha temporária exibida uma única vez**. Copie-a (botão **Copiar acesso**). Ao clicar **Concluir**, você **continua na lista de organizações** (não entra nos dados da empresa). |
| A5 | Na linha da nova organização, clique **Suspender** e confirme. Depois **Reativar**. | O status muda para Suspenso (vermelho) e volta para Ativo (verde). |
| A6 | Clique em **Senha do admin** e confirme. | Aparece uma nova senha temporária (única vez). **Guarde a última gerada** para a parte B. |
| A7 | Vá em **Auditoria**. Filtre por categoria "Segurança / Governança" e busque `validacao`. | Aparecem eventos como criação da organização, mudança de status e reset de senha, com data/hora de São Paulo. |
| A8 | Menu do usuário (canto superior direito) → **Alterar senha** e **Sair**. | A janela de troca de senha abre; **Sair** volta ao login. |

**Se falhar:** apareceu menu de recrutamento na Conta Mãe → limpe o cache (Ctrl+F5) e confirme que `npm run dev` foi reiniciado após esta versão.

---

## Parte B — Administrador da organização

Faça na **janela 1** (normal).

| # | O que fazer | O que deve acontecer |
|---|---|---|
| B1 | Login com `admin.validacao@exemplo.com` e a senha temporária da A6. Organização: vazio (ou `validacao`). | Vai direto para a **troca obrigatória de senha**. Defina uma senha com letras e números (ex.: `Validacao#2026`). |
| B2 | Observe o menu e o cabeçalho. | Aparecem os módulos **2 a 15** e o cabeçalho mostra "Empresa Ativa: Validação Ltda". Nada de Conta Mãe. |
| B3 | Abra **2. Usuários e Permissões**. | Duas abas: **Usuários** (só você) e **Perfis de acesso**. |
| B4 | Aba **Perfis de acesso**. | 5 perfis padrão (Administrador, Recrutador, Gestor da Vaga, Entrevistador, Colaborador). Administrador mostra "Todas as permissões" e ao abrir fica **somente leitura**. |
| B5 | **Novo perfil**: nome `Só Vagas`, na linha **Vagas** marque **Incluir**. | **Visualizar** é marcado automaticamente. Salve: o perfil aparece na lista. |
| B6 | Tente criar outro perfil chamado `só vagas`. | Erro "Já existe um perfil com este nome". |
| B7 | Aba **Usuários → Vincular Usuário**: nome `Ana Vagas`, e-mail `ana.vagas@exemplo.com`, perfil **Só Vagas**. | Aparece a senha temporária dela (única vez). Copie. |
| B8 | Na **janela anônima (2)**, entre como `ana.vagas@exemplo.com` com a senha temporária e defina uma nova (ex.: `AnaVagas#2026`). | O menu de Ana mostra **apenas "6. Vagas"** (e o Portal de Vagas). Nenhum outro módulo. |
| B9 | Na janela 1, edite o perfil **Só Vagas** e marque **Visualizar** em *DNA Organizacional*. Salve. | Salvo sem erro. |
| B10 | Volte à janela 2 (Ana) e **clique em outra aba do navegador e volte** (ou recarregue). | O menu de Ana passa a mostrar também **3. DNA Organizacional**, **sem novo login**. |
| B11 | Janela 1: em **Usuários**, clique **Acesso** em Ana → marque **Personalizar permissões** → marque **Candidatos: Visualizar** → Salvar. | A linha de Ana ganha um ícone de "sliders" (exceção individual). Na janela 2, após voltar o foco, aparece **7. Candidatos**. As células diferentes do perfil ficam destacadas em amarelo no editor. |
| B12 | Janela 1: **Acesso** em Ana → troque o perfil para **Colaborador** → Salvar. | As exceções somem (a exceção é zerada ao trocar de perfil); Ana volta a ver só DNA, Estrutura, Cargos e Vagas. |
| B13 | Vincule um usuário com perfil **Entrevistador** (ex.: `livia.entrev@exemplo.com`) e entre com ele na janela 2. | Vê **Candidatos** e **Entrevistas**; **não** vê "Processo Seletivo" nem "Avaliação IA". Abrir Candidatos funciona normalmente. |
| B14 | Janela 1: **Desativar** Ana e confirme. | Status vira Inativo. Na janela 2 (usuária desativada) a próxima ação **derruba a sessão** e um novo login é recusado ("Usuário desativado"). **Reativar** devolve o acesso. |
| B15 | Na sua própria linha, veja a coluna Ações. | Mostra "Você" (não dá para editar o próprio acesso). |
| B16 | Tente **Redefinir senha** de um usuário e depois **Vincular** outro com perfil **Administrador**. | Reset funciona e mostra senha temporária. Vincular Administrador funciona porque você é administrador. |

**Regras de segurança para conferir (opcional):**
- Crie um perfil "Gestor de Acesso" com só *Usuários: incluir/alterar* e *Perfis: incluir*. Entre com um usuário desse perfil: ele **não consegue** vincular alguém como Administrador, nem criar perfil com permissões que ele mesmo não tem, nem editar/redefinir a senha de um Administrador.
- Com um único Administrador ativo, ninguém consegue desativá-lo (a organização precisa de ao menos um).

---

## Parte C — Uma pessoa em várias organizações

| # | O que fazer | O que deve acontecer |
|---|---|---|
| C1 | Conta Mãe: crie uma segunda organização `Validação Dois` (identificador `validacao2`, admin `admin.dois@exemplo.com`). | Criada com senha temporária. |
| C2 | Entre como admin da `validacao2` (troque a senha) → **Usuários → Cadastrar Usuário** com o e-mail `ana.vagas@exemplo.com` (que já existe em outra organização). | **Recusado**: "Este e-mail não pode ser cadastrado por aqui... solicite à Conta Mãe". Nada é criado. O texto do formulário já avisa que o e-mail precisa ser novo na plataforma. |
| C3 | Como admin da `validacao2`, cadastre um e-mail **novo** (ex.: `novo.dois@exemplo.com`). | Funciona normalmente, com senha temporária (única vez). |
| C3b | **Conta Mãe** → menu **Usuários** → na linha da Ana clique **Vincular** → escolha `Validação Dois` e o perfil **Colaborador**. (Ou: Organizações → ⋯ → Usuários e acessos → **Vincular Usuário** com o e-mail da Ana.) | Mensagem verde "vinculado (a senha atual foi mantida)". **Só a Conta Mãe** faz esse vínculo. |
| C3c | Como admin da `validacao2`, tente **Senha** na linha da Ana. | Recusado: usuário vinculado a outras organizações (a senha é da pessoa). |
| C4 | Na janela 2, saia e entre como Ana (sem informar organização). | Entra na organização usada por último e o **nome da empresa no cabeçalho vira um menu** com as duas organizações. |
| C5 | Clique no menu e escolha a outra organização. | A tela recarrega **na outra empresa, sem pedir login**, já com o perfil dela lá (menus diferentes). |
| C6 | (Opcional) Desative Ana só na `validacao2`. | Ela continua entrando na `validacao`; na `validacao2` o acesso é recusado. |

---

## Limpeza (opcional)

Para remover os dados de teste, peça a limpeza ou, no SQL do Supabase:
`delete from tenants where slug in ('validacao','validacao2'); delete from app_users where email like '%@exemplo.com';`
