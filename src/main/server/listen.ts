import type { Server } from "node:http";
import { SERVER_HOST } from "@shared/server";

export function listenLoopback(server: Server, port: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const fail = (err: NodeJS.ErrnoException) => {
			if (err.code === "EADDRINUSE") {
				reject(
					new Error(
						`Bankai cannot start: port ${port} on ${SERVER_HOST} is already in use. Free it or change the server port in settings.`,
					),
				);
				return;
			}

			reject(err);
		};

		server.once("error", fail);
		server.listen(port, SERVER_HOST, () => {
			server.removeListener("error", fail);
			resolve();
		});
	});
}
