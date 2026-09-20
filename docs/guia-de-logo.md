# Guia de logo — Vértice 360 - Ciclo de Talentos

Medidas e regras para criar a logo (menu de navegação e favicon). A tela e o `<head>` já estão prontos: **é só substituir os arquivos** da tabela 2, mantendo os mesmos nomes e tamanhos. Hoje eles contêm um "V" provisório.

## 1. Onde a logo aparece hoje

| Local | Tamanho na tela (px CSS) | Para nitidez em tela retina | Cantos |
| --- | --- | --- | --- |
| Menu de navegação (topo, fundo branco) | **40 × 40** | 80 × 80 (2x) e 120 × 120 (3x) | nenhum: a logo do menu é transparente e não é recortada |
| Login e escolha de organização (topo do cartão branco) | **300 × 94** (logo oficial horizontal; encolhe no celular) | 600 × 188 (2x) e 900 × 283 (3x) | nenhum (transparente) |
| Rodapé do sistema (ambiente da organização e Conta Mãe) | **160 × 50** | 320 × 100 (2x) e 480 × 151 (3x) | nenhum (transparente) |
| Aba do navegador | **16 × 16** (32 × 32 em tela retina) | 32 × 32 | como vier no arquivo |
| Atalho no iPhone/iPad | **180 × 180** | — | o iOS arredonda sozinho |
| PDFs exportados (opcional, não ligado ainda) | ≈ 16 × 16 mm no cabeçalho azul | 256 × 256 px | — |

Ao lado do símbolo, o **nome continua sendo texto** ("Vértice 360" e "Ciclo de Talentos"): a logo do menu é só o **símbolo**.

## 2. Arquivos a entregar (nome, tamanho, onde vai)

| # | Arquivo (dentro de `public/`) | Tamanho | Formato / fundo | Uso | Obrigatório |
| --- | --- | --- | --- | --- | --- |
| 1 | `brand/logo-mark.svg` | **512 × 512** (`viewBox="0 0 512 512"`) | SVG, **fundo cheio (sem cantos arredondados)** | reserva (símbolo padrão do componente `BrandMark`; hoje nenhuma tela o usa) | — |
| 1b | `brand/logo-horizontal-160/320/480.png` e `logo-horizontal-300/600/900.png` | 160 × 50, 320 × 100, 480 × 151 e 300 × 94, 600 × 188, 900 × 283 | PNG com transparência (recorte da logo oficial) | **login, escolha de organização e rodapé** (já com a logo oficial) | ✅ (pronto) |
| 1a | `brand/icon-menu-40.png`, `icon-menu-80.png`, `icon-menu-120.png` | **40 × 40, 80 × 80 e 120 × 120** | PNG com transparência, símbolo ocupando quase toda a área | **menu de navegação** (já com a logo definitiva) | ✅ (pronto) |
| 2 | `favicon-16x16.png` e `favicon-32x32.png` | **16 × 16** e **32 × 32** | PNG com cantos arredondados (tile branco) | abas do navegador (já com a logo do menu) | ✅ (pronto) |
| 3 | `favicon.ico` | **16 × 16, 32 × 32 e 48 × 48** (3 camadas no mesmo arquivo) | ICO com transparência | navegadores antigos e o pedido automático a `/favicon.ico` | ✅ (pronto) |
| 4 | `apple-touch-icon.png` | **180 × 180** | PNG **opaco** (sem transparência), fundo cheio, sem cantos | "Adicionar à Tela de Início" no iOS | ✅ (pronto) |
| 5 | `icon-192.png` | **192 × 192** | PNG, pode ter cantos arredondados/transparência | app instalável (Android) | opcional* |
| 6 | `icon-512.png` | **512 × 512** | PNG, idem | app instalável (Android) | opcional* |
| 7 | `og-image.png` | **1200 × 630** | PNG ou JPG, sem transparência | prévia do link no WhatsApp/LinkedIn | opcional** |
| 8 | `brand/logo-mark-256.png` | **256 × 256** | PNG, fundo cheio | logo nos PDFs exportados | opcional*** |

\* Já existem provisórios, mas ainda **não são usados**: só entram se o sistema virar app instalável (manifest).
\** Precisa de endereço absoluto (`https://seu-dominio/og-image.png`); defina depois que o domínio estiver fechado.
\*** Peça a ligação no PDF quando a logo estiver pronta.

O **logotipo horizontal** (símbolo + nome + "Ciclo de Talentos") já é a logo oficial no login e no rodapé. No menu de navegação continua o símbolo sozinho, com o nome em texto ao lado.

### Logo oficial: login e rodapé (já aplicada)

O original é `brand-src/Logo-Oficial.png` (1200 × 630, transparente). As margens foram cortadas (1141 × 335, proporção 3,18:1) e saíram as seis versões `logo-horizontal-*.png` (10 a 160 KB). O texto da logo é **azul-marinho**, por isso ela só entra sobre **fundo claro**: no login ela fica no topo do cartão branco, não sobre o fundo escuro. Componentes: `BrandLogo` (a imagem) e `AppFooter` (o rodapé). **Para trocar:** substitua `brand-src/Logo-Oficial.png` e peça para regerar os seis tamanhos.

### Favicon (já aplicado)

O favicon usa a mesma logo do menu (`brand-src/icon-menu-2000.png`), com três ajustes para ficar bom em tamanho pequeno:

1. **Tile branco de cantos arredondados** atrás do símbolo. Sem ele, o azul-marinho some na aba escura do navegador e a logo fica lavada na aba clara. Na aba branca o tile some e só a logo aparece.
2. **Margem mínima** (3% em 16 px, 4% nos demais), para o símbolo ocupar o máximo possível do quadrado.
3. **Nitidez reforçada** na redução para 16, 32 e 48 px, para o anel e o "V" não virarem uma mancha.

O `apple-touch-icon.png` (180 × 180) é branco opaco com o símbolo a ~72% (o iOS arredonda os cantos). Os `icon-192.png` e `icon-512.png` seguem o mesmo desenho, mas ainda não são usados. O `favicon.svg` antigo foi **removido**: os navegadores preferem SVG quando ele existe, e ele mostraria o "V" provisório. Para trocar de novo: substitua `brand-src/icon-menu-2000.png` e peça para regerar o conjunto.

### Logo do menu (já aplicada)

A logo do menu vem de `brand-src/icon-menu-2000.png` (original de 2000 × 2000 px, transparente, 2,2 MB, **não vai para o site**). Dele saem os três arquivos leves `icon-menu-40/80/120.png` (4 a 20 KB), com as margens transparentes cortadas e uma folga de 3%. A pasta `dist/` é apagada a cada build: não guarde arquivos de logo nela, guarde em `brand-src/` (original) e `public/brand/` (o que vai ao ar).

**Para trocar de novo:** substitua `brand-src/icon-menu-2000.png` (quadrado, mínimo 480 × 480, fundo transparente) e peça para regerar os três tamanhos. Se preferir gerar você mesmo, exporte 40, 80 e 120 px com o mesmo nome. O menu fica em fundo **branco**: cores escuras funcionam; se a logo tiver partes brancas, avise.

## 3. A arte-mestra (um desenho, todos os tamanhos)

- **Prancheta 512 × 512 px**, cor RGB.
- **Fundo cheio** cobrindo a prancheta inteira, **sem cantos arredondados**: o sistema arredonda (nos itens 1 e 4 os cantos vêm de fora).
- **Área segura: 410 × 410 px centralizada** (margem de **51 px** em cada lado). Todo o símbolo fica dentro dela. Assim os cantos arredondados nunca cortam a arte e o ícone segue legível em máscaras redondas.
- O favicon é a mesma arte, **simplificada** (veja a seção 4).
- Cores atuais do sistema, para combinar (não obrigatório): índigo `#4f46e5`, gradiente `#4338ca → #4f46e5 → #3b82f6`, texto/símbolo branco.
- Se a sua marca for **transparente** (sem fundo), avise: no login o fundo é escuro e o símbolo precisa de uma versão clara.

## 4. Regras para o favicon dar certo

1. **Teste a 16 × 16 px**: se não se reconhece, simplifique.
2. Sem texto e sem frases. Use só o símbolo (ou uma inicial, como o "V").
3. Traços com **pelo menos 32 unidades na arte de 512** (equivale a 1 px a 16 px); nada de linhas finas.
4. No máximo 2–3 cores; sem sombras, brilhos, blur ou gradientes sutis no favicon.
5. **Contraste de pelo menos 3:1** entre símbolo e fundo.
6. **SVG limpo**: texto convertido em curvas, sem imagens embutidas, sem `filter`, `viewBox="0 0 512 512"`, menos de 10 KB.
7. PNGs em **sRGB**; o `apple-touch-icon.png` **sem transparência** (o iOS pinta fundo preto onde houver).

## 5. Como exportar

- **Figma:** um frame 512 × 512; *Export* como SVG (marque *Outline text*) para os itens 1 e 2; PNG 1x para os itens 4 a 6 nos tamanhos da tabela (crie frames de 180, 192 e 512 ou use os multiplicadores).
- **Illustrator/Inkscape:** *Save as SVG* com texto convertido em curvas; PNG com *Export for Screens*.
- **favicon.ico:** gere a partir de um PNG de 512 × 512 em realfavicongenerator.net ou favicon.io, e confira que ele tem as camadas 16, 32 e 48.
- Se preferir, entregue **só o SVG mestre** e peça o script que gera todos os PNG/ICO nos tamanhos certos.

## 6. Validação na visão do usuário

Depois de substituir os arquivos: `npm run dev`, abra o sistema em **janela anônima** (o favicon fica em cache no navegador).

| # | O que fazer | O que deve acontecer |
| --- | --- | --- |
| 1 | Olhe a **aba do navegador**. | Aparece a logo (anel com o "V") sobre um quadradinho branco arredondado, reconhecível mesmo pequena. Se ainda aparecer o "V" roxo antigo, feche a aba e abra outra (cache do navegador). |
| 2 | Abra a **tela de login** (fundo escuro). | O símbolo (48 px) aparece com cantos arredondados, sem nada cortado nem encostando na borda. |
| 3 | Entre e olhe o **menu de navegação** (topo, fundo branco). | O símbolo (40 px) fica nítido, alinhado ao nome "Vértice 360". |
| 4 | Aplique **zoom 200% e 300%** (Ctrl e +). | O símbolo continua nítido, sem serrilhado (o menu tem imagens prontas até 300%). |
| 5 | Abra em **`/favicon.ico`** e **`/apple-touch-icon.png`** direto na barra de endereço. | Abrem sem erro; o segundo tem 180 × 180 e sem fundo transparente. |
| 6 | No **iPhone**: Compartilhar, Adicionar à Tela de Início. | O ícone da tela inicial usa a sua arte, sem bordas pretas. |
| 7 | Reduza o zoom do navegador a **50%**. | O favicon e o símbolo continuam legíveis. |
