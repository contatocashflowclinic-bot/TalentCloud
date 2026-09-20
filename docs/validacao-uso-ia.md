# Passo a passo de validação (visão do usuário) — Painel "Uso da IA" (Conta Mãe)

Cobre o novo painel de **controle de créditos e consumo da IA**: quanto está custando, quem usa, limites por organização,
teto de gasto do mês, pausa de emergência e dicas para gastar menos.
Tempo estimado: 25–30 minutos. Use **duas janelas** do navegador: a normal (Conta Mãe) e uma **anônima** (administrador de uma organização).

## 0. Preparação

1. No terminal do projeto: `npm run db -- migrate`. Deve aplicar as migrations `20260920000018_ai_evaluation_source` e
   `20260920000019_ai_usage_control` (se disser "Nenhuma migration pendente", já estão aplicadas). **Faça antes de subir esta versão.**
2. `npm run dev` e abra `http://localhost:3000`.
3. **Janela normal:** entre na **Conta Mãe** (e-mail e senha do SuperAdmin, campo "Organização" vazio).
4. **Janela anônima:** entre como **Administrador** de uma organização que tenha ao menos **1 vaga e 3 candidatos** (as de demonstração têm).
5. Para ver a IA de verdade, o `.env.local` precisa ter `GEMINI_API_KEY` (já está configurada neste ambiente). Sem a chave tudo funciona, mas
   as avaliações saem como "estimativa local" e não geram custo.

> O consumo só é registrado **a partir desta versão**: avaliações feitas antes não aparecem no painel.

---

## Parte A — Conhecer o painel

| # | O que fazer | O que deve acontecer |
|---|---|---|
| A1 | Na Conta Mãe, clique em **Uso da IA** no menu lateral (ícone de estrela). | Abre o painel. Título "Uso da IA" e, no topo à direita, os botões **Este mês / Mês passado / Últimos 30 dias** e o de atualizar. |
| A2 | Olhe a faixa logo abaixo do título. | Mostra: **IA: Ligada** (com botão "Pausar IA"), **Conexão com o Google: Configurada**, o **Modelo de IA em uso** e a **Última resposta da IA**. |
| A3 | Olhe os cinco cartões. | **Gasto estimado**, **Avaliações feitas com IA**, **Previsão para o fim do mês**, **Teto do mês** ("Sem teto" no início) e **Pedidos sem usar a IA**. Tudo em português simples, sem termos técnicos. |
| A4 | Role a tela. | Depois dos cartões: **gráfico por dia**, **"O que chama atenção"** (alertas e dicas), **Consumo por organização**, **Regras de controle** e **Dicas para reduzir o gasto com IA**. No rodapé, o aviso de que os valores em R$ são **estimativas** e a cobrança oficial é a do Google. |

---

## Parte B — O consumo aparece no painel

| # | O que fazer | O que deve acontecer |
|---|---|---|
| B1 | Na **janela anônima** (organização), abra **Avaliação Assistida por IA** e execute a avaliação para **3 candidatos diferentes** na mesma vaga. | Cada avaliação aparece normalmente. Com a chave configurada, mostram "Origem: Modelo de IA (Gemini)". |
| B2 | Volte à Conta Mãe → **Uso da IA** → botão de atualizar. | **Avaliações feitas com IA** sobe (3 ou mais). **Gasto estimado** deixa de ser R$ 0,00 (são centavos: ex. "R$ 0,08"). O cartão de avaliações mostra "R$ 0,0xxx cada · R$ xx,xx a cada 1.000". |
| B3 | Olhe o gráfico. | Aparece uma barra no **dia de hoje**, com "Dia de maior gasto: hoje — 3 avaliações · R$ …". |
| B4 | Olhe a tabela **Consumo por organização**. | A organização usada aparece no topo, com o número de avaliações, o gasto e a **barra "Parte do gasto"**. |
| B5 | Olhe a faixa do topo. | **Última resposta da IA** mostra a data e hora de agora (horário de São Paulo). |
| B6 | Clique em **Mês passado**. | Como não havia uso, o gráfico diz "Nenhuma avaliação com IA neste período" e os números ficam zerados. Volte para **Este mês**. |

---

## Parte C — Alertas que ajudam a reduzir o gasto

| # | O que fazer | O que deve acontecer |
|---|---|---|
| C1 | Na janela anônima, na **mesma** avaliação de um candidato, clique **Re-analisar com IA** (uma ou duas vezes). | A avaliação é refeita. |
| C2 | Na Conta Mãe, atualize o painel e olhe **O que chama atenção**. | Aparece "**N avaliações repetiram a mesma pessoa na mesma vaga**", com o percentual e quanto isso custou. |
| C3 | Ainda em **O que chama atenção**. | Também há dicas como "**Defina um teto de gasto para o mês**" e "**Nenhuma organização tem limite de avaliações**", cada uma com o atalho **Ajustar regras**. |
| C4 | Clique em **Ajustar regras** em um desses alertas. | A tela rola até **Regras de controle**. |

---

## Parte D — Limite de avaliações por organização

| # | O que fazer | O que deve acontecer |
|---|---|---|
| D1 | Na tabela, na linha da organização que você usou, clique **Definir limite**. | Abre a janela "Limite de avaliações com IA" mostrando quantas avaliações a organização já fez no mês. |
| D2 | Marque **Definir um limite só para esta organização**, digite `1` e clique **Salvar limite**. | A janela fecha. Na tabela, a coluna **Limite do mês** mostra "**N de 1**" com barra vermelha e a marca "limite próprio". Em "O que chama atenção" aparece "**… atingiu o limite do mês**". |
| D3 | Na janela anônima, execute uma **nova avaliação**. | A avaliação **sai**, mas como **estimativa local**: faixa âmbar "Estimativa local — esta NÃO é uma avaliação de IA" e o parecer começa com "…o limite mensal de avaliações com IA desta organização foi atingido". |
| D4 | Na Conta Mãe, atualize. | **Pedidos sem usar a IA** aumentou em 1 ("1 estimativa") e o gasto **não** subiu. |
| D5 | Em **Regras de controle**, marque **Bloquear e avisar** e clique **Salvar regras**. | Aparece "Regras salvas. Já valem para as próximas avaliações." |
| D6 | Na janela anônima, tente outra avaliação. | Desta vez **não sai avaliação**: uma **faixa vermelha** (sem a palavra "falha") diz "O limite mensal de avaliações com IA desta organização foi atingido (N de 1). Fale com a administração da plataforma…". |
| D7 | Na Conta Mãe: volte a marcar **Continuar com a estimativa local (recomendado)** e salve. Depois, na linha da organização, **Definir limite → Seguir o padrão da plataforma → Salvar limite**. | O limite próprio some (a coluna volta a "Sem limite"). |

---

## Parte E — Teto de gasto do mês

| # | O que fazer | O que deve acontecer |
|---|---|---|
| E1 | Em **Regras de controle**, em **Teto de gasto por mês**, digite `0,01` e salve. | O cartão **Teto do mês** passa a mostrar mais de 100% com barra vermelha, e aparece o alerta "**O teto de gasto do mês foi atingido**". |
| E2 | Na janela anônima, faça uma nova avaliação. | Sai como **estimativa local**, dizendo "o orçamento mensal de IA da plataforma foi atingido". |
| E3 | Na Conta Mãe, ponha o teto em `200` e salve. | O cartão volta a mostrar uma porcentagem baixa; o alerta de teto some. (Se preferir não ter teto, apague o valor e salve.) |

---

## Parte F — Pausar a IA (emergência)

| # | O que fazer | O que deve acontecer |
|---|---|---|
| F1 | Na faixa do topo, clique **Pausar IA** e confirme. | O selo muda para **Pausada** (âmbar), o botão vira **Religar IA** e aparece o alerta "**A IA está pausada**". |
| F2 | Na janela anônima, faça uma avaliação. | Sai como **estimativa local**, dizendo "a IA está pausada pela administração da plataforma". Ninguém fica sem avaliação; só não há custo. |
| F3 | Na Conta Mãe, clique **Religar IA**. | O selo volta a **Ligada**. |

---

## Parte G — Ajustes de custo (avançado)

| # | O que fazer | O que deve acontecer |
|---|---|---|
| G1 | Em **Regras de controle**, abra **Ajustes de custo (avançado)**. | Aparecem o **preço do texto enviado** (0,75), o **preço do texto respondido** (3,75), a **cotação do dólar** (5,14) e o **modelo de IA**, cada um com uma explicação curta. Uma nota diz que são valores de referência de 20/09/2026. |
| G2 | Troque a cotação do dólar para `6` e clique **Salvar regras**. | "Regras salvas". A data de "Última atualização dos preços" muda. O gasto **já registrado não muda**; só as próximas avaliações usam a nova cotação. Depois volte para `5,14`. |
| G3 | Apague o **preço do texto enviado** e salve. | O painel avisa "**Informe os preços para ver os gastos em R$**" e os valores em R$ passam a "—". Preencha `0,75` de novo e salve. |
| G4 | **Não** troque o modelo de IA agora (deixe em branco). | — (um nome errado faz as avaliações saírem como estimativa local). |

---

## Parte H — Registro, celular e segurança

| # | O que fazer | O que deve acontecer |
|---|---|---|
| H1 | Na Conta Mãe, abra **Auditoria** e filtre por **Execução de IA**. | Aparecem os eventos "Regras de uso da IA alteradas…" e "Limite mensal de IA de '…' definido em 1 avaliação", com o seu nome e a hora. |
| H2 | Abra o painel em uma janela **estreita** (ou no celular). | Tudo cabe na largura; só a tabela de organizações rola para o lado dentro do próprio cartão. |
| H3 | Na janela anônima (administrador da organização), confira o menu. | **Não existe** "Uso da IA": o painel é só da Conta Mãe. |

---

## Ao terminar, deixe como estava

Sem limite próprio na organização · **Continuar com a estimativa local** · sem teto (ou um teto alto) · **IA ligada** · cotação `5,14`.

## Se algo falhar

- **O painel abre com erro ou a avaliação deixa de funcionar:** rode `npm run db -- migrate` e reinicie o `npm run dev`.
- **Gasto sempre R$ 0,00:** as avaliações estão saindo como estimativa local (sem chave, IA pausada ou limite atingido). Veja "Pedidos sem usar a IA" e "Conexão com o Google".
- **O valor difere da fatura do Google:** é esperado uma pequena diferença; o painel **estima** a partir do volume de texto e dos preços informados.
