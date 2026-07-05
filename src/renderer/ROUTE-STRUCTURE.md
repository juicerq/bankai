# ROUTE-STRUCTURE.md — organização de rotas do renderer

Padrão de organização das rotas em `src/renderer/src/routes/` (TanStack Router file-based).
Regras de design de componente/estado estão em `REACT-PATTERNS.md`.

## Estrutura

- **Pasta por rota espelhando a URL.** O arquivo da rota é o `index.tsx` dela.
- **`-components/` dentro da rota** — componentes que só aquela página usa. O prefixo `-`
  faz o TanStack Router ignorar a pasta. Nunca vazam pra fora da rota.
- **`-utils/` dentro da rota** — hooks e funções locais da página. Um hook por arquivo,
  nome do arquivo = nome do hook (`use-resizing.ts` → `useResizing`).
- **Compartilhado entre rotas vai pra `@renderer/components`.** Usado por mais de uma
  rota → global; detalhe de uma página → `-components/` dela.
- **Constants locais** em `-utils/constants.ts`. Types locais inline no `index.tsx`,
  junto do schema. Pastas `-types/`/`-constants/` só quando acumular de verdade.

## Arquivo da rota (`index.tsx`)

Ordem fixa, com marcadores em comentário:

```tsx
// SCHEMA            ← search params (se houver), com type inferido do lado
// ROUTE             ← createFileRoute(...)
// ROUTE MAIN COMPONENT  ← o componente da página
```

O componente da página é **só orquestração**: chama hooks e compõe subcomponentes.
Quase nenhuma UI de detalhe nele.

## Componentes

- **Um componente por arquivo**, máximo ~200 linhas. Cresceu? Vira subpasta com
  `index.tsx` composto + filhos.
- **Arquivos em kebab-case** (`session-node.tsx`); o componente em si continua
  PascalCase (`SessionNode`).
- **Prefixo de domínio no nome do componente**: tudo do canvas começa com `Canvas*`,
  de sessão com `Session*`. O nome fica único fora de contexto.
- **Barrel namespaced**: o `-components/index.ts` exporta um único objeto e a rota
  importa como namespace:

```ts
// -components/index.ts
export const CanvasComponents = {
	Root: CanvasRoot,
	Toolbar: CanvasToolbar,
};
```

```tsx
// index.tsx da rota
import { CanvasComponents as Components } from "./-components";
// uso: <Components.Root>, <Components.Toolbar />
```

> Exceção deliberada ao "no barrel files" do code-standards: é um objeto namespaced
> único por rota, não re-export solto.
