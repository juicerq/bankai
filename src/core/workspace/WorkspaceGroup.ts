export const SPLIT_RATIO_DEFAULT = 0.5;
export const SPLIT_RATIO_MIN = 0.2;
export const SPLIT_RATIO_MAX = 0.8;

export type GroupTab = {
	id: string;
	split: boolean;
	splitRatio: number;
};

export type TabGroup = {
	tabs: GroupTab[];
	active: number;
};
