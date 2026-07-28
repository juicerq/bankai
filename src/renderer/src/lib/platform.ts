export function isBrowserClient(): boolean {
	return window.bankaiWindow === undefined;
}
