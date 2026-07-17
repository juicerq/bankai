---
Status: superseded by 0006
---

# Vínculo Claude-only por inspeção de `/proc/<pid>/fd`

Esta ADR registra a decisão original. A arquitetura atual está em 0006: descoberta pertence a cada
Harness, o binding seleciona apenas a Session interativa no foreground e a Tab conserva a última
Session qualificada quando o shell recupera o foreground.

Como a Tab é um shell cru e o `claude` roda como filho dela, o app descobre **qual Session/`.jsonl`
pertence a cada Tab** lendo `/proc/<pid-claude>/fd/`: o app é dono do PTY da Tab (sabe o PID do
shell), acha o `claude` filho e o `.jsonl` que ele mantém aberto revela o `--session-id` exato.
É determinístico **mesmo com N sessões `cc` no mesmo `cwd`** — o cenário garantido do operador.

## Por quê

O operador roda com frequência duas sessões `cc` no mesmo diretório, e nenhuma alternativa sem
instrumentar o `cc` resolve isso sem ambiguidade. O `/proc` fd dá o vínculo exato sem tocar no `cc`
(zero dependência externa que quebra ao trocar de máquina/dotfile).

## Considered Options

- **Env `CC_SESSION_ID` + alias `cc`** — dependência externa da TUI, quebra em silêncio ao trocar
  de máquina ou editar o dotfile.
- **Vigiar a pasta e ligar o `.jsonl` novo à Tab ativa** — ambíguo justamente no multi-sessão
  mesmo-`cwd`, que é o uso real.

## Consequences

- **Linux-only** (`/proc`) — não-problema: o app já é Linux e o uso por SSH mira Linux.
- Um **poll leve de processos** pra manter o vínculo atualizado.
- A limitação de escolher o transcript mais recente depois da saída motivou a retenção explícita da
  última Session adotada em 0006.
