import { GlobalRegistrator } from "@happy-dom/global-registrator";

declare global {
	var IS_REACT_ACT_ENVIRONMENT: boolean;

	interface Window {
		happyDOM: { setURL(url: string): void };
	}
}

GlobalRegistrator.register();
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });