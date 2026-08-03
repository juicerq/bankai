const TOKEN_REVOKED_CLOSE_CODE = 4001;

interface LiveConnection {
	close(code?: number, reason?: string): void;
	once(event: "close", listener: () => void): unknown;
}

const live = new Set<LiveConnection>();

function trackLiveConnection(socket: LiveConnection): void {
	live.add(socket);
	socket.once("close", () => {
		live.delete(socket);
	});
}

function closeLiveConnections(): void {
	for (const socket of live) {
		socket.close(TOKEN_REVOKED_CLOSE_CODE, "server token regenerated");
	}

	live.clear();
}

export const LiveConnections = {
	track: trackLiveConnection,
	closeAll: closeLiveConnections,
};
