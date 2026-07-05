import type { BrowserWindow } from "electron";
import type { ReviewModel } from "@main/review/ReviewModel";
import { REVIEW_CHANGED } from "@shared/review";

export function registerReviewStream(win: BrowserWindow, review: ReviewModel) {
	review.onChange((sessionId) =>
		win.webContents.send(REVIEW_CHANGED, { sessionId }),
	);
}
