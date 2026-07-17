---
Status: accepted
---

# O terminal vivo é `@xterm/headless` pintado num `Renderable` do openTUI

O openTUI **não tem widget de terminal embutido** (verificado nos docs oficiais), então pra mostrar
o shell vivo no pane a gente emula um terminal: um `Bun.spawn({ terminal: {cols, rows, data} })`
(PTY nativo do Bun) alimenta uma instância de `@xterm/headless`, cujo screen buffer é **blitado
célula a célula** num `TerminalRenderable` custom (estende `Renderable`) via
`setCell(x,y,char,fg,bg,attributes)`; o `keyInput` do openTUI é encaminhado de volta pro PTY e o
`onResize` re-dimensiona ambos.

## Por quê

É a **única** opção que entrega o produto literal — sidebar + tabs + terminal vivo no MESMO frame,
por SSH. A correção vt100 (alt-screen, truecolor, cursor, mouse) vem de graça do `@xterm/headless`;
a gente escreve só o blit + o forward de input. O PTY é o nativo do Bun (`openpty()` no Linux, o
filho vê `isTTY:true`) — sem addon nativo, dispensa `@lydell/node-pty` de vez.

## Considered Options

- **tmux por baixo** — tmux vira dono do "chrome"; compor a sidebar por cima exige control-mode
  (`-CC`), específico e complexo.
- **Handoff (abrir o terminal fora do frame)** — mata a simultaneidade, que é o ponto do produto:
  sem terminal no frame não há ganho sobre ghostty+tmux.

## Consequences

- A gente é dona do loop de blit e do mapeamento de atributos (`@xterm/headless` → `TextAttributes`)
  e do encaminhamento de input/resize — é o maior risco técnico do pivot (validado por spike como
  fatia 1).
- Sem addon nativo no build; `TerminalTab` possui cada lifecycle de PTY/screen e `TabSupervisor`
  indexa as Tabs abertas.
