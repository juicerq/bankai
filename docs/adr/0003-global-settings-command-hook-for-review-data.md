---
Status: superseded by 0006
---

# Dados da Review vêm de um hook `command` persistente no `~/.claude/settings.json` global

Com o pivot pro terminal, o pane virou um **shell cru** (o operador digita `cc`), então a injeção
de `--session-id`/`--settings`/hooks que a `SessionSupervisor` fazia no spawn deixou de existir.
Mesmo assim mantivemos os **hooks ao vivo como fonte primária** da Review (transcript segue
fallback): o app **auto-instala e mantém (merge idempotente)** um hook `command` no
`~/.claude/settings.json` **global**, rodando `curl --max-time 0.2 <localhost:porta-fixa> || true`
contra o `HookGateway` local.

## Por quê

Um hook global dispara pra **toda** sessão `cc` da máquina sem instrumentar o spawn — recupera de
graça o status completo ao vivo (`generating`/`idle`/`blocked`) e preserva quase todo o backend
(`HookGateway`, `ReviewModel`, `TranscriptBackfill` como fallback). O mecanismo é `command`+curl e
não `type:http` porque `type:http` tem timeout padrão de **600s**: se o app pendurar, travaria o
claude até 10min por evento; o `curl --max-time 0.2 … || true` falha em ~200ms e **nunca** degrada
a sessão. Porta fixa + `localhost` deixam a linha idêntica em toda máquina (seguro ao sincronizar
`~/.claude` entre PCs); sem o app rodando o hook é **inerte**.

## Considered Options

- **Transcript `.jsonl` como fonte primária** (sem hooks) — funciona, mas perde `blocked`/status ao
  vivo e joga fora backend que sobrevive de graça.
- **`type:http` global** — mesmo alcance, mas o timeout de 600s pode travar o claude por 10min por
  evento se o app pendurar.
- **Injeção no spawn via `--settings`** — o "shell cru" removeu; reintroduz o acoplamento que o
  pivot corta.

## Consequences

- O app faz uma **modificação persistente na config global do claude** do operador (merge
  idempotente, não-destrutivo dos hooks existentes) — não uma injeção efêmera por sessão.
- O hook dispara pra **toda** sessão `cc` da máquina, inclusive fora da TUI: essas sessões são
  review-áveis mas não ficam vinculadas a uma Tab.
- A dependência inverte vs um alias `cc` mantido pelo operador: aqui o recurso depende do app estar
  presente (sempre verdade ao usar o app), não de um dotfile frágil.
