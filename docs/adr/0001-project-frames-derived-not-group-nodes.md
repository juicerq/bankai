---
Status: superseded
---

> **Superseded** pelo pivot Electron → openTUI (grill `pivot-opentui-tui-06072026`): o Canvas, os
> Frames e os Nodes deixaram de existir e Project virou entidade **explícita e persistida** (o
> operador adiciona na sidebar; não mais derivada da raiz git). Não há ADR sucessor — o conceito
> de moldura/agrupamento derivado foi removido. Mantido por registro histórico.

# Molduras de Project são bounding boxes derivadas, não group nodes do React Flow

As molduras tracejadas que agrupam os Nodes de um mesmo Project no Canvas são um retângulo
**derivado** — calculado a cada render como a bounding box dos Nodes que compartilham o mesmo
`project` (a raiz do repo git via `git rev-parse --show-toplevel`) — e **não** um group node do
React Flow (`parentId` + `extent: 'parent'`). A moldura é uma consequência visual do
agrupamento; ela nunca decide a pertença.

## Por quê

A pertença de um Node a um Project é definida pelo **cwd/repo**, e é imutável: você não muda o
repo de um card arrastando-o pela tela. O group node do React Flow modela exatamente o
contrário — *containment espacial*: arrastar um card pra dentro da caixa o torna filho dela.
Adotá-lo faria "arrastar o card do repo A pra cima da moldura do repo B" transformá-lo num card
de B, contradizendo a regra do produto (agrupamento é por repo). Derivar a moldura da bounding
box mantém as posições absolutas dos Nodes (que o store já persiste), faz a moldura sumir
sozinha quando o último Node do Project encerra, e não exige nada novo no store.

## Consequências

- Ganhamos: zero coordenada relativa, zero lógica de reparenting, e a moldura sempre correta
  (é a caixa dos membros reais do Project).
- Abrimos mão de: "arrastar a moldura move todos os cards juntos" e o clamp automático dos
  filhos dentro do pai — que o group node daria de graça. Se algum dia isso for desejado, será
  reintroduzido explicitamente, não herdado do containment espacial.
- O frame é renderizado como um node `type: 'frame'` presentacional (zIndex abaixo dos cards,
  corpo `pointer-events: none`), recomputado ao vivo a partir do estado `nodes` do React Flow.
