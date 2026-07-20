---
title: Traps do domínio git (scopes e refresh watcher); ler antes de mexer em polling ou fingerprint de repositório
tags: [git]
updated_at: 2026-07-17
created_at: 2026-07-17
---

# Git

## `git status` puro reescreve o `.git/index`

Um `git status` sem flags dá refresh no index e o REESCREVE em disco — qualquer watcher baseado em mtime do `.git/index` dispara a si mesmo a cada tick. O `gitRefreshWatcher` usa `git --no-optional-locks status --porcelain -z` por isso; o fingerprint é `rev-parse HEAD` + esse status (HEAD pega commit com árvore limpa, status pega edição de working tree e staging). Não voltar pra mtime.

## Degradação do scope `branch` não tem caso especial

Na branch default, `merge-base HEAD <default>` == HEAD, então a base do `branch` vira HEAD sozinha — a degradação pra `uncommitted` sai de graça do algoritmo. Se aparecer um `if` especial pra isso, é sinal de regressão.
