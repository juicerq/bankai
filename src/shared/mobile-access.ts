export interface MobileAccessStatus {
	host: string | undefined;
	url: string | undefined;
	exposed: boolean;
	tailnetUrl: string | undefined;
	tailnetOpen: boolean;
	problem?: string;
}
