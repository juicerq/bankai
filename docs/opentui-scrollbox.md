---
title: openTUI scrollbox layout trap; read before styling any <scrollbox>
tags: [ui]
updated_at: 2026-07-18
created_at: 2026-07-17
---

# openTUI scrollbox

## Layout de conteúdo nunca vai no style raiz do scrollbox

O `style` de `<scrollbox>` aplica no box raiz, que é `flexDirection: "row"` contendo `[wrapper | scrollbar vertical]`. Colocar `flexDirection: "column"` ou `gap` ali empilha a scrollbar vertical abaixo do conteúdo e ela passa a ser dimensionada pela altura inteira — o bug visual clássico da sidebar, que já reincidiu várias vezes. No `style` raiz ficam só props de dimensão do slot (`flexGrow`, `width`, `height`); `flexDirection`, `gap` e padding do conteúdo vão em `contentOptions` (prop direta do JSX, fora do `style`). Padding no style raiz é encaminhado pro content pela lib, mas os outros props de layout não são.

## Conteúdo grande encolhe os irmãos do scrollbox: header/footer precisam de `flexShrink: 0`

Quando o conteúdo do scrollbox estoura a altura disponível, ele infla a coluna pai e os irmãos encolhem via flex-shrink padrão. Um box de header/footer com `border: ["bottom"|"top"]` colapsa de 2 linhas pra 1 e a borda é desenhada POR CIMA do texto (`─Split──turn─`). O bug só aparece com diff grande — parece depender do modo/scope, mas depende do tamanho do conteúdo. Todo box de altura fixa irmão de um `flexGrow: 1` que contém scrollbox leva `flexShrink: 0`.

## `focused` só governa teclado; a roda vem por hit-test

`focused={true}` faz o scrollbox virar o renderable focado e receber `handleKeyPress` (`↑↓ j k pageup/down home/end`) do runtime — teclado é despachado pro foco. Já o scroll da roda entra por `onMouseEvent` (`event.type === "scroll"`), roteado pela posição do cursor e sem olhar `_focused`. Logo, a roda sobre um scrollbox rola ele mesmo sem foco, e não existe mudança a fazer pra "roda sem foco": basta o scrollbox estar renderado. Gate de teclado por foco não afeta a roda.
