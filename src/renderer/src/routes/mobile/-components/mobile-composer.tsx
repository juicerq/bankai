import { ArrowUpIcon, StopIcon } from "@heroicons/react/24/outline";
import { useRef, useState } from "react";

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
				className="shrink-0 border-outline border-t bg-surface-raised px-4 py-3 text-center text-secondary text-support"
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
			setProblem(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	};

	const handleStop = async () => {
		setProblem(undefined);
		await onStop().catch((err: unknown) => {
			setProblem(err instanceof Error ? err.message : String(err));
		});
	};

	return (
		<div
			data-component="mobile-composer"
			data-state={working && !written ? "stop" : "send"}
			className="shrink-0 border-outline border-t bg-surface-raised p-2"
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
					className="max-h-32 min-h-9 flex-1 resize-none border border-outline bg-surface px-3 py-2 text-primary text-terminal outline-none field-sizing-content placeholder:text-outline-strong focus-visible:border-outline-strong"
				/>
				{working && !written
					? (
						<button
							type="button"
							data-slot="stop"
							className="flex h-9 shrink-0 items-center gap-1.5 border border-outline px-3 text-body text-secondary active:text-primary"
							onClick={handleStop}
						>
							<StopIcon className="size-4" aria-hidden="true" />
							Stop
						</button>
					)
					: (
						<button
							type="button"
							data-slot="send"
							aria-label="Send"
							disabled={!written || busy}
							className="flex size-9 shrink-0 items-center justify-center bg-tertiary text-surface disabled:bg-outline disabled:text-outline-strong"
							onClick={handleSend}
						>
							<ArrowUpIcon className="size-4" aria-hidden="true" />
						</button>
					)}
			</div>
		</div>
	);
}
