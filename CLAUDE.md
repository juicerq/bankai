# Development data

Development must use its own Bankai Dev data, never production Bankai data. To run more than one development instance, give each instance a different `DATA_DIR`.

Start dev as `bun run dev`: `scripts/dev.ts` picks the first free server port from 4700 and renderer port from 4800, so the installed app and other dev instances never collide. Set `SERVER_PORT` or `RENDERER_PORT` to pin a port; the `dev-server-port` Fieldbook document has the rest.
