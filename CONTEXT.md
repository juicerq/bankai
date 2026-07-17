# bankai — Contexto

bankai é uma TUI de terminal (openTUI, Linux, um processo Bun) pra revisar o código que
agentes de coding escrevem. Uma **sidebar** de **Projects** à esquerda; à direita, **Tabs** de
terminais e o corpo com o terminal vivo. O operador roda um Harness (`claude` ou Codex) num
terminal cru e abre uma **Review** turn-a-turn de qualquer **Session**. Este glossário fixa a
linguagem do produto.

> **Convenção de idioma.** O nome de cada termo (headword) é o identificador que já vive no
> código / nos Harnesses, em inglês. Descrições em pt-br. Quando a UI ou a conversa usam outra
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
hospeda zero, uma ou várias **Sessions** (o operador roda um agente, sai, roda de novo).
_Evite_: tratar Tab como Session — a Tab é o shell onde você digita; a Session é a conversa do agente
que roda dentro dela. Uma Tab sem agente rodando não tem Session.

**Session binding** — _apelido: "vínculo Tab↔Session"_
O reconhecimento automático que associa uma Tab à Session interativa que o operador está dirigindo
e conserva a última associação quando ele volta ao shell. Uma Tab não tem Harness escolhido ou
configurado pelo operador; sem evidência de uma Session, ela segue sendo só um terminal.
_Evite_: tratar o Harness como propriedade da Tab — ele é reconhecido na Session que a Tab hospeda.

**Session** — _apelido: "sessão"_
A identidade persistente de uma conversa interativa de um agente de coding, hospedada numa Tab e
unidade de review. Sobrevive ao processo quando sua **Harness integration** consegue retomá-la; a
review de uma Tab mira a Session atual ou última dela.
_Evite_: confundir Session com a Tab que a hospeda, ou com o processo do agente vivo.

**Harness** — _apelido: "runtime do agente"_
O produto que hospeda e conduz agentes de coding, como Claude Code ou Codex.
_Evite_: Agent — uma Session pode envolver vários agentes ou subagentes dentro do mesmo Harness.

**Harness integration** — _apelido: "integração do harness"_
A fonte de verdade que permite ao bankai reconhecer e trabalhar com Sessions de um Harness, conforme
as capacidades que ele expõe.
_Evite_: chamar cada integração de "provider" — o termo esconde sua responsabilidade no produto.

**Session ref** — _apelido: "referência da sessão"_
A identidade que o bankai usa para endereçar uma Session: o **Harness** dela e o identificador nativo
que esse Harness atribuiu à conversa. O identificador nativo nunca é global fora da sua integração.
_Evite_: persistir ou comparar o `sessionId` nativo sozinho.

**cwd** — _apelido: "diretório"_
O diretório de um Project, onde suas Tabs (e o Harness dentro delas) rodam. Pode escopar a retomada
de uma Session, conforme o Harness.
_Evite_: tratar `cwd` e Project como sinônimos — o Project é a entidade da sidebar (cwd + nome +
ordem); o `cwd` é só o diretório.

**Turn** — _apelido: "turno"_
Um incremento de trabalho do agente numa Session que altera ao menos um arquivo: reúne sob o prompt
do operador as edições registradas até a conclusão ou interrupção. É o **átomo de review** — anda-se
turn-a-turn, não por task nem por diff git acumulado. Carrega o prompt que o abriu e seus Diffs
endereçáveis por Turn, arquivo e linha; uma interação sem mudanças não produz um Turn.
_Evite_: "task" ou "commit"/"diff git" como unidade de review — o átomo é o Turn.

**Review** — _apelido: "revisão"_
O modo **tela cheia focada**, escopado a uma Session, que esconde a sidebar + as Tabs e dá duas
áreas: o rail com os Turns da Session e o leitor de Diffs do Turn selecionado. `ESC` volta pro
terminal, que nunca pausou — é alternar entre "dirigir" e "ler" a mesma Session. É a tela/modo —
o ato de olhar o código é "revisar".
_Evite_: usar "Review" (a tela) pro ato de revisar, e vice-versa; e imaginar a Review in-pane — ela
toma a tela inteira de propósito (largura é o recurso escasso no terminal e por SSH).

**Diff** — _apelido: "diff"_
A mudança estruturada que o Transcript atribui a **um arquivo** dentro de um Turn, legível e com
syntax-highlight. Mudanças descontínuas no mesmo arquivo permanecem Diffs separados para não
inventar continuidade. Visto em dois modos: **per-turn** (só o incremento daquele Turn) ou
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
O badge de uma Session, sempre **derivado**. Combina a atividade
observada no Transcript e a existência do processo — **`active`** (trabalho aberto numa Session viva)
ou **`idle`** (nenhum trabalho aberto ou Session encerrada) — com a flag **`unreviewed`** sobreposta.
_Evite_: inferir que `active` significa que o agente está gerando — ele também pode estar aguardando
o operador.

**Reviewed / unreviewed** — _apelido: "revisado / não revisado"_
Estado de um **Turn**, marcado (ou não) pelo operador como já revisado; persiste entre restarts,
pra você não perder o lugar. Um Turn ativo permanece `unreviewed` e só pode ser marcado após sua
conclusão ou interrupção; uma Session com qualquer Turn não revisado carrega a flag `unreviewed` no
Status.
_Evite_: tratar "revisado" como estado da Session inteira — é por Turn.

**Transcript** — _apelido: "transcript"_
O registro em disco de uma Session — o histórico durável da conversa e a fonte canônica da Review.
O bankai o observa enquanto cresce para atualizar Turns, Diffs e Status; cada Harness define seu
formato e como localizar o arquivo.
_Evite_: confundir Transcript com a Session — a Session é a identidade; o Transcript é o registro
dela em disco.

**Workspace** — _apelido: "espaço de trabalho"_
O arranjo do app inteiro num instante, persistido pra reabrir 1:1 no outro dia: quais Projects
estão abertos, as Tabs de cada um (e sua ordem), o foco (que Project, que Tab, sidebar vs terminal),
a tela (command center ou Review) e o fullscreen — e, por Tab que dirigia uma Session interativa
viva, o comando do Harness capturado (argv real) para tentar retomá-la quando seu Transcript for
localizável. É **um só**
e é do Operator (não se cria nem se nomeia vários); espelha o estado corrente continuamente (não é um
snapshot no exit). Restaurar = reabrir o Workspace.
_Evite_: confundir Workspace com **Project** (uma entrada da sidebar) ou com **Session** (a conversa
de um Harness que uma Tab dirige) — o Workspace é o arranjo que contém ambos; e não chamá-lo de "snapshot"
(sugere foto no exit) nem "layout" (sugere só o visual, mas ele guarda também o que cada Tab reata).

**Operator** — _apelido: "operador", "você"_
O único humano que usa o app: revisa o código e conduz as Sessions. É um app pessoal, single-user.
_Evite_: falar de "usuários" no plural — não há multi-usuário.
