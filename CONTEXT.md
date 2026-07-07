# bankai — Contexto

bankai é uma TUI de terminal (openTUI, Linux, um processo Bun) pra revisar o código que
agentes Claude Code escrevem. Uma **sidebar** de **Projects** à esquerda; à direita, **Tabs** de
terminais e o corpo com o terminal vivo. O operador roda `cc` num terminal cru e abre uma
**Review** turn-a-turn de qualquer **Session**. Este glossário fixa a linguagem do produto.

> **Convenção de idioma.** O nome de cada termo (headword) é o identificador que já vive no
> código / no Claude Code, em inglês. Descrições em pt-br. Quando a UI ou a conversa usam outra
> palavra, ela vem como _apelido_.

## Linguagem

**Project** — _apelido: "projeto"_
Uma entidade explícita e persistida que o operador adiciona na sidebar: um diretório (`cwd`) com
um nome e uma ordem. É a unidade da sidebar e a âncora do `cwd` das suas Tabs — todas as Tabs de um
Project rodam no `cwd` dele (`Project 1→N Tabs`).
_Evite_: tratar Project como raiz git derivada (era o modelo antigo, do Canvas) — hoje é explícito,
o operador é quem adiciona; e não confundir com **Tab** (o Project é a pasta na sidebar, a Tab é um
terminal dentro dele).

**Tab** — _apelido: "aba", "terminal"_
Um terminal (shell cru) dentro de um Project, onde o operador digita — abre no `$SHELL` dele, no
`cwd` do Project, no prompt (sem auto-rodar nada). Um Project tem N Tabs. Ao longo da vida, uma Tab
hospeda zero, uma ou várias **Sessions** (o operador roda `cc`, sai, roda de novo).
_Evite_: tratar Tab como Session — a Tab é o shell onde você digita; a Session é a conversa `claude`
que roda dentro dela. Uma Tab sem `cc` rodando não tem Session.

**Session** — _apelido: "sessão"_
A identidade de uma conversa com o Claude Code: o que o `--session-id` (UUID) nomeia e o
transcript persiste. Roda *dentro* de uma Tab (vinculada a ela via `/proc`) e é a **unidade de
review**. Sobrevive ao processo — reiniciar com `--resume` reata a *mesma* Session, com o mesmo
histórico e estado de review. A review de uma Tab mira a Session atual/última dela.
_Evite_: confundir Session com a Tab que a hospeda (uma Tab pode hospedar várias Sessions ao longo
do tempo), ou com o processo `claude` vivo (isso é "a Session rodando").

**cwd** — _apelido: "diretório"_
O diretório de um Project, onde suas Tabs (e o `claude` dentro delas) rodam. É a âncora que escopa
o `--resume` no restart de uma Session.
_Evite_: tratar `cwd` e Project como sinônimos — o Project é a entidade da sidebar (cwd + nome +
ordem); o `cwd` é só o diretório.

**Turn** — _apelido: "turno"_
Um incremento de trabalho do agente numa Session: abre no prompt do operador, reúne as edições
que o agente faz e fecha quando ele para (marcos vindos dos eventos `UserPromptSubmit` → `Stop`).
É o **átomo de review** — anda-se turn-a-turn, não por task nem por diff git acumulado. Carrega
o prompt que o abriu e seus Diffs (endereçáveis por Turn, arquivo e linha). Pode ter zero Diffs
(o agente só respondeu). Enquanto o agente não parou, o Turn está *aberto/em andamento*.
_Evite_: "task" ou "commit"/"diff git" como unidade de review — o átomo é o Turn.

**Review** — _apelido: "revisão"_
O modo **tela cheia focada**, escopado a uma Session, que esconde a sidebar + as Tabs e dá três
painéis: um rail com os Turns da Session (esquerda), o leitor de Diffs do Turn selecionado (centro)
e o rail de Feedback (direita). `ESC` volta pro terminal, que nunca pausou — é alternar entre
"dirigir" e "ler" a mesma Session. É a tela/modo — o ato de olhar o código é "revisar".
_Evite_: usar "Review" (a tela) pro ato de revisar, e vice-versa; e imaginar a Review in-pane — ela
toma a tela inteira de propósito (largura é o recurso escasso no terminal e por SSH).

**Diff** — _apelido: "diff"_
A mudança legível e com syntax-highlight de **um arquivo** dentro de um Turn; um Turn tem um Diff
por arquivo que tocou. Visto em dois modos: **per-turn** (só o incremento daquele Turn) ou
**accumulated** ("acumulado" — a mudança líquida somando os Turns até ali).
_Evite_: confundir com o diff git do working-tree — o produto revisa por Turn, não o estado atual
da árvore.

**Fold** — _apelido: "dobra", "⋯ N linhas"_
O marcador que dobra um trecho de contexto intacto dentro de um Diff, mostrando só a vizinhança
das mudanças. Um Diff se lê **folded** (contexto dobrado, padrão) ou **full** (arquivo inteiro,
sem dobras); alternar entre eles não muda o ponto do arquivo que você estava vendo. É um eixo
independente do par **compact/unified** (remoções resumidas vs linha a linha inline).
_Evite_: "expanded/collapsed" como rótulo — ambíguo entre os dois eixos; expandir remoções é
compact→unified, dobrar contexto é o Fold (folded/full).

**Status** — _apelido: "status"_
O badge de uma Session, sempre **derivado** (nunca setado à mão, exceto `done`). Combina um estado
de processo — **`generating`** (agente trabalhando), **`idle`** (parado no prompt, nada pendente) ou
**`blocked`** (esperando um prompt de permissão; precisa de você pra *continuar*) — com a flag
**`unreviewed`** sobreposta. Os estados de processo vêm dos hooks (`Stop`, `Notification` matchers
`permission_prompt`/`agent_needs_input`); `unreviewed` vem da Review. **`done`** (concluído) é manual
ou derivado de git, nunca auto-inferido.
_Evite_: "waiting-on-me" e "idle-at-prompt" (vagos) — use `blocked` (destravar o agente) e
`unreviewed` (revisar) separadamente; e não auto-inferir `done` do processo.

**Reviewed / unreviewed** — _apelido: "revisado / não revisado"_
Estado de um **Turn**, marcado (ou não) pelo operador como já revisado; persiste entre restarts,
pra você não perder o lugar. Uma Session com qualquer Turn não revisado carrega a flag `unreviewed`
no Status.
_Evite_: tratar "revisado" como estado da Session inteira — é por Turn.

**Feedback** — _apelido: "feedback"_
Uma nota do operador ancorada numa linha (por Turn, arquivo e linha), com tag **`Quality`**
(limpeza/qualidade local) ou **`Architecture`** (decisão de design que se propaga). Deixar um
Feedback `Architecture` num Turn/linha é o que "flaguer" significa aqui. O envio de volta pro
terminal da Session é diferido — na base o composer existe mas fica desabilitado (read-only).
_Evite_: "comentário" solto sem tag, e um ato "flag" separado — o flag é o Feedback `Architecture`.

**Cascade warning** — _apelido: "aviso de cascata"_
O aviso **derivado** que aparece num Turn quando ele constrói em cima de um Turn/linha marcado com
Feedback `Architecture` — pra você notar que a correção precisa se **propagar** pra frente. Feedback
`Quality` **não** dispara Cascade (é limpeza local, não se propaga). Diferido: na base a estrutura
pode existir, a UI não.
_Evite_: tratar o Cascade como alerta de bug — é só sobre arquitetura se propagando pros Turns
seguintes, não caça-bug.

**Hook** — _apelido: "hook"_
O gancho que o app instala (e mantém, merge idempotente) no `~/.claude/settings.json` **global**:
um hook `command` que roda `curl --max-time 0.2 <localhost:porta-fixa> || true` contra o
`HookGateway` local. É a fonte **primária** ao vivo da Review (dispara pra toda sessão `cc` da
máquina). Sem o app rodando, o `curl … || true` é inerte (~200ms, no-op) e não degrada o claude.
_Evite_: imaginar hook injetado no spawn (`--settings`) — o shell é cru; o hook é global e o app é
dono da sua instalação, não o operador.

**Transcript** — _apelido: "transcript"_
O registro em disco (`.jsonl`) de uma Session — o histórico durável da conversa. É a fonte de
**fallback** do review (reconstruir os Turns quando não houve captura ao vivo pelos hooks); a fonte
primária é o fluxo de eventos ao vivo. Também é o alvo do vínculo Tab↔Session: ler
`/proc/<pid-claude>/fd/` revela o `.jsonl` que o `claude` mantém aberto.
_Evite_: tratá-lo como fonte primária do review (é fallback), ou confundi-lo com a Session (a
Session é a identidade; o Transcript é o registro dela em disco).

**Operator** — _apelido: "operador", "você"_
O único humano que usa o app: revisa o código e conduz as Sessions. É um app pessoal, single-user.
_Evite_: falar de "usuários" no plural — não há multi-usuário.
