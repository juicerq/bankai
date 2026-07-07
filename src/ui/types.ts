import type { SessionStatus } from "@core/review/ReviewModel";

export type TabGroup = { tabs: string[]; active: number };

export type TabStatus = { status: SessionStatus; unreviewed: boolean };
