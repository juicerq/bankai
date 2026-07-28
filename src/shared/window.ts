export interface BankaiWindowApi {
	minimize: () => void;
	toggleMaximize: () => void;
	close: () => void;
	isMaximized: () => boolean;
	onMaximizedChange: (listener: () => void) => () => void;
}

declare global {
	interface Window {
		bankaiWindow?: BankaiWindowApi;
	}
}
