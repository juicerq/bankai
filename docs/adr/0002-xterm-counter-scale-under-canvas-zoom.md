---
Status: superseded
---

> **Superseded** pelo pivot Electron → openTUI: não há mais
> Canvas nem zoom, e o terminal deixou de ser um `@xterm/xterm` no DOM sob React Flow — virou
> `@xterm/headless` blitado num `FrameBufferRenderable` (ver ADR 0005). O problema de counter-scale
> sob zoom não existe num grid de terminal. Mantido por registro histórico.

# Terminais xterm anulam o scale do canvas (counter-scale) e mantêm grid fixo no zoom

O React Flow aplica `translate + scale(zoom)` no viewport, mas o xterm.js mapeia
`clientX/clientY` → célula sem compensar scale de ancestral: com `zoom != 1`, clique e
hover caem na célula errada (o alvo real fica abaixo/à direita do visual). Decidimos
envolver cada terminal num wrapper com `scale(1/zoom)` e dimensões × zoom — o xterm opera
em escala líquida 1 e o hit-testing fica exato — com `fontSize × zoom` para preservar o
tamanho visual (e ganhar texto nítido em zoom-out, em vez do raster borrado do scale CSS).

## Consequences

- O re-render (fontSize novo) acontece só quando o gesto de zoom termina; durante o gesto
  vale o scale CSS borrado — mesmo padrão do pinch nativo do browser. Não tornar contínuo:
  re-layout do xterm a 60fps com N terminais vivos causa stutter.
- `cols × rows` do pty são **fixos sob zoom**: `fit()` não roda em mudança de zoom (a célula
  não escala com precisão de px; ±1 coluna dispararia `pty.resize` espúrio e a TUI da sessão
  redesenharia inteira a cada passo de zoom). `pty.resize` só em resize real do node. Não
  "simplificar" removendo o wrapper nem reintroduzir fit-on-zoom — ambos reabrem o bug.
