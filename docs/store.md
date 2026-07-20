---
title: Store data dir facts; read before running tests outside vitest or debugging store version errors
tags: [store]
updated_at: 2026-07-17
created_at: 2026-07-17
---

# Store

## `bun test` direto polui o store real

O isolamento de `DATA_DIR` vive em `tests/setup.ts`, carregado só pelo `setupFiles` do vitest. Rodar `bun test` (runner do Bun) executa os mesmos arquivos sem o setup e grava fixtures em `~/.local/share/bankai/store/` — foi assim que projetos `A`/`B`/`C` apareceram na sidebar. `resolveDataDir` agora lança sob `NODE_ENV=test` sem `DATA_DIR`, então `bun test` falha alto em vez de poluir. Testes rodam via `bun run test`.

## Arquivo de store com versão maior que o código

`Store.readNow` recusa arquivo cuja versão do envelope é maior que a do código — acontece quando uma sessão com schema não commitado (versão bumpada) gravou o arquivo. Os stores de review (`reviewProjections`) são projeções derivadas dos transcripts: mover o arquivo pra fora resolve e o app re-projeta sozinho.
