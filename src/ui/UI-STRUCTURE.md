# UI-STRUCTURE.md — organização da UI

`src/ui` adapta os owners de `src/core` ao openTUI React. Não existe router: o produto tem uma tela
de command center e uma tela de Review.

## Estrutura

- `app.tsx` mantém somente navegação visual e traduz comandos de teclado em intents dos owners.
- `components/` contém componentes nomeados por responsabilidade visual e domínio.
- `-utils/` contém adapters React, keymaps e funções locais com uma responsabilidade concreta.
- Estado imperativo, persistência e lifecycles de PTY/Session/Workspace pertencem a `src/core`;
  adapters React apenas acionam esses owners quando snapshots mudam.
- Types vivem com sua fonte. Não existe `types.ts` genérico nem barrel de componentes.

## Componentes

- Componentes simples ficam em um arquivo kebab-case.
- Uma feature com três ou mais componentes fortemente relacionados ganha uma pasta própria.
  A tela de Review vive em `components/review-screen/` (`review-screen`, `review-header`,
  `review-diff`, `review-diff-row`, `review-turn-list`, `review-turn-row`).
- A divisão segue responsabilidade visual, estado local ou comportamento repetido, nunca apenas
  quantidade de linhas.
- O componente raiz lê como composição; detalhes e estados vazios têm owners visuais nomeados.
- Imports são diretos. Componentes irmãos usam aliases de path, sem reexports intermediários.

## Estado

- Owners de core expõem snapshots observáveis; hooks React apenas assinam esses snapshots.
- Estado calculável é derivado no render.
- Estado local com variantes incompatíveis usa union discriminada.
- Effects existem somente para integrar APIs imperativas, subscriptions ou layout.
