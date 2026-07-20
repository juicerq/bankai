---
Status: accepted
Refines: 0006
---

# Companion do Pi com autoria no Transcript nativo

Pi é uma Harness integration estática de primeira classe. A integração preserva o JSONL nativo do
Pi como única fonte canônica da Review, mas usa uma companion extension porque o formato nativo não
expõe vínculo determinístico entre processo e Session nem o conteúdo anterior sobrescrito por
`write`.

A companion só ativa em processos Pi interativos dentro de terminais do bankai. Ela publica evidência
efêmera de binding entre PID, início do processo, Session ID e caminho do JSONL, e anexa ao próprio
JSONL registros custom versionados de elegibilidade, prompt entregue, mudança estruturada, conclusão
ou incapacidade segura. O registro efêmero não contém eventos de Review e não constitui outro store.

Cada registro de Review carrega a Session nativa que o originou. Pi copia registros custom ao criar
forks e clones; a projeção aceita um registro somente quando sua origem coincide com o ID do header
do JSONL corrente. Assim, trabalho herdado não vira Turn novo e Reviewed permanece escopado à
Session original.

A companion observa somente as tools nativas `write` e `edit` e registra snapshots exatos de antes e
depois. `bash`, shell do operador e tools com outros nomes continuam opacos. Se outra extensão é dona
de `write` ou `edit`, o bankai não a substitui: mantém binding, Status e resume, mas torna a Review da
Session indisponível com motivo explícito. Qualquer evidência incompleta ou estruturalmente insegura
falha fechado para a Session inteira.

## Instalação e compatibilidade

A instalação é consentida pelo Operator através de `bankai setup pi`. O comando valida a instalação
do Pi e cria um symlink no diretório global de extensions para o artefato entregue com o próprio
bankai. Não há pacote companion, versão independente, daemon, socket ou monitor de health em
runtime. Fora de um terminal bankai, a extension carregada permanece inativa.

Review completa existe somente para Sessions criadas com uma companion compatível ativa. Sessions
históricas não recebem backfill. `pi --no-session`, modos não interativos e `--session-dir` específico
de uma invocação não produzem Session no bankai.

## Navegação e restauração

`/tree` conserva o ID nativo e, portanto, a mesma Review cronológica; navegar na conversa não restaura
o working tree nem apaga mudanças que ocorreram. `/fork` e `/clone` criam outra Session e outra
Review quando o Pi cria um novo ID. O bankai não modela linhagem nem replica a navegação do Pi; uma
Review anterior volta a ser a Review da Tab quando o Operator usa `/resume` para aquela Session.

A Tab e o Workspace acompanham a Session corrente mesmo quando o Pi troca de Session sem trocar de
processo. Restauração do Pi usa somente `pi --session <sessionId>`; argv adicional não é persistido
nem reconstruído.

## Consequences

- Pi iniciado manualmente numa Tab tem a mesma integração que Pi iniciado pelo bankai.
- O prompt da Review é o texto efetivamente digitado, antes da expansão de skills e templates;
  steering e follow-up só abrem Turn quando entregues.
- A companion não altera o conteúdo enviado ao modelo nem renderiza seus registros no Pi.
- A disponibilidade da Review passa a carregar motivos estruturados em vez de apenas um booleano.
- O registro de Harness permanece estático; não nasce framework genérico de companions.
- O setup explícito é a única operação autorizada a modificar a configuração global do Pi.
