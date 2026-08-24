import type { Server } from "node:http";

function listenOn(server: Server, { port, host }: { port: number; host: string }): Promise<void> {
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, host, () => {
			server.removeListener("error", reject);
			resolve();
		});
	});
}

export const ServerListen = {
	on: listenOn,
};
