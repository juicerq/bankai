---
title: Traps in the review screen internals; read before changing ReviewDiff structure or diff scrolling
tags: [review, ui]
updated_at: 2026-07-17
created_at: 2026-07-17
---

# Review screen

Todos os componentes da tela vivem em `src/ui/components/review-screen/`: `review-screen`, `review-header`, `review-diff`, `review-diff-row`, `review-turn-list` e `review-turn-row`.

## O scroll anchor depende da ordem dos filhos do file box

`use-scroll-anchor.ts` assume exatamente um header antes das linhas do diff em cada file box do `ReviewDiff` (`getChildren()[rowIndex + 1]`). Adicionar ou remover um filho quebra o anchoring de unified/folded em silêncio.
