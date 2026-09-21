# Passo a passo de validação (visão do usuário) — Avaliação Assistida por IA

Cobre as correções do módulo **Avaliação Assistida por IA**: origem da nota (IA × estimativa local), decisão humana assinada
pelo usuário logado, opção "Divergir da IA", avisos na própria tela (sem pop-up) e a retirada dos rótulos "Módulo N".
Tempo estimado: 15–20 minutos.

## 0. Preparação

1. No terminal do projeto: `npm run db -- migrate`. Deve aplicar a migration `20260920000018_ai_evaluation_source`
   (se disser "Nenhuma migration pendente", já está aplicada). **Faça isso antes de subir a nova versão**: sem a migration,
   a lista de avaliações não carrega.
2. `npm run dev` e abra `http://localhost:3000`.
3. Entre com um usuário **Administrador** (ou Recrutador) de uma organização que tenha ao menos **1 vaga e 1 candidato**
   (as organizações de demonstração já têm). Credenciais: as mesmas dos guias anteriores.

> **Sobre a chave do Gemini:** hoje o `.env.local` **não** tem `GEMINI_API_KEY`. Então as Partes A–E abaixo testam o caminho
> **"estimativa local"** (o que aparece quando a IA não está disponível). A Parte F, opcional, testa com a chave real.

---

## Parte A — Origem da nota (transparência)

| # | O que fazer | O que deve acontecer |
|---|---|---|
| A1 | Abra **Avaliação Assistida por IA** no menu. | O título aparece **sem** o rótulo "Módulo 9" acima dele. |
| A2 | Escolha um candidato e uma vaga **ainda sem avaliação** e clique **Executar Avaliação Assistida**. | Aparece, **antes de qualquer número**, uma **faixa âmbar**: "Estimativa local — esta NÃO é uma avaliação de IA". |
| A3 | Leia a linha logo abaixo da faixa. | "Avaliação de dd/mm/aaaa hh:mm · Origem: **Estimativa local por regras — não é IA**". |
| A4 | Olhe o cartão escuro da esquerda e o parecer. | O cartão diz **"Fit Geral (estimativa local)"**. O parecer começa com **"⚠ ESTIMATIVA LOCAL — o Gemini não está configurado neste ambiente (falta a chave GEMINI_API_KEY)"**. O título das perguntas é "Perguntas Sugeridas para Validação Humana" (sem "pela IA"). |
| A5 | Veja o selo ao lado da nota geral. | **80% ou mais** = "Alta Aderência" (verde); **60–79%** = "Aderência Média" (âmbar); **abaixo de 60%** = "Aderência Baixa" (vermelho). |
| A6 | Veja o cartão **Aderência ao DNA Cultural**. | Ao lado da nota há **"Acima do corte"** (verde) ou **"Abaixo do corte"** (vermelho), comparando com o "Corte: X%" do DNA. |
| A7 | Para conferir o "Abaixo do corte": vá em **DNA Organizacional**, suba o limite de fit cultural para `99`, salve e volte à avaliação. **Depois devolva o valor original.** | O selo do cartão cultural passa a "Abaixo do corte". |
| A8 | Abra uma avaliação **antiga** (as de demonstração, ex.: TechCorp — Tech Lead). | Não há faixa âmbar e a origem diz **"não registrada (avaliação anterior ao registro de origem)"**. |

**Se falhar:** a lista de avaliações não carrega ou aparece uma faixa vermelha de erro logo ao abrir a tela → a migration da
Preparação não foi aplicada.

---

## Parte B — Decisão humana

| # | O que fazer | O que deve acontecer |
|---|---|---|
| B1 | Role até **Decisão Humana Final** numa avaliação **sem** decisão. | **Nenhuma** das opções vem marcada e o botão **Registrar Parecer Humano** está **desabilitado** (ao passar o mouse: "Escolha uma decisão…"). |
| B2 | Conte as opções. | São **4**: Aprovar para Próxima Etapa, Aprofundar em Entrevista, Desqualificar com Feedback e **Divergir da Avaliação da IA** (nova). |
| B3 | Marque **Aprofundar em Entrevista**, escreva uma justificativa e clique **Registrar Parecer Humano**. | O selo do topo do bloco mostra **"Status: Aprofundar em entrevista"** (texto legível, não o código em inglês). Aparece o quadro **"Parecer humano registrado"** com o seu texto. |
| B4 | Leia o rodapé do bloco. | "Última revisão humana: dd/mm/aaaa hh:mm por **SEU NOME**" — o nome do usuário logado, **não** "Recrutador / Gestor Humano". Também diz que registrar de novo substitui o parecer anterior. |
| B5 | Troque para outro candidato e volte ao primeiro. | A decisão já registrada vem **marcada**, a justificativa vem **vazia** e o botão agora se chama **Atualizar Parecer Humano**. |
| B6 | Marque **Divergir da Avaliação da IA**, justifique e atualize. | O selo passa a **"Status: Divergiu da avaliação da IA"** (violeta). |
| B7 | Entre na **Conta Mãe → Auditoria** e olhe os eventos mais recentes da organização. | Há um evento de **decisão humana registrada** com o **seu nome** e outro de **avaliação de IA concluída**. |

---

## Parte C — Erros aparecem na própria tela

| # | O que fazer | O que deve acontecer |
|---|---|---|
| C1 | Pare o servidor (Ctrl+C no terminal do `npm run dev`) e clique **Executar Avaliação Assistida** (ou **Re-analisar com IA**). | Aparece uma **faixa vermelha dentro da página** ("Falha na avaliação com IA: …"). **Não** abre pop-up do navegador. |
| C2 | Clique no **X** da faixa. | A faixa some. Suba o servidor de novo (`npm run dev`) e atualize a página. |

---

## Parte D — A estimativa local não passa por IA nos outros lugares

Use um candidato cuja avaliação (A2) foi feita como estimativa local.

| # | O que fazer | O que deve acontecer |
|---|---|---|
| D1 | **Processo Seletivo**: veja o cartão do candidato no Kanban. | O rótulo é **"Estimativa local (não é IA):"** em vez de "Fit Preditivo IA:". |
| D2 | **Candidatos**: veja o cartão do candidato. | O rótulo é **"Estimativa local (não é IA):"**. O botão dele diz **"Ver Avaliação com IA"** (sem "(Módulo 9)"). |
| D3 | Abra o **resumo** do candidato (clique no cartão) e o **resumo da candidatura** (clique no cartão do Kanban). | Em ambos há o aviso âmbar **"Estimativa local por regras simples — NÃO é uma avaliação de IA. Valide em entrevista."** |
| D4 | No resumo da candidatura, use **Copiar resumo** e cole em um bloco de notas; depois use o ícone da impressora (**Imprimir resumo**). | O texto copiado começa a seção com **"Estimativa local (NÃO é avaliação de IA): fit geral …"**. No impresso aparece o mesmo aviso em negrito. |
| D5 | Em **Candidatos**, exporte **CSV** e **PDF**. | A nota desse candidato sai com **"(estimativa local, não é IA)"** no CSV e **"(est. local)"** no PDF. |

---

## Parte E — Nomenclatura

| # | O que fazer | O que deve acontecer |
|---|---|---|
| E1 | Abra Vagas, Candidatos, Processo Seletivo, Entrevistas, Proposta e Indicadores. | Nenhum título traz "Módulo 6", "Módulo 7" etc. acima dele (o menu já não tinha a numeração). |
| E2 | Em **Proposta**, aceite uma proposta (o candidato é contratado). | A mensagem diz "A jornada de onboarding foi aberta no módulo **Onboarding**" (não "Módulo 12"). |

---

## Parte F (opcional) — Com a chave real do Gemini

1. No `.env.local`, preencha `GEMINI_API_KEY="sua-chave"` (e, se precisar, `GEMINI_MODEL`). Reinicie `npm run dev`.
2. Abra a mesma avaliação e clique **Re-analisar com IA**.

| # | O que deve acontecer |
|---|---|
| F1 | **Não** aparece a faixa âmbar; a origem diz **"Modelo de IA (Gemini)"**; o cartão volta a ser "Fit Geral Ponderado". |
| F2 | Se a faixa âmbar **ainda** aparecer, o parecer traz o motivo: *"a chamada ao Gemini falhou ou devolveu uma resposta inválida"*. Procure no terminal a linha `[AI] A chamada ao Gemini falhou…` (o erro completo está ali). A causa mais provável é um `GEMINI_MODEL` que a sua chave não acessa. |

---

## Se algo falhar

- **Tela de avaliações vazia / erro ao abrir:** rode `npm run db -- migrate` e recarregue com Ctrl+F5.
- **Ainda vejo "Módulo N" ou o texto antigo:** Ctrl+F5 (cache do navegador) e confirme que o `npm run dev` foi reiniciado.
- **Decisão humana aparece com o nome errado:** confirme com quem está logado (menu do usuário, canto superior direito); o nome
  gravado é sempre o da sessão.

---

## Parte G — Quando a IA do Google não responde (sobrecarga, modelo errado)

O sistema tenta de novo sozinho quando o Google está sobrecarregado (até 3 tentativas, no máximo ~40 s). Se mesmo assim não responder:

| # | O que fazer | O que deve acontecer |
|---|---|---|
| G1 | Numa avaliação que **já existe** (feita com IA de verdade ou de demonstração), clique **Re-analisar com IA** enquanto o Google estiver instável. | Aparece uma **faixa âmbar**: "A IA não foi usada desta vez: o serviço de IA do Google está com alta demanda neste momento… **Mantivemos a avaliação anterior.**" A avaliação anterior **continua na tela** (não é trocada por uma estimativa). Tente de novo em instantes. |
| G2 | Para testar sem depender do Google: **Conta Mãe → Uso da IA → Regras de controle → Ajustes de custo → Modelo de IA**, digite `modelo-que-nao-existe` e salve. Na organização, **Re-analisar com IA** de novo. | A mesma faixa âmbar, agora dizendo "…o modelo de IA configurado não foi encontrado; avise a administração da plataforma. Mantivemos a avaliação anterior." (esse erro **não** é repetido: falha na hora). |
| G3 | **Volte o campo "Modelo de IA" para vazio** (ou para o modelo que você usa) e salve. | A próxima avaliação volta a usar a IA. |
| G4 | Escolha um candidato **sem avaliação nenhuma** e execute a avaliação com a IA fora do ar (repita G2). | Como não há avaliação anterior, sai a **estimativa local** (faixa âmbar grande) e o parecer começa com o motivo **em português** ("…o modelo de IA configurado não foi encontrado…"). |
| G5 | Na tela de resultado, olhe **"Aderência por Pilar do DNA Cultural"**. | Só aparecem os pilares que **a organização cadastrou no DNA** (antes a IA podia inventar pilares a mais). |
| G6 | Volte à avaliação do candidato que tinha **estimativas locais** gravadas por falhas antigas. | Aparece a **avaliação real** (a de IA ou a de demonstração), não as estimativas: uma estimativa nunca esconde uma avaliação real do mesmo candidato e vaga. As estimativas continuam guardadas. |
