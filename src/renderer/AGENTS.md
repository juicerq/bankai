# AGENTS.md — src/renderer

## Guias obrigatórios

- `ROUTE-STRUCTURE.md` — organização de rotas (`-components/`, `-utils/`, barrel namespaced, kebab-case). Ler antes de criar ou mexer em qualquer rota.
- `REACT-PATTERNS.md` — design de componentes e estado. Ler antes de escrever qualquer componente.

## useEffect

- `useEffect` é proibido em código novo para derivar estado, reagir a evento ou buscar dados.
- Exceções legítimas: integração com API imperativa como focus, scroll, canvas, WebSocket ou event emitter externo. Comentar o WHY nesses casos.
