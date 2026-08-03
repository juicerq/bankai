import type { Server } from "node:http";

export function listenOn(server: Server, { port, host }: { port: number; host: string }): Promise<void> {
	return new Promise((resolve, reject) => {
		const fail = (err: NodeJS.ErrnoException) => {
			if (err.code === "EADDRINUSE") {
				reject(
					new Error(
						`Bankai cannot start: port ${port} on ${host} is already in use. Free it or change the server port in settings.`,
					),
				);
				return;
			}

			reject(err);
		};

		server.once("error", fail);
		server.listen(port, host, () => {
			server.removeListener("error", fail);
			resolve();
		});
	});
}
