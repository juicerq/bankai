import { ipcRenderer } from "electron";

window.addEventListener("message", (event) => {
	if (event.source !== window) return;
	if (event.data !== "start-orpc-client") return;

	const [port] = event.ports;
	if (!port) return;

	ipcRenderer.postMessage("start-orpc-server", null, [port]);
});
