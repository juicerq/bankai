# project-j — Contexto

project-j é um app desktop (Electron, Linux) pra revisar o código que agentes Claude Code
escrevem. Mostra um **Canvas** de **Sessions** Claude Code vivas agrupadas por projeto, e
abre uma revisão turn-a-turn de qualquer uma. Este glossário fixa a linguagem do produto.

> **Convenção de idioma.** O nome de cada termo (headword) é o identificador que já vive no
> código / no Claude Code, em inglês. Descrições em pt-br. Quando a UI ou a conversa usam outra
> palavra, ela vem como _apelido_.

## Linguagem

**Session** — _apelido: "sessão"_
A identidade de uma conversa com o Claude Code: o que o `--session-id` (UUID) nomeia e o
transcript persiste. Sobrevive ao processo — reiniciar com `--resume` reata a *mesma* Session,
com o mesmo histórico e estado de review.
_Evite_: chamar de "session" o processo `claude` vivo (isso é "a Session rodando") ou o **Node**
na tela.

**Canvas** — _apelido: "canvas"_
O board pannable/zoomable que mostra todas as Sessions vivas de uma vez, para o operador não
perder o fio de quem está fazendo o quê entre projetos. É o nível inicial do app; abrir uma
review o substitui. (A layout — posições dos Nodes + pan/zoom — persiste no store `workspace`;
"workspace" é o nome da persistência, não um conceito à parte do Canvas.)

**Node** — _apelido: "node" (evite "card")_
A unidade visual de uma Session no Canvas: um retângulo arrastável e redimensionável com um
header (nome, badge de status, "Ver diff", "encerrar") e o **Terminal** vivo dentro. Um Node
por Session.
_Evite_: "card" — sugere resumo/preview, e o ponto do produto é que o Node é o terminal `claude`
real e vivo, não um cartão de resumo.

**Terminal** — _apelido: "terminal"_
O xterm embutido num Node, ligado ao stream de bytes do PTY da Session: é onde o operador lê o
agente e digita prompts direto.
_Evite_: tratar o Terminal como um node do Canvas — ele é o conteúdo de um Node (no código, o
componente `TerminalNode` é o Terminal *dentro* do Node, não um node à parte).

**Project** — _apelido: "projeto"_
O repositório git ao qual uma Session pertence: a raiz do seu `cwd` (`git rev-parse
--show-toplevel`; fallback: o próprio `cwd`). É a chave de agrupamento no Canvas — Sessions em
subpastas do mesmo repo caem no mesmo Project.
_Evite_: usar "project" pro `cwd` de uma Session (várias Sessions de `cwd`s distintos podem
compartilhar um Project) ou pro **Frame** (a moldura visual do Project).

**Frame** — _apelido: "moldura"_
A moldura tracejada no Canvas que agrupa visualmente todos os Nodes de um Project. Um Frame por
Project.
_Evite_: confundir com Project — o Frame é a representação visual; o Project é a identidade (o
repo).

**cwd** — _apelido: "diretório"_
O diretório onde uma Session foi spawnada (`claude` roda ali). É a âncora que resolve o Project
e escopa o `--resume` no restart de uma Session.
_Evite_: tratar `cwd` e Project como sinônimos — o Project é a raiz git do `cwd`, não o `cwd`.

**Turn** — _apelido: "turno"_
Um incremento de trabalho do agente numa Session: abre no prompt do operador, reúne as edições
que o agente faz e fecha quando ele para (marcos vindos dos eventos `UserPromptSubmit` → `Stop`).
É o **átomo de review** — anda-se turn-a-turn, não por task nem por diff git acumulado. Carrega
o prompt que o abriu e seus Diffs (endereçáveis por Turn, arquivo e linha). Pode ter zero Diffs
(o agente só respondeu). Enquanto o agente não parou, o Turn está *aberto/em andamento*.
_Evite_: "task" ou "commit"/"diff git" como unidade de review — o átomo é o Turn.

**Review** — _apelido: "revisão"_
O layout full-width escopado a uma Session que o botão **"Ver diff"** abre, substituindo o Canvas.
Três painéis: um rail com os Turns da Session (esquerda), o leitor de Diffs do Turn selecionado
(centro) e o rail de Feedback (direita). É a tela/modo — o ato de olhar o código é "revisar".
_Evite_: usar "Review" (a tela) pro ato de revisar, e vice-versa.

**Diff** — _apelido: "diff"_
A mudança legível e com syntax-highlight de **um arquivo** dentro de um Turn; um Turn tem um Diff
por arquivo que tocou. Visto em dois modos: **per-turn** (só o incremento daquele Turn) ou
**accumulated** ("acumulado" — a mudança líquida somando os Turns até ali).
_Evite_: confundir com o diff git do working-tree — o produto revisa por Turn, não o estado atual
da árvore.

**Status** — _apelido: "status"_
O badge de um Node, sempre **derivado** (nunca setado à mão, exceto `done`). Combina um estado de
processo — **`generating`** (agente trabalhando), **`idle`** (parado no prompt, nada pendente) ou
**`blocked`** (esperando um prompt de permissão; precisa de você pra *continuar*) — com a flag
**`unreviewed`** sobreposta. **`done`** (concluído) é manual ou derivado de git, nunca auto-inferido.
_Evite_: "waiting-on-me" e "idle-at-prompt" (vagos) — use `blocked` (destravar o agente) e
`unreviewed` (revisar) separadamente; e não auto-inferir `done` do processo.

**Reviewed / unreviewed** — _apelido: "revisado / não revisado"_
Estado de um **Turn**, marcado (ou não) pelo operador como já revisado; persiste entre restarts,
pra você não perder o lugar. Um Node com qualquer Turn não revisado carrega a flag `unreviewed`
no Status.
_Evite_: tratar "revisado" como estado da Session inteira — é por Turn.

**Feedback** — _apelido: "feedback"_
Uma nota do operador ancorada numa linha (por Turn, arquivo e linha), com tag **`Quality`**
(limpeza/qualidade local) ou **`Architecture`** (decisão de design que se propaga). Deixar um
Feedback `Architecture` num Turn/linha é o que "flaguer" significa aqui. O envio de volta pro
Terminal da Session é diferido — no v1 o composer existe mas fica desabilitado (read-only).
_Evite_: "comentário" solto sem tag, e um ato "flag" separado — o flag é o Feedback `Architecture`.

**Cascade warning** — _apelido: "aviso de cascata"_
O aviso **derivado** que aparece num Turn quando ele constrói em cima de um Turn/linha marcado com
Feedback `Architecture` — pra você notar que a correção precisa se **propagar** pra frente. Feedback
`Quality` **não** dispara Cascade (é limpeza local, não se propaga).
_Evite_: tratar o Cascade como alerta de bug — é só sobre arquitetura se propagando pros Turns
seguintes, não caça-bug.

**Transcript** — _apelido: "transcript"_
O registro em disco (`.jsonl`) de uma Session — o histórico durável da conversa. É a fonte de
**fallback** do review (reconstruir os Turns quando não houve captura ao vivo); a fonte primária
é o fluxo de eventos ao vivo.
_Evite_: tratá-lo como fonte primária do review (é fallback), ou confundi-lo com a Session (a
Session é a identidade; o Transcript é o registro dela em disco).

**Operator** — _apelido: "operador", "você"_
O único humano que usa o app: revisa o código e conduz as Sessions. É um app pessoal, single-user.
_Evite_: falar de "usuários" no plural — não há multi-usuário.
