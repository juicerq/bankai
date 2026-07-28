import { ArrowUpIcon, StopIcon } from "@heroicons/react/24/outline";
import { useRef, useState } from "react";
import { problemText } from "@renderer/routes/-utils/problem-text";

const SAFE_BOTTOM_CLASS = "pb-[calc(8px+env(safe-area-inset-bottom))]";

export function MobileComposer({
	working,
	live,
	onSend,
	onStop,
}: {
	working: boolean;
	live: boolean;
	onSend: (text: string) => Promise<void>;
	onStop: () => Promise<void>;
}) {
	const input = useRef<HTMLTextAreaElement>(null);
	const [written, setWritten] = useState(false);
	const [problem, setProblem] = useState<string>();
	const [busy, setBusy] = useState(false);

	if (!live) {
		return (
			<p
				data-component="mobile-composer"
				data-state="ended"
				className={`shrink-0 border-outline border-t bg-surface-raised px-4 py-3 text-center text-secondary text-support ${SAFE_BOTTOM_CLASS}`}
			>
				Agent ended — resume from the desktop
			</p>
		);
	}

	const handleSend = async () => {
		const text = input.current?.value.trim();
		if (!text || busy) {
			return;
		}

		setBusy(true);
		setProblem(undefined);
		try {
			await onSend(text);
			if (input.current) {
				input.current.value = "";
			}
			setWritten(false);
		} catch (err) {
			setProblem(problemText(err));
		} finally {
			setBusy(false);
		}
	};

	const handleStop = async () => {
		if (busy) {
			return;
		}

		setBusy(true);
		setProblem(undefined);
		try {
			await onStop();
		} catch (err) {
			setProblem(problemText(err));
		} finally {
			setBusy(false);
		}
	};

	return (
		<div
			data-component="mobile-composer"
			data-state={working ? "working" : "idle"}
			className={`shrink-0 border-outline border-t bg-surface-raised p-2 ${SAFE_BOTTOM_CLASS}`}
		>
			{problem && <p data-slot="problem" className="px-1 pb-2 text-removed text-support">{problem}</p>}
			<div className="flex items-end gap-2">
				<textarea
					ref={input}
					data-slot="input"
					aria-label="Message the agent"
					placeholder="Message"
					rows={2}
					onInput={(event) => setWritten(!!event.currentTarget.value.trim())}
					className="max-h-32 min-h-11 flex-1 resize-none border border-outline bg-surface px-3 py-2 text-primary text-terminal outline-none field-sizing-content placeholder:text-outline-strong focus-visible:border-outline-strong"
				/>
				{working && (
					<button
						type="button"
						data-slot="stop"
						disabled={busy}
						className="flex h-11 shrink-0 items-center gap-1.5 border border-outline px-3 text-body text-secondary active:text-primary disabled:text-outline-strong"
						onClick={handleStop}
					>
						<StopIcon className="size-4" aria-hidden="true" />
						Stop
					</button>
				)}
				<button
					type="button"
					data-slot="send"
					aria-label="Send"
					disabled={!written || busy}
					className="flex size-11 shrink-0 items-center justify-center bg-tertiary text-surface disabled:bg-outline disabled:text-outline-strong"
					onClick={handleSend}
				>
					<ArrowUpIcon className="size-4" aria-hidden="true" />
				</button>
			</div>
		</div>
	);
}
