# Issues

## Status geral

Concluído. Todas as issues e seus critérios de aceite foram entregues.

## leitura-independente-do-snapshot

### Resultado

Abrir um arquivo na view Files deixa de depender do sucesso da query `snapshot`, e uma falha de leitura aparece como erro no lugar do overlay de carregamento.

### Critérios de aceite

- [x] Com a query `snapshot` em erro, clicar num arquivo da árvore de Files carrega e exibe o conteúdo.
- [x] Uma falha de `browseFile` substitui o overlay "Reading file…" por uma mensagem de erro legível.
- [x] O overlay de carregamento nunca permanece visível depois que a leitura termina em erro.

### Bloqueado por

Nenhum.

### Contexto

O gate está em `use-review-reading.ts:126`, onde `focusedRaw` exige `!!currentSnapshot`. `browsePaths` não tem o mesmo gate (`review-panel.tsx:62-66`) — é por isso que a árvore lista tudo enquanto nenhum clique abre.

### Cobre

Requisito 1.

## estado-da-arvore-sobrevive-a-troca-de-modo

### Resultado

Trocar o modo de diff preserva a expansão da árvore de Files e o arquivo aberto.

### Critérios de aceite

- [x] Com pastas expandidas no modo browse, trocar o modo de diff mantém exatamente as mesmas pastas expandidas.
- [x] Com um arquivo aberto no leitor, trocar o modo de diff mantém o arquivo aberto.
- [x] Trocar de worktree continua descartando o estado de expansão e o arquivo focado.

### Bloqueado por

Nenhum.

### Contexto

Duas causas independentes, ambas precisam cair: `review-panel.tsx:115,142` usa `key={readingKey}` com `readingKey = \`${mode} ${worktree}\``, destruindo o `useState` de `expandedBrowse` em `review-tree.tsx:44`; e `review-panel-store.ts:29-31` faz `selectMode` limpar `focusedPath` e `hiddenFocusedPath`.

### Cobre

Requisito 2.

## escape-fecha-o-leitor

### Resultado

Escape fecha o leitor de arquivo a partir de qualquer foco dentro dele.

### Critérios de aceite

- [x] Clicar numa linha do texto e pressionar Escape fecha o leitor.
- [x] Escape continua fechando o leitor logo após abri-lo, sem clique prévio.

### Bloqueado por

Nenhum.

### Contexto

O handler está no `<section>` de `review-focused-file.tsx:32-36`, que não tem `tabIndex`; hoje só funciona porque o botão de fechar tem `autoFocus` (`:150`).

### Cobre

Requisito 3.

## fechar-arquivo-pela-arvore

### Resultado

Clicar na árvore no arquivo que já está aberto o fecha, no modo browse e no modo diff.

### Critérios de aceite

- [x] Clicar no arquivo focado na árvore fecha o leitor em vez de ser no-op.
- [x] O controle de foco aparece nas linhas da árvore no modo browse.

### Bloqueado por

Nenhum.

### Contexto

`review-tree.tsx:101-105` trata o clique no arquivo focado como no-op silencioso, e `review-tree-browse.tsx:52-58` não repassa `onToggleFocus`.

### Cobre

Requisito 4.

## memoizar-largura-do-conteudo

### Resultado

A largura do conteúdo do leitor é calculada uma vez por conteúdo, e não a cada frame do virtualizer.

### Critérios de aceite

- [x] `diffContentWidth` é chamada uma única vez para um mesmo conteúdo, mesmo com o virtualizer re-renderizando.
- [x] A largura renderizada permanece idêntica à atual para o mesmo conteúdo.

### Bloqueado por

Nenhum.

### Contexto

Prefactor da issue `sem-teto-de-linhas-no-browse`. A chamada inline está em `review-focused-file.tsx:87`; `review-rows.ts:69-84` itera caractere a caractere de toda linha. O caminho de diff já memoiza a mesma chamada em `review-diff.tsx:110-113` — copiar essa forma.

### Cobre

Requisito 5.

## guarda-por-bytes-antes-de-ler

### Resultado

`BrowseFiles` decide por `stat` se vale ler o arquivo, antes de carregá-lo na memória do UtilityProcess de git.

### Critérios de aceite

- [x] Um arquivo grande listado na árvore é recusado sem que seu conteúdo seja lido inteiro.
- [x] A recusa por tamanho continua chegando ao renderer como um status distinguível de erro de leitura.
- [x] Arquivos dentro do limite continuam abrindo com o mesmo conteúdo de hoje.

### Bloqueado por

Nenhum.

### Contexto

`browse-files.ts:28` faz `readFile` antes dos checks de binário (`:35`) e tamanho (`:41`). O caminho de diff já se protege antes de ler em `file-diff.ts:93,98` — usar a mesma ordem. A listagem inclui arquivos ignorados soltos (`browse-files.ts:8,20`), então um `.mp4` na raiz é um caso real.

### Cobre

Requisito 7.

## sem-teto-de-linhas-no-browse

### Resultado

Um arquivo de qualquer contagem de linhas abre no leitor pelo caminho de browse.

### Critérios de aceite

- [x] Um arquivo acima de 3000 linhas abre no modo browse e rola sem perda perceptível de frames.
- [x] O caminho de diff mantém `FULL_FILE_MAX_LINES` inalterado.
- [x] Nenhum arquivo dentro do limite de bytes retorna status `too-large` por contagem de linhas.

### Bloqueado por

`memoizar-largura-do-conteudo`, `guarda-por-bytes-antes-de-ler`.

### Contexto

`review-base.ts:65` define `FULL_FILE_MAX_LINES = 3000` e `browse-files.ts:41` o aplica ao browse. O teto é herdado do caminho de diff; o leitor de browse é virtualizado (`review-focused-file.tsx:59-66`). A guarda por bytes da issue anterior é o que passa a proteger este caminho.

### Cobre

Requisito 6.

## hook-de-picker-compartilhado

### Resultado

A mecânica de teclado dos pickers (índice destacado, setas, Enter, Escape, `scrollIntoView`) vive num hook compartilhado, consumido por `shell-picker` e `project-picker` sem mudança de comportamento.

### Critérios de aceite

- [x] `shell-picker` e `project-picker` não contêm mais gerenciamento próprio de índice destacado nem handlers de setas/Enter/Escape.
- [x] Os testes existentes de teclado dos dois pickers passam sem alteração de expectativa.

### Bloqueado por

Nenhum.

### Contexto

Prefactor da issue `quick-open-de-arquivos-e-pastas`. As cópias estão em `shell-picker.tsx:18-24,82-95,99,141-142` e `project-picker.tsx:41-47,147,200-201`. Hoje o único pedaço compartilhado é `picker-hint.tsx`.

### Cobre

Requisito 8.

## quick-open-de-arquivos-e-pastas

### Resultado

Ctrl+X, P abre o Quick Open, que filtra os paths do worktree por nome e abre no leitor o arquivo escolhido; escolher uma pasta mantém o diálogo aberto e restringe os resultados ao conteúdo dela.

### Critérios de aceite

- [x] O Quick Open abre por atalho de teclado no painel de Review e filtra sobre `browsePaths`.
- [x] O filtro casa contra o path completo, e encontra uma pasta cujo nó foi fundido por `collapseChain` (nome composto do tipo `"a/b/c"`).
- [x] Setas, Enter e Escape funcionam pelo hook compartilhado, sem código de teclado próprio.
- [x] Escolher um arquivo o abre no leitor; a árvore não muda de estrutura por causa do filtro.
- [x] Escolher uma pasta mantém o Quick Open aberto e restringe os resultados aos arquivos e pastas dentro dela.

### Bloqueado por

`hook-de-picker-compartilhado`, `sem-teto-de-linhas-no-browse`.

### Contexto

Decisão fechada: overlay, não filtro dentro da árvore — a Tree não tem navegação por teclado nem semântica de árvore (`review-tree-rows.tsx` usa `<button>` cru). Pesquisar arquivo e pesquisar pasta são a mesma feature: ambas filtram o mesmo `string[]`. Escolher uma pasta mantém o picker aberto e estreita os resultados dentro dela; não revela a pasta na Tree. A armadilha do `collapseChain` está em `file-tree.ts:86`. Carregar as skills `frontend`, `react-components` e `frontend-design`.

### Cobre

Requisito 9.

## abrir-arquivo-na-linha

### Resultado

O leitor aceita uma linha alvo e abre com o scroll nela, inclusive ao reabrir o mesmo arquivo numa linha diferente.

### Critérios de aceite

- [x] Abrir um arquivo com linha alvo posiciona o scroll nessa linha.
- [x] Reabrir o mesmo arquivo numa linha diferente re-scrolla para a nova linha.
- [x] Abrir sem linha alvo mantém o comportamento atual de pular para a primeira linha alterada.

### Bloqueado por

Nenhum.

### Contexto

`initialOffset` está em `review-focused-file.tsx:59-66` e é um `useState(inicializador)`, avaliado uma única vez. `review-panel.tsx:185` usa `key={focusedPath}` — a key precisa incluir a linha alvo, senão a reabertura não re-scrolla.

### Cobre

Requisito 10.

## busca-de-conteudo-no-quick-open

### Resultado

O Quick Open oferece uma ação explícita para buscar texto no conteúdo do worktree via `git grep`; os resultados aparecem no mesmo diálogo e abrem o arquivo na linha, sem mudar o modo da Tree.

### Critérios de aceite

- [x] A busca roda `git grep --untracked -n` no UtilityProcess de git, com escopo por worktree.
- [x] O worker impõe um teto global de resultados e a resposta indica quando foi truncada.
- [x] Uma busca que passa de 5000ms não é abortada pelo timeout padrão de `GitRun`.
- [x] Para qualquer termo digitado, o Quick Open oferece a ação de buscar dentro dos arquivos.
- [x] Os resultados aparecem agrupados por arquivo no mesmo diálogo e a escolha abre o arquivo na linha do resultado.
- [x] Abrir um resultado não troca a Tree entre Diff e Files nem muda sua expansão.

### Bloqueado por

`abrir-arquivo-na-linha`.

### Contexto

Decisão fechada: `git grep`, não ripgrep — ripgrep exigiria empacotar binário por plataforma. `git-run.ts:6-7` usa `timeout` 5000ms e `maxBuffer` 10MB; o `-m` do git é por arquivo, não global. Medição real neste repo: `git grep -n --untracked -e "e"` sobre 464 arquivos produz 2.625.295 bytes. O endpoint segue o padrão worktree-scoped de `review-router.ts:70-78`. Limite aceito e já decidido: `git grep` não alcança os arquivos ignorados-soltos que a view Files lista.

### Cobre

Requisitos 11, 12, 13, 14, 15.

## links-de-arquivo-no-terminal

### Resultado

Um `caminho:linha` impresso no terminal é clicável e abre o arquivo naquela linha no painel de Review.

### Critérios de aceite

- [x] Um link provider registrado no xterm reconhece `caminho:linha` na saída do terminal.
- [x] Clicar no link abre o arquivo no leitor, posicionado na linha.
- [x] Um caminho que não existe no worktree não vira link.

### Bloqueado por

`abrir-arquivo-na-linha`.

### Contexto

`registerLinkProvider` é API estável do xterm v6 e não é bloqueada por `allowProposedApi: false` (`terminal-style.ts:5`). Nenhum link provider é registrado hoje; a instância do terminal vive em `use-terminal-session.ts:146-156`.

### Cobre

Requisito 16.

## preview-de-imagem

### Resultado

Abrir um arquivo de imagem mostra a imagem em vez de "Binary content cannot be shown."

### Critérios de aceite

- [x] Formatos de imagem comuns renderizam no leitor.
- [x] Binários que não são imagem continuam mostrando a mensagem atual.
- [x] A guarda por bytes continua valendo para o caminho de imagem.

### Bloqueado por

`guarda-por-bytes-antes-de-ler`.

### Contexto

Carregar as skills `frontend-design` e `react-components`.

### Cobre

Requisito 17.

## cobertura-de-linguagens-do-shiki

### Resultado

O leitor destaca sintaxe para as extensões que hoje caem em texto puro.

### Critérios de aceite

- [x] `.toml`, `.lua`, `.vue`, `.svelte`, `.kt`, `.swift`, `.php`, `.graphql`, `.proto`, `.ini` e `.env` recebem destaque.
- [x] As 33 extensões já cobertas continuam com o mesmo destaque.

### Bloqueado por

Nenhum.

### Contexto

O mapa está em `review-language.ts:29-65`.

### Cobre

Requisito 18.

## virtualizar-a-arvore-de-browse

### Resultado

A árvore de Files renderiza apenas as linhas visíveis, e continua utilizável com a árvore inteira expandida num repositório grande.

### Critérios de aceite

- [x] Expandir todas as pastas num repositório grande mantém a árvore responsiva.
- [x] Expansão, foco e seleção continuam funcionando como hoje.

### Bloqueado por

Nenhum.

### Contexto

`review-tree-browse.tsx:42` usa `.map()` direto. Hoje sobrevive apenas porque `expanded` inicia vazio.

### Cobre

Requisito 19.
