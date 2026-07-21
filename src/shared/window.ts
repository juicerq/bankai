export type BankaiWindowApi = {
	minimize: () => void;
	toggleMaximize: () => void;
	close: () => void;
};

declare global {
	interface Window {
		bankaiWindow: BankaiWindowApi;
	}
}
