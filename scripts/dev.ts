import { createServer } from "node:net";
import { SERVER_HOST } from "../src/shared/server";

const SERVER_DEV_PORT = 4700;
const RENDERER_DEV_PORT = 4800;
const PORT_SCAN_LIMIT = 50;

function portFree(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const probe = createServer();

		probe.once("error", () => resolve(false));
		probe.once("listening", () => probe.close(() => resolve(true)));
		probe.listen(port, SERVER_HOST);
	});
}

async function freePort(from: number): Promise<number> {
	for (let port = from; port < from + PORT_SCAN_LIMIT; port++) {
		if (await portFree(port)) {
			return port;
		}
	}

	throw new Error(`no free port between ${from} and ${from + PORT_SCAN_LIMIT - 1}`);
}

const serverPort = process.env.SERVER_PORT ?? String(await freePort(SERVER_DEV_PORT));
const rendererPort = process.env.RENDERER_PORT ?? String(await freePort(RENDERER_DEV_PORT));
const env = { ...process.env, SERVER_PORT: serverPort, RENDERER_PORT: rendererPort };

delete env.ELECTRON_RUN_AS_NODE;

console.log(`bankai dev: server ${SERVER_HOST}:${serverPort}, renderer ${SERVER_HOST}:${rendererPort}`);

const child = Bun.spawn(["bunx", "electron-vite", "dev"], { env, stdio: ["inherit", "inherit", "inherit"] });

process.exit(await child.exited);
