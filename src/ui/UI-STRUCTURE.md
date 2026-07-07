# UI-STRUCTURE.md — organização da UI

Padrão de organização de `src/ui/`. Não há router: a UI é uma tela única (o command
center). Regras de design de componente/estado estão em `REACT-PATTERNS.md`.

## Estrutura

- **`app.tsx` é só orquestração.** Segura o estado cross-cutting (projetos, foco,
  teclado global, overlays) e compõe subcomponentes. Quase nenhuma UI de detalhe nele.
- **`components/` guarda os componentes da tela.** Um por arquivo. Nomeados por domínio.
- **`-utils/` guarda hooks e funções locais.** Um hook por arquivo, nome do arquivo =
  nome do hook (`use-tab-groups.ts` → `useTabGroups`).
- **Domínio próprio com estado imperativo vira pasta em `src/core`.** O terminal (PTY +
  renderable + supervisor) mora em `src/core/terminal`, não em `components/`.
- **Constants locais** em `-utils/constants.ts`. Types compartilhados entre componentes
  em `types.ts`; types locais inline no arquivo que os usa.

## Componentes

- **Um componente por arquivo**, máximo ~200 linhas. Cresceu? Vira subpasta com
  `index.tsx` composto + filhos.
- **Arquivos em kebab-case** (`tab-bar.tsx`); o componente em si continua
  PascalCase (`TabBar`).
- **Prefixo de domínio no nome do componente**: tudo de projeto começa com `Project*`,
  de tab com `Tab*`, de terminal com `Terminal*`. O nome fica único fora de contexto.
- **Barrel namespaced**: o `components/index.ts` exporta um único objeto e `app.tsx`
  importa como namespace:

```ts
// components/index.ts
export const Ui = {
	ProjectSidebar,
	TerminalBody,
};
```

```tsx
// app.tsx
import { Ui } from "@ui/components";
// uso: <Ui.ProjectSidebar />, <Ui.TerminalBody />
```

Componentes irmãos importam uns aos outros direto por path alias; só `app.tsx` importa
pelo barrel.

> Exceção deliberada ao "no barrel files" do code-standards: é um objeto namespaced
> único da tela, não re-export solto.
