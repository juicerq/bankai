import { useId } from "react";
import type { TerminalKey } from "@main/terminal/terminal-input";
import { ACTIVITY_LABEL } from "@renderer/routes/-utils/agent-activity";
import { useKeyAck } from "@renderer/routes/mobile/-utils/use-key-ack";

const KEYPAD: { key: TerminalKey; label: string; name?: string }[] = [
	{ key: "1", label: "1" },
	{ key: "2", label: "2" },
	{ key: "3", label: "3" },
	{ key: "up", label: "↑", name: "Up" },
	{ key: "down", label: "↓", name: "Down" },
	{ key: "enter", label: "Enter" },
	{ key: "escape", label: "Esc" },
];

export function MobileAttention({
	signature,
	onKey,
}: {
	signature: string;
	onKey: (key: TerminalKey) => Promise<void>;
}) {
	const ack = useKeyAck(signature, onKey);
	const labelId = useId();

	return (
		<div
			data-component="mobile-attention"
			role="status"
			className="shrink-0 border-outline border-t bg-surface-raised px-2 pt-2"
		>
			<div className="border border-outline">
				<span
					id={labelId}
					data-slot="label"
					className="block truncate border-outline border-b px-3 py-1.5 text-label text-terminal-blue uppercase"
				>
					{ACTIVITY_LABEL["needs-attention"]}
				</span>
				<div role="group" aria-labelledby={labelId} className="flex gap-1 p-2">
					{KEYPAD.map((entry) => (
						<button
							key={entry.key}
							type="button"
							data-slot={`key-${entry.key}`}
							aria-label={entry.name}
							className="min-w-8 flex-1 border border-outline py-3 text-body text-secondary active:bg-surface-active active:text-primary"
							onClick={() => ack.press(entry.key)}
						>
							{entry.label}
						</button>
					))}
				</div>
			</div>
			{ack.deaf && (
				<p data-slot="hint" className="px-1 pt-2 text-outline-strong text-support">
					No effect
				</p>
			)}
			{ack.problem && <p data-slot="problem" className="px-1 pt-2 text-removed text-support">{ack.problem}</p>}
		</div>
	);
}
