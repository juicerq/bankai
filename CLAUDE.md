# Development data

Development must use its own Bankai Dev data, never production Bankai data. To run more than one development instance, give each instance a different `DATA_DIR`.

Start dev as `SERVER_PORT=4700 bun run dev` whenever the installed app may be running, since both take 4696 by default; the `dev-server-port` Fieldbook document has the rest.
