# REACT-PATTERNS.md — design de componentes e estado

Regras de design React do renderer. Estrutura de pastas/rotas está em `ROUTE-STRUCTURE.md`.
A proibição de `useEffect` está no `AGENTS.md` — vale antes de tudo aqui.

## Estado

- **Estado que dá pra calcular não vira estado.** Se deriva de props/query durante o
  render (`const total = items.length`), não cria `useState` espelho.
- **Estado do servidor nunca vira `useState`.** Dado de oRPC/TanStack Query vive na
  query; não se copia pra estado local. Cache é a fonte, invalidação é a atualização.
- **Estados impossíveis devem ser impossíveis.** Nada de `isLoading` + `isError` +
  `data` soltos permitindo combinações absurdas: use os status da própria query ou um
  discriminated union, e faça branch com `switch`/early return.
- **Estado mora no componente mais fundo possível.** Só sobe quando dois irmãos
  precisam dele. Nada de concentrar tudo no topo da página "pra garantir".
- **Context é último recurso.** Só pra coisa realmente transversal (tema, viewport do
  canvas). Se dá pra passar por prop em 1–2 níveis, passa por prop.

## Componentes

- **Composição em vez de boolean props.** Quando um componente ganha `isCompact`,
  `showHeader`, `variant`, `withBorder`… é hora de quebrar em componentes compostos ou
  aceitar `children`, não de somar flags.
- **Early return pra loading/vazio/erro.** `if (!data) return <Skeleton />` no topo,
  em vez de ternário aninhado no JSX.
- **`key` estável em listas** — id do dado, nunca o index do array.

## Performance

- **Sem `useMemo`/`useCallback`/`memo` preventivos.** Só com problema medido.
  Código limpo primeiro; React 19 + compiler cobre a maioria dos casos.
