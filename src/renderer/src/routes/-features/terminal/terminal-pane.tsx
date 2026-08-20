import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { orpc } from "@renderer/lib/api";
import {
	initialResumeState,
	nextResumeState,
	type ResumeOutcome,
	type ResumeState,
	resumeNoticeVariant,
} from "@renderer/routes/-features/sessions/lifecycle/resume-state";
import { useTerminalSession } from "@renderer/routes/-features/terminal/use-terminal-session";
import {
	TerminalFileLinks,
	type TerminalFileTarget,
} from "@renderer/routes/-features/terminal/terminal-file-links";

export function TerminalPane({
	projectId,
	shellId,
	worktree,
	active,
	focusRequest,
	resizeDeferred,
	resumeOnMount,
	onOpenFile,
	onOpenUrl,
}: {
	projectId: string;
	shellId: string;
	worktree: string;
	active: boolean;
	focusRequest: number;
	resizeDeferred: boolean;
	resumeOnMount: boolean;
	onOpenFile: (target: TerminalFileTarget) => void;
	onOpenUrl?: (url: string) => void;
}) {
	const { data: browsePaths } = useQuery(
		orpc.review.browseFiles.queryOptions({
			input: { projectId, worktree },
			enabled: active,
		}),
	);
	const [resumeState, setResumeState] = useState<ResumeState>(() => initialResumeState(resumeOnMount));
	const [painted, setPainted] = useState(false);
	const handleResumeOutcome = useCallback((outcome: ResumeOutcome) => {
		setResumeState((state) => nextResumeState(state, outcome));
	}, []);
	const handleFirstOutput = useCallback(() => setPainted(true), []);
	const fileLinkDetector = useMemo(() => {
		if (!browsePaths) {
			return;
		}

		return TerminalFileLinks.prepare({ paths: browsePaths, worktree });
	}, [browsePaths, worktree]);
	const { registerContainer, registerActivation, registerFocusRequest, registerResizeDeferral, retryResume } =
		useTerminalSession({
			projectId,
			shellId,
			focusRequest,
			resizeDeferred,
			resumeOnMount,
			...(fileLinkDetector ? { fileLinks: { detector: fileLinkDetector, onOpen: onOpenFile } } : {}),
			...(onOpenUrl ? { onOpenUrl } : {}),
			onResumeOutcome: handleResumeOutcome,
			onFirstOutput: handleFirstOutput,
		});
	const handleRetry = useCallback(() => {
		setResumeState((state) => nextResumeState(state, { kind: "retry" }));
		retryResume();
	}, [retryResume]);

	const noticeVariant = resumeNoticeVariant(resumeState);

	return (
		<div className="relative flex size-full flex-col overflow-hidden bg-terminal-background pt-3 pr-0 pl-4">
			{noticeVariant && <ResumeNotice variant={noticeVariant} reason={resumeState.reason} onRetry={handleRetry} />}
			{resumeOnMount && !painted && !noticeVariant && <ResumingMark />}
			<div ref={registerContainer} className="min-h-0 flex-1" />
			<span ref={registerResizeDeferral} hidden />
			{active && <span ref={registerActivation} hidden />}
			{active && <span ref={registerFocusRequest} hidden />}
		</div>
	);
}

function ResumingMark() {
	return (
		<span
			data-component="resuming-mark"
			className="pointer-events-none absolute top-3 left-4 flex items-center gap-2 text-label text-outline-strong"
		>
			<span className="pending-pulse size-[6px] shrink-0 rounded-full bg-tertiary" />
			RESUMING SESSION
		</span>
	);
}

function ResumeNotice({
	variant,
	reason,
	onRetry,
}: {
	variant: "failed-retryable" | "failed-final";
	reason?: string;
	onRetry: () => void;
}) {
	return (
		<div
			data-component="resume-notice"
			data-variant={variant}
			className="mr-4 mb-2 flex items-center gap-3 border border-outline bg-surface-raised py-2 pr-2 pl-3"
		>
			<span className="size-[6px] shrink-0 rounded-full bg-tertiary" />
			<div className="flex min-w-0 flex-col leading-tight">
				<span className="text-label text-tertiary">RESUME FAILED</span>
				<span className="text-secondary text-support">
					{variant === "failed-retryable" ? "Opened a new shell instead" : "Retry failed — new shell kept"}
				</span>
				{reason && (
					<span data-slot="reason" className="mt-0.5 truncate text-secondary text-support">
						{reason}
					</span>
				)}
			</div>
			{variant === "failed-retryable" && (
				<button
					type="button"
					data-slot="retry"
					className="ml-auto flex items-center gap-1.5 bg-primary px-2.5 py-1.5 text-label text-surface hover:bg-secondary"
					onClick={onRetry}
				>
					<ArrowPathIcon className="size-3" />
					RETRY
				</button>
			)}
		</div>
	);
}
