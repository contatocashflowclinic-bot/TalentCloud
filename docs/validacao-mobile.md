# Passo a passo de validação (visão do usuário) — Uso em celular e tablet

Cobre todas as telas: login, ambiente da organização (todos os módulos do menu, de *Usuários e Permissões* a *Indicadores*), Conta Mãe e portal público de vagas.
Tempo estimado: 15–20 minutos.

## 0. Preparação

1. `npm run dev` no computador e anote o endereço da rede local (ex.: `http://192.168.0.10:3000`). Celular e computador na mesma rede Wi-Fi. Se preferir, use o **modo dispositivo** do navegador (F12 → ícone de celular) com **iPhone SE (375 px)**, **iPhone 14 (390 px)** e **iPad (768 px)**.
2. Tenha à mão: um administrador de organização e a Conta Mãe (`admin@admin.com.br`).

**Critérios gerais (valem para toda tela):**
- A página **nunca rola para o lado**. Só tabelas largas rolam horizontalmente **dentro** do cartão.
- Nenhum texto ou botão fica cortado ou sobreposto.
- Botões e itens de menu são fáceis de tocar com o dedo.
- Ao tocar num campo de texto, a tela **não dá zoom** sozinha.

---

## Parte A — Organização (administrador)

| # | O que fazer | O que deve acontecer |
|---|---|---|
| A1 | Abra o sistema no celular e faça login. | O formulário cabe na tela, campos com fonte legível. |
| A2 | Observe o topo. | Uma barra compacta: **botão de menu (☰)**, logo, nome da empresa e ícone do usuário. A **busca de candidatos** aparece numa linha própria, ocupando a largura toda. |
| A3 | Toque no **☰**. | Um **menu lateral desliza** por cima da tela (largura ~85%), com todos os módulos que você pode usar. O fundo escurece. |
| A4 | Toque num módulo (ex.: *Candidatos*). | O menu **fecha sozinho** e o módulo abre. Tocar na área escura também fecha o menu; o **X** também. |
| A5 | Percorra **todos os módulos do menu** (de *Usuários e Permissões* a *Indicadores*), um a um. | Cada um cabe na largura. Cartões empilham em uma coluna; tabelas rolam para o lado dentro do cartão; colunas secundárias (cargo, último acesso) ficam ocultas no celular. |
| A6 | Módulo **Processo Seletivo**. | As colunas do quadro (Kanban) rolam **para o lado** dentro da área do quadro, não a página inteira. |
| A7 | Módulo **Usuários e Permissões** → **Vincular Usuário**. | O formulário abre em **uma coluna**, rola dentro da janela; os botões **Cancelar/Vincular** ficam alcançáveis. |
| A8 | Aba **Perfis de acesso → Novo perfil**. | A matriz de permissões rola para o lado dentro da janela; nome e descrição em uma coluna. |
| A9 | Toque no nome da empresa (se você tiver mais de uma organização). | O menu de organizações abre **sem sair da tela**. |
| A10 | Toque no ícone do usuário. | Menu com **Alterar senha** e **Sair** dentro da tela. |
| A11 | Gire o aparelho (paisagem) e volte. | O layout se ajusta nas duas posições. |
| A12 | No **iPad / tablet (768 px)**: repita o topo e 2 ou 3 módulos. | Menu continua como gaveta (☰); conteúdo usa a largura sem sobras. Em telas **≥ 1024 px** o menu lateral fixo volta. |

## Parte B — Conta Mãe

| # | O que fazer | O que deve acontecer |
|---|---|---|
| B1 | Entre como Conta Mãe no celular. | Topo escuro com selo **Conta Mãe**; o menu vira uma **coluna de ícones** à esquerda (Visão geral, Organizações, Usuários, Auditoria). |
| B2 | **Organizações**. | Busca e botões cabem; a tabela rola para o lado no cartão. |
| B3 | **Editar** uma organização. | Janela em uma coluna, com rolagem; a lista de **módulos** em uma coluna; botões de salvar visíveis ao rolar. |
| B4 | **Usuários** (botão da linha) e o menu **Usuários** da plataforma. | Janelas usáveis; busca, paginação e chips "Organização · Perfil" quebram linha sem cortar. |
| B5 | **Auditoria**. | Filtros empilham; eventos legíveis em cartões. |

## Parte C — Portal público de vagas

| # | O que fazer | O que deve acontecer |
|---|---|---|
| C1 | Abra `/?view=careers&tenant=<identificador>` no celular. | Página escura com o cabeçalho da empresa, cartões em uma coluna. |
| C2 | Abra uma vaga e o formulário de candidatura. | Campos em uma coluna, rolagem suave, botão de enviar alcançável. |
| C3 | Toque em **Compartilhar**. | Opções em grade de 2 colunas, sem cortes. |

**Se algo falhar:** anote a tela, o aparelho/tamanho e mande uma captura. Se o menu lateral não abrir, atualize a página (Ctrl+F5) para pegar a versão nova.
