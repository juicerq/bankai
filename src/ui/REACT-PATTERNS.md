# REACT-PATTERNS.md — design de componentes e estado

Regras de design React da UI. Estrutura de pastas está em `UI-STRUCTURE.md`.
A proibição de `useEffect` está no `AGENTS.md` — vale antes de tudo aqui.

## Estado

- **Estado que dá pra calcular não vira estado.** Se deriva de props/estado durante o
  render (`const activeProject = projects[activeIndex]`), não cria `useState` espelho.
- **Dado persistido carrega antes do render.** O Store (disco) é lido no `index.tsx`
  antes do primeiro render e entra por prop. Depois de uma mutação, a operação devolve o
  novo valor e o dono desse estado re-renderiza — ninguém mantém uma segunda fonte.
- **Estados impossíveis devem ser impossíveis.** Nada de flags soltas permitindo
  combinações absurdas: use um discriminated union e faça branch com `switch`/early return.
- **Estado mora no componente mais fundo possível.** Só sobe quando dois irmãos
  precisam dele. Teclado global e foco entre painéis são cross-cutting: moram no topo.
- **Context é último recurso.** Se dá pra passar por prop em 1–2 níveis, passa por prop.

## Componentes

- **Composição em vez de boolean props.** Quando um componente ganha `isCompact`,
  `showHeader`, `variant`, `withBorder`… é hora de quebrar em componentes compostos ou
  aceitar `children`, não de somar flags.
- **Early return pra vazio/erro.** `if (!project) return <Empty />` no topo, em vez de
  ternário aninhado no JSX.
- **`key` estável em listas** — id do dado, nunca o index do array.

## Performance

- **Sem `useMemo`/`useCallback`/`memo` preventivos.** Só com problema medido.
  Código limpo primeiro; React 19 + compiler cobre a maioria dos casos.
