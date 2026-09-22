# Validação (visão do usuário) — Organização que não quer usar IA

Confere que, quando a Conta Mãe desliga o módulo **Avaliação por IA** de uma organização, essa organização **não vê nenhum vestígio
de IA** (menu, notas, botões, resumos, exportações e indicadores) e que tudo volta ao religar.
Tempo estimado: 10–15 minutos. Use **duas janelas**: a normal (Conta Mãe) e uma **anônima** (administrador da organização).

> **Use uma organização de demonstração** (ex.: TechCorp), nunca a de um cliente real. No fim, o passo 12 devolve tudo como estava.

## 0. Preparação
1. `npm run dev` e abra `http://localhost:3000`.
2. **Janela normal:** entre na **Conta Mãe** (campo "Organização" vazio).
3. **Janela anônima:** entre como **Administrador** da organização de demonstração (a que tem candidatos, vaga e avaliações).

---

## Parte A — Como é hoje, COM IA (para comparar)

| # | O que fazer (janela anônima) | O que deve aparecer |
|---|---|---|
| 1 | Olhe o menu lateral. | Existe **Avaliação Assistida por IA** (com a etiqueta "Gemini"). |
| 2 | Abra **Candidatos**. | Os cartões mostram a nota (**"Fit Cultural & Técnico"** ou **"Avaliação Preditiva IA: Pendente"**) e o botão **Avaliar com IA / Ver Avaliação com IA**. |
| 3 | Abra **Processo Seletivo**. | Os cartões do Kanban mostram **"Fit Preditivo IA"** (ou "Avaliação IA não realizada") e o botão **Avaliar com IA**. |
| 4 | Abra **Indicadores**. | Há **duas abas**: "Painel de Visão Geral" e **"Governança & Decisão Humana"**. |

---

## Parte B — Desligar a IA para a organização

| # | O que fazer (janela normal, Conta Mãe) | O que deve acontecer |
|---|---|---|
| 5 | Vá em **Organizações**, na linha da organização de demonstração abra o menu de ações e clique **Editar organização**. | Abre a janela "Editar organização". |
| 6 | Em **Módulos liberados para a organização**, **desmarque "Avaliação por IA"** e clique **Salvar organização**. | A janela fecha. Na lista, o número de módulos da organização diminui em 1. |

---

## Parte C — A organização deixa de ver a IA

Na **janela anônima**, atualize a página (**F5**) e confira:

| # | Onde olhar | O que deve acontecer |
|---|---|---|
| 7 | Menu lateral. | **Avaliação Assistida por IA não existe mais.** |
| 8 | **Candidatos**. | Os cartões **não têm** nota de IA, "Pendente" de IA nem botão de IA. Clique em um cartão: o resumo **não tem** o quadro "Avaliação assistida por IA". |
| 9 | **Processo Seletivo**. | Os cartões mostram só o nome e o botão **Avançar**. Clique em um cartão: o resumo **não tem** o quadro de IA. Use **Copiar resumo** e cole em um bloco de notas: **não há** nenhuma linha sobre IA. O alternador **Quadro \| Triagem de Currículos** também não existe mais (ver `docs/validacao-triagem-curriculos.md`). |
| 10 | **Indicadores**. | Há **uma única aba** (Visão Geral). No funil, a etapa 2 chama-se **"Triagem"** (antes: "Fit Cultural IA"). |
| 11 | **Exportações e busca.** Em Candidatos use **Exportar Talent Pool** (CSV e PDF). Em Indicadores use **Exportar Relatório**. Digite um nome na busca do topo. | O CSV/PDF de candidatos **não tem** as colunas de IA ("Score Fit Geral IA", "Decisão do Gestor Humano", "Fit IA"). O relatório de indicadores **não diz** "A IA apoia…". A busca **não mostra** "% Fit IA" nem o ícone de estrela. |

**Extra na Conta Mãe:** em **Uso da IA**, a organização continua na tabela, mas **sem novos consumos** (nada é enviado ao Google por ela).

---

## Parte D — Religar (deixar como estava)

| # | O que fazer | O que deve acontecer |
|---|---|---|
| 12 | Conta Mãe → **Editar organização** → marque de novo **Avaliação por IA** → **Salvar organização**. Na janela anônima, **F5**. | O menu volta a ter **Avaliação Assistida por IA**, os cartões voltam a mostrar as notas e **as avaliações antigas reaparecem** (elas nunca foram apagadas). |

---

## Bônus — Organização nova já nasce sem IA (plano Starter)
1. Na Conta Mãe: **Organizações → Criar Organização**, escolha o plano **Starter**.
2. Entre como administrador dela: o menu **não tem** Avaliação por IA, e os passos 7 a 11 valem desde o primeiro acesso.

## Se algo falhar
- **Ainda vejo IA depois de desligar:** atualize a página com **Ctrl+F5** (ou saia e entre de novo). O menu e as telas leem os módulos da organização ao entrar.
- **Perdi as avaliações ao religar:** não perdeu; confira se religou o módulo certo ("Avaliação por IA") e atualize a página.
