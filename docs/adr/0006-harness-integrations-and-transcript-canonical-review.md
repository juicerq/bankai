---
Status: accepted
Supersedes: 0003
Refines: 0004
---

# Harness integrations com Review canônica pelo Transcript

bankai suporta Claude Code e Codex TUI como Harnesses interativos. Cada integração é composta por
capacidades independentes de descoberta, ingestão de Transcript e launch. O registro é estático e
embutido; não existe sistema de plugins ou configuração de Harness pelo usuário.

O Transcript nativo é a única fonte canônica dos Turns e Diffs. Um projetor persistente consome
apenas registros completos, mantém o offset de bytes e snapshots normalizados e retoma do último
offset confirmado. Somente mudanças estruturadas e explicitamente atribuídas pelo Harness entram na
Review. Interações sem mudança de arquivo e escritas opacas de shell não criam Turns.

## Por quê

Hooks globais acoplavam o produto ao Claude Code, alteravam configuração fora do bankai e não
permitiam paridade com outro Harness. Ambos os Harnesses já mantêm um log estruturado que pode ser
projetado incrementalmente sem duplicar a autoria no working tree.

A Session é identificada por `{ harness, sessionId }`. O vínculo da Tab escolhe somente o Harness
interativo que possui o foreground do terminal. Uma captura vinculada guarda a Session uma única vez
e só carrega os metadados de execução enquanto o processo está vivo. Quando o shell recupera o
foreground, a Tab conserva a Session para Review e remove esses metadados, impedindo que processos
antigos ou em background sejam restaurados.

## Consequences

- bankai não instala hooks nem modifica configurações globais do Claude Code.
- Status é `active` somente quando há trabalho aberto no Transcript e o processo continua vivo.
- Um Turn ativo aparece ao vivo, mas só pode ser marcado após conclusão ou interrupção.
- Restauração retoma somente capturas com metadados de execução; uma Session encerrada restaura
  apenas o shell e preserva sua Review.
- Resume e fresh launch pertencem à integração e nunca trocam silenciosamente de Harness.
- Falha ao localizar Transcripts em uma integração não impede o boot nem afeta outros Harnesses;
  as Sessions daquela integração restauram apenas seus shells até a localização voltar a funcionar.
- A descoberta continua Linux-only por depender de `/proc`, agora com posse do foreground e
  validação do início do processo contra reciclagem de PID.
- Codex Desktop, app-server, `exec`, `review`, cloud e processos auxiliares ficam fora do escopo.
- Para um patch estruturado sem snapshot completo, a integração só usa o arquivo materializado como
  contexto se todos os hunks do Transcript casarem exatamente. Ela reverte os patches em ordem para
  persistir snapshots completos; qualquer divergência torna a Review indisponível, sem atribuição parcial.
- Se dois snapshots confirmados do mesmo arquivo não forem contínuos, cada mudança permanece separada
  e o acumulado as apresenta em ordem; bankai não atribui a um Harness a diferença opaca entre elas.
