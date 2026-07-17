import {
	type HarnessId,
	Harnesses,
	sessionKey,
	type SessionRef,
} from "@core/harness/registry";
import { Logger } from "@core/logger";
import { TranscriptProjector } from "@core/review/TranscriptProjector";
import type { Turn } from "@core/review/ReviewModel";
import { type Project, Projects } from "@core/store/projects";
import { ReviewState } from "@core/store/review-state";
import { WORKSPACE_SEED, WorkspaceStore } from "@core/store/workspace";
import { planRestore, type RestorePlan } from "@core/workspace/planRestore";

export type RestoreReview = {
	session: SessionRef;
	turns: Turn[];
	reviewed: string[];
	available: boolean;
};

export type RestoredWorkspace = {
	projects: Project[];
	plan: RestorePlan;
	review: RestoreReview | null;
};

async function locateSessions(sessions: SessionRef[]): Promise<Map<string, string>> {
	const byHarness = new Map<HarnessId, SessionRef[]>();
	for (const session of sessions) {
		const related = byHarness.get(session.harness) ?? [];
		related.push(session);
		byHarness.set(session.harness, related);
	}

	const located = await Promise.all([...byHarness].map(async ([harness, related]) => {
		const paths = await Harnesses.get(harness).transcript.locateMany(
			new Set(related.map((session) => session.sessionId)),
		).catch((err) => {
			Logger.error("workspace:transcript-locate-failed", { harness, error: String(err) });
			return new Map<string, string>();
		});

		return related.flatMap((session) => {
			const path = paths.get(session.sessionId);
			return path ? [[sessionKey(session), path] as const] : [];
		});
	}));

	return new Map(located.flat());
}

export async function restoreWorkspace(): Promise<RestoredWorkspace> {
	const projects = await Projects.list();
	const workspace = await WorkspaceStore.read().catch((err) => {
		Logger.error("workspace:read-failed", String(err));
		return WORKSPACE_SEED;
	});
	const reviewSession = workspace.screen === "review" ? workspace.reviewSession : null;
	const runningSessions = workspace.projects.flatMap((project) =>
		project.tabs.flatMap((tab) => tab.state === "bound" && tab.running
			? [tab.session]
			: []));
	const sessions = new Map<string, SessionRef>();

	for (const session of reviewSession ? [reviewSession, ...runningSessions] : runningSessions) {
		sessions.set(sessionKey(session), session);
	}

	const transcriptPaths = await locateSessions([...sessions.values()]);
	const projector = new TranscriptProjector();
	const reviewPath = reviewSession ? transcriptPaths.get(sessionKey(reviewSession)) : undefined;
	if (reviewSession && reviewPath) {
		await projector.load(reviewSession, reviewPath);
	}

	const review = reviewSession && reviewPath ? {
		session: reviewSession,
		turns: await projector.turns(reviewSession),
		reviewed: await ReviewState.get(reviewSession),
		available: await projector.available(reviewSession),
	} : null;
	const tabTranscripts = new Set(
		runningSessions
			.map(sessionKey)
			.filter((key) => transcriptPaths.has(key)),
	);

	return {
		projects,
		plan: planRestore({
			workspace,
			projects,
			reviewTranscriptExists: reviewPath !== undefined,
			tabTranscripts,
		}),
		review,
	};
}
