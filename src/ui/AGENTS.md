# AGENTS.md — src/ui

## Guias obrigatórios

- `UI-STRUCTURE.md` — organização da UI (`components/`, `-utils/`, barrel namespaced, kebab-case, um componente por arquivo). Ler antes de criar ou mexer em qualquer componente.
- `REACT-PATTERNS.md` — design de componentes e estado. Ler antes de escrever qualquer componente.

## useEffect

- `useEffect` é proibido em código novo para derivar estado, reagir a evento ou buscar dados.
- Exceções legítimas: integração com API imperativa como focus, o PTY, o renderable do terminal, teclado global ou event emitter externo.
