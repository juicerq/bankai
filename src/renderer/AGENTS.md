# AGENTS.md — src/renderer

## useEffect

- `useEffect` é proibido em código novo para derivar estado, reagir a evento ou buscar dados.
- Exceções legítimas: integração com API imperativa como focus, scroll, canvas, WebSocket ou event emitter externo. Comentar o WHY nesses casos.
