import { contextBridge, ipcRenderer } from "electron";
import {
	PTY_DATA,
	PTY_EXIT,
	PTY_INPUT,
	PTY_RESIZE,
	type PtyBridge,
	type PtyData,
	type PtyExit,
} from "@shared/pty";
import {
	REVIEW_CHANGED,
	type ReviewBridge,
	type ReviewChanged,
} from "@shared/review";

window.addEventListener("message", (event) => {
	if (event.source !== window) return;
	if (event.data !== "start-orpc-client") return;

	const [port] = event.ports;
	if (!port) return;

	ipcRenderer.postMessage("start-orpc-server", null, [port]);
});

const dataCallbacks = new Map<string, Set<(chunk: string) => void>>();
const exitCallbacks = new Map<string, Set<(exitCode: number) => void>>();

ipcRenderer.on(PTY_DATA, (_e, msg: PtyData) => {
	const set = dataCallbacks.get(msg.sessionId);

	if (!set) {
		return;
	}

	for (const cb of set) {
		cb(msg.chunk);
	}
});

ipcRenderer.on(PTY_EXIT, (_e, msg: PtyExit) => {
	const set = exitCallbacks.get(msg.sessionId);

	if (!set) {
		return;
	}

	for (const cb of set) {
		cb(msg.exitCode);
	}
});

function subscribe<T>(
	map: Map<string, Set<T>>,
	sessionId: string,
	cb: T,
): () => void {
	let set = map.get(sessionId);

	if (!set) {
		set = new Set();
		map.set(sessionId, set);
	}

	set.add(cb);

	return () => {
		set.delete(cb);

		if (set.size === 0) {
			map.delete(sessionId);
		}
	};
}

const bridge: PtyBridge = {
	onData: (sessionId, cb) => subscribe(dataCallbacks, sessionId, cb),
	onExit: (sessionId, cb) => subscribe(exitCallbacks, sessionId, cb),
	input: (sessionId, data) => ipcRenderer.send(PTY_INPUT, { sessionId, data }),
	resize: (sessionId, cols, rows) =>
		ipcRenderer.send(PTY_RESIZE, { sessionId, cols, rows }),
};

contextBridge.exposeInMainWorld("pty", bridge);

const reviewCallbacks = new Set<(sessionId: string) => void>();

ipcRenderer.on(REVIEW_CHANGED, (_e, msg: ReviewChanged) => {
	for (const cb of reviewCallbacks) {
		cb(msg.sessionId);
	}
});

const reviewBridge: ReviewBridge = {
	onChanged: (cb) => {
		reviewCallbacks.add(cb);
		return () => {
			reviewCallbacks.delete(cb);
		};
	},
};

contextBridge.exposeInMainWorld("review", reviewBridge);
