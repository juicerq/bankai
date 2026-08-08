# O que vem depois do painel de Files

## Problema

O painel de Files do Bankai é a view `treeView === "browse"` da Tree do painel de Review (segmento Diff | Files). Ele já lista os arquivos do worktree e já abre um leitor virtualizado, mas o usuário continua abrindo o VSCode para ler código. Os motivos são concretos: em algumas falhas o leitor trava sem mensagem, trocar o modo de diff colapsa a árvore inteira e fecha o arquivo, não há como fechar o arquivo pela árvore, arquivos acima de 3000 linhas são recusados, e não existe nenhuma forma de procurar um arquivo, uma pasta ou um trecho de conteúdo.

## Resultado

Ler qualquer arquivo do repositório dentro do Bankai deixa de exigir o VSCode: o painel se sustenta sob falha, abre arquivos de qualquer tamanho, encontra um arquivo ou pasta pelo nome, encontra uma ocorrência de texto no conteúdo, e abre direto na linha pedida — inclusive a partir de um `caminho:linha` impresso no terminal.

## Ordem das fases

As fases estão em ordem de dependência, não de valor percebido. Cada uma remove o obstáculo da seguinte:

- A Fase 0 conserta os pontos em que o usuário abandona o painel. Enquanto o leitor trava ou a árvore colapsa sozinha, qualquer feature nova é construída sobre um painel que o usuário já não usa.
- A Fase 1 torna a leitura possível para o conjunto inteiro de arquivos. Sem ela, procurar um arquivo entrega resultados que o leitor recusa a abrir.
- A Fase 2 entrega o que o usuário pediu, e depende da Fase 1 pelo mesmo motivo.
- A Fase 3 é pré-requisito técnico das Fases 4 e 5: as duas produzem uma coordenada `arquivo:linha` e não têm para onde entregá-la enquanto o leitor não souber abrir numa linha.
- As Fases 4, 5 e 6 são independentes entre si.

## Requisitos

### Fase 0 — o painel se sustentar

Em ordem de gravidade. São os quatro momentos em que o usuário volta ao VSCode.

1. **Ler um arquivo não depende do diff.** `use-review-reading.ts:126` condiciona `focusedRaw` a `!!currentSnapshot`. Quando a query `snapshot` falha, `browseFile` nunca é habilitada e o overlay fica preso em "Reading file…" indefinidamente, com o erro escondido atrás dele. `browsePaths` não tem esse gate (`review-panel.tsx:62-66`), então a árvore lista tudo normalmente e o usuário vê uma lista de arquivos que nenhum clique consegue abrir. A leitura de um arquivo do projeto passa a ser independente do estado do snapshot, e uma falha de leitura aparece como erro no lugar do overlay de carregamento.
2. **Trocar o modo de diff preserva a árvore e o arquivo aberto.** `review-panel.tsx:115,142` usa `key={readingKey}` com `readingKey = \`${mode} ${worktree}\``, o que destrói o `useState` de `expandedBrowse` (`review-tree.tsx:44`); e `review-panel-store.ts:29-31` faz `selectMode` limpar `focusedPath` e `hiddenFocusedPath`. O resultado é que trocar o modo colapsa a árvore de Files inteira e fecha o arquivo. O estado de expansão do browse e o arquivo focado sobrevivem à troca de modo.
3. **Escape fecha o leitor sempre.** `review-focused-file.tsx:32-36` registra o handler de Escape no `<section>`, que não tem `tabIndex`. Só funciona porque o botão de fechar tem `autoFocus` (`:150`) — clicar em qualquer linha do texto tira o foco e Escape para de fechar. Escape fecha o leitor independentemente de onde o foco esteja dentro dele.
4. **A árvore fecha o arquivo aberto.** `review-tree.tsx:101-105` trata clique num arquivo já focado como no-op silencioso, e `review-tree-browse.tsx:52-58` não passa `onToggleFocus`, então o botão de foco nunca aparece no modo browse. A árvore passa a oferecer o caminho de volta: clicar no arquivo já aberto o fecha.

### Fase 1 — ler qualquer arquivo

5. **Largura do conteúdo memoizada.** `review-focused-file.tsx:87` chama `diffContentWidth(content.lines)` inline, sem `useMemo`, dentro do componente que o virtualizer re-renderiza a cada frame; `review-rows.ts:69-84` itera caractere a caractere de toda linha. O caminho de diff já memoiza a mesma chamada (`review-diff.tsx:110-113`). O cálculo passa a rodar uma vez por conteúdo. Este é o pré-requisito do item 6: sem ele, elevar o teto de linhas transforma um arquivo grande em travamento de UI.
6. **Sem teto de linhas no caminho de browse.** `review-base.ts:65` define `FULL_FILE_MAX_LINES = 3000` e `browse-files.ts:41` recusa arquivos maiores com status `too-large`. O teto é herdado do caminho de diff, onde faz sentido; o leitor de browse é virtualizado (`review-focused-file.tsx:59-66`) e não precisa dele. Arquivos de qualquer contagem de linhas abrem no modo browse.
7. **Guarda por bytes antes de ler.** `browse-files.ts:28` faz `readFile` sem `stat` prévio; os checks de binário (`:35`) e de tamanho (`:41`) só rodam depois. Como a listagem inclui arquivos ignorados soltos (`browse-files.ts:8,20`), um `.mp4` na raiz é carregado inteiro na memória do UtilityProcess de git. O caminho de diff já se protege antes de ler (`file-diff.ts:93,98`). Um `stat` decide antes do `readFile`, e a guarda por bytes substitui a guarda por linhas removida no item 6.

### Fase 2 — pesquisar arquivo e pasta

Pesquisar arquivo e pesquisar pasta são uma feature só, não duas: ambas filtram o mesmo `string[]` de `browsePaths` já em memória no renderer.

8. **Hook de picker compartilhado.** `shell-picker.tsx:18-24,82-95,99,141-142` e `project-picker.tsx:41-47,147,200-201` implementam a mesma mecânica de teclado (índice destacado, setas, Enter, Escape, `scrollIntoView`) em cópias independentes; hoje o único pedaço compartilhado é `picker-hint.tsx`. Antes de existir um terceiro picker, essa mecânica vira um hook compartilhado consumido pelos dois pickers atuais, sem mudança de comportamento visível. Três cópias justificam a extração; duas não justificavam.
9. **Picker de arquivos e pastas.** Um overlay picker filtra `browsePaths` e abre o resultado escolhido no leitor. A decisão é overlay, não filtro dentro da árvore: os dois pickers do app já têm teclado, foco e semântica de listbox prontos, enquanto a Tree não tem navegação por teclado nenhuma nem semântica de árvore (`review-tree-rows.tsx` usa `<button>` cru, sem `role="tree"`/`treeitem`). O overlay é o caminho mais barato e preserva a árvore intacta. **Armadilha:** o filtro casa contra o path completo, nunca contra `node.name` — `collapseChain` (`file-tree.ts:86`) funde cadeias de diretório único num nó cujo `name` vira `"a/b/c"`, então filtrar por `name` erra as pastas colapsadas.

### Fase 3 — abrir na linha N

10. **O leitor abre numa linha pedida.** `review-focused-file.tsx:59-66` já calcula um `initialOffset` que pula para a primeira linha alterada; ele passa a aceitar uma linha alvo. **Armadilha:** `initialOffset` é um `useState(inicializador)`, calculado uma única vez, e `review-panel.tsx:185` usa `key={focusedPath}` — a key precisa passar a incluir a linha alvo, senão reabrir o mesmo arquivo noutra linha não re-scrolla.

### Fase 4 — pesquisar conteúdo

Este é o salto de capacidade maior da lista, e o usuário não pediu por ele — está aqui porque é o que resta entre o painel e o VSCode depois da Fase 2.

11. **Busca de conteúdo por `git grep`.** A busca usa `git grep --untracked -n` rodando no UtilityProcess de git (`git-process.ts:23-33`), não ripgrep — ripgrep exigiria empacotar um binário por plataforma.
12. **Teto global de resultados imposto pelo worker.** O `-m` do `git grep` é máximo por arquivo; não existe teto global. Medição real neste repo (464 arquivos): `git grep -n --untracked -e "e"` produz 2.625.295 bytes, contra o `maxBuffer` de 10MB de `git-run.ts:6-7`. O teto global é responsabilidade do worker, não do git.
13. **Timeout próprio, maior que o de `GitRun`.** `git-run.ts:6-7` usa `timeout` de 5000ms. Uma busca num monorepo é morta no meio com esse limite, então a busca de conteúdo carrega o próprio timeout.
14. **Resultados como terceiro segmento da Tree.** O segmento passa a ser Diff | Files | Search; os resultados aparecem agrupados por arquivo e o clique abre o arquivo na linha (requisito 10).
15. **Limite conhecido e aceito.** `git grep` não alcança os arquivos ignorados-soltos que a view Files lista — 6 neste repo, entre eles `routeTree.gen.ts`. Nenhuma combinação de flags reproduz o conjunto de `browse-files.ts:8`, e `--no-exclude-standard` varreria `node_modules`. Casar os dois conjuntos exigiria pathspec explícito com todos os paths, ao custo de ARG_MAX.

### Fase 5 — o que o VSCode não faz

16. **`caminho:linha` no terminal vira link.** Clicar num `caminho:linha` impresso no terminal abre o arquivo naquela linha no painel de Review. `registerLinkProvider` do xterm v6 é API estável e não é bloqueada por `allowProposedApi: false` (`terminal-style.ts:5`); o app não registra nenhum link provider hoje e a instância do terminal vive em `use-terminal-session.ts:146-156`. Esta é a única feature da lista que é exclusivamente do Bankai — fecha o laço Shell → leitura.

### Fase 6 — lacunas de leitura

Em ordem de dor, e independentes entre si.

17. **Preview de imagem.** Um arquivo de imagem mostra a imagem em vez de "Binary content cannot be shown."
18. **Cobertura de linguagens do Shiki.** `review-language.ts:29-65` cobre 33 extensões. Faltam `.toml`, `.lua`, `.vue`, `.svelte`, `.kt`, `.swift`, `.php`, `.graphql`, `.proto`, `.ini`, `.env`.
19. **Árvore de browse virtualizada.** `review-tree-browse.tsx:42` renderiza com `.map()` direto, sem virtualização. Hoje sobrevive porque `expanded` inicia vazio; um repositório grande com a árvore expandida não sobrevive.

## Contrato técnico

- `BrowseFiles.list` (`browse-files.ts:8`) devolve a lista inteira de paths de uma vez: união de `git ls-files --cached --others --exclude-standard` com `git ls-files --others --ignored --exclude-standard --directory`, descartando entradas terminadas em `/` (`:20`). O efeito é que arquivos ignorados soltos aparecem e diretórios inteiramente ignorados (`node_modules`) não. Toda filtragem por nome da Fase 2 opera sobre essa lista, já em memória no renderer.
- A árvore é montada no renderer a partir da lista plana (`file-tree.ts:17`), e `collapseChain` (`:86`) funde cadeias de diretório único num nó cujo `name` vira `"a/b/c"`.
- `browseFiles` e `browseFile` (`review-router.ts:70-78`) são worktree-scoped via `ProjectWorktrees.resolve`. Qualquer endpoint novo de busca segue o mesmo escopo.
- Todo comando git roda no UtilityProcess de git (`git-process.ts:23-33`) via `GitRun`, com `execFile`, `timeout` 5000ms e `maxBuffer` 10MB (`git-run.ts:6-7`).
- Não existe ripgrep, nem biblioteca de fuzzy matching, nem LSP ou tree-sitter no repositório.

## Decisão de produto a revisitar

Na view Files, um arquivo modificado mostra o diff, não o conteúdo cru (`use-review-reading.ts:125,140`). É intencional e coberto por teste (`tests/web/use-review-reading.test.ts:423`). Fica registrado como decisão a revisitar quando houver sinal de uso, não como defeito a corrigir.

## Dívida menor

`browseFiles` refetcha dois `git ls-files` completos a cada 30 segundos mesmo com o app parado: `review-changes.ts:7,68` tem um fallback `setInterval` de 30s que notifica incondicionalmente, e `use-review-reading.ts:295-296` invalida `browseFiles`/`browseFile`. O impacto é baixo porque `structuralSharing` no default `true` evita re-tokenizar o Shiki quando o conteúdo não muda. Anotado como dívida, não como fase.

## Fora de escopo

- **Editar arquivos no painel.** Quebra a promessa do `CONTEXT.md` de que o Bankai nunca escreve num repositório; escrever é trabalho do Agent.
- **Go to definition / LSP.** É um subsistema inteiro sem nenhuma infraestrutura no repositório hoje, e o Agent responde melhor à mesma pergunta.
- **Casar o conjunto do `git grep` com o conjunto da view Files.** Custo alto — pathspec explícito e o teto de ARG_MAX — por 6 arquivos neste repositório.

## Validação

- Com a query `snapshot` falhando, a árvore de Files lista e abre arquivos normalmente, e uma falha de leitura mostra o erro em vez do overlay preso.
- Com a árvore expandida e um arquivo aberto, trocar o modo de diff mantém a expansão e o arquivo.
- Com o foco numa linha do texto, Escape fecha o leitor.
- Clicar na árvore no arquivo já aberto o fecha.
- Um arquivo acima de 3000 linhas abre no modo browse; rolar o leitor não perde frames.
- Um arquivo binário grande listado na árvore é recusado sem ser lido inteiro para a memória.
- Os dois pickers existentes mantêm o comportamento de teclado após a extração do hook.
- O picker encontra uma pasta que `collapseChain` fundiu num nó com `name` composto.
- Reabrir o mesmo arquivo numa linha diferente re-scrolla para a nova linha.
- Uma busca de conteúdo com muitos resultados respeita o teto global do worker e não estoura `maxBuffer`; uma busca lenta não é morta em 5000ms.
- Um `caminho:linha` impresso no terminal é clicável e abre o arquivo na linha.
