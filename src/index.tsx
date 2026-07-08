import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { HookInstaller } from "@core/hooks/HookInstaller";
import { Logger } from "@core/logger";
import { backfillTurns, transcriptExists } from "@core/review/TranscriptBackfill";
import { Projects } from "@core/store/projects";
import { ReviewState } from "@core/store/review-state";
import { WORKSPACE_SEED, WorkspaceStore } from "@core/store/workspace";
import { planRestore } from "@core/workspace/planRestore";
import { App, type RestoreReview } from "@ui/app";

await HookInstaller.install().catch((err) => Logger.error("hooks:install-failed", String(err)));

const initialProjects = await Projects.list();

const workspace = await WorkspaceStore.read().catch((err) => {
	Logger.error("workspace:read-failed", String(err));
	return WORKSPACE_SEED;
});

const reviewSessionId = workspace.screen === "review" ? workspace.reviewSessionId : null;
const reviewTranscriptExists = reviewSessionId === null ? false : await transcriptExists(reviewSessionId);

const restoreReview: RestoreReview | null =
	reviewTranscriptExists && reviewSessionId !== null
		? {
				sessionId: reviewSessionId,
				turns: await backfillTurns(reviewSessionId),
				reviewed: await ReviewState.get(reviewSessionId),
			}
		: null;

const tabSessionIds = [
	...new Set(
		workspace.projects.flatMap((project) =>
			project.tabs.flatMap((tab) => (tab.command ? [tab.command.sessionId] : [])),
		),
	),
];
const probed = await Promise.all(
	tabSessionIds.map(async (id) => ({ id, exists: await transcriptExists(id) })),
);
const tabTranscripts = new Set(probed.filter((entry) => entry.exists).map((entry) => entry.id));

const plan = planRestore({ workspace, projects: initialProjects, reviewTranscriptExists, tabTranscripts });

const renderer = await createCliRenderer({ exitOnCtrlC: false, targetFps: 60 });

createRoot(renderer).render(<App initialProjects={initialProjects} plan={plan} restoreReview={restoreReview} />);
