import type { TerminalKey } from "@main/terminal/input";
import type { SessionRow } from "@renderer/routes/-utils/session-rows";
import { useKeyAck } from "@renderer/routes/mobile/-utils/use-key-ack";
import type { ShellAttention } from "@shared/activity";

const KEYPAD: { key: TerminalKey; label: string }[] = [
	{ key: "1", label: "1" },
	{ key: "2", label: "2" },
	{ key: "3", label: "3" },
	{ key: "up", label: "↑" },
	{ key: "down", label: "↓" },
	{ key: "enter", label: "Enter" },
	{ key: "escape", label: "Esc" },
];

const WAITING_LABEL = "Waiting on you";

const ACTION_CLASS = "flex-1 py-2.5 text-body active:bg-surface-active";

export function MobileAttention({
	row,
	onKey,
}: {
	row: SessionRow;
	onKey: (key: TerminalKey) => Promise<void>;
}) {
	const ack = useKeyAck(`${row.activity} ${row.trace} ${row.traceSince}`, onKey);
	const labelled = ack.deaf ? undefined : row.attention;

	return (
		<div
			data-component="mobile-attention"
			data-mode={labelled ? "card" : "keypad"}
			className="shrink-0 border-outline border-t bg-surface-raised px-2 pt-2"
		>
			{labelled
				? <AttentionCard attention={labelled} onPress={ack.press} />
				: <AttentionKeypad label={row.trace ?? WAITING_LABEL} onPress={ack.press} />}
			{ack.deaf && (
				<p data-slot="hint" className="px-1 pt-2 text-outline-strong text-support">
					No effect — use the keypad
				</p>
			)}
			{ack.problem && <p data-slot="problem" className="px-1 pt-2 text-removed text-support">{ack.problem}</p>}
		</div>
	);
}

function AttentionCard({
	attention,
	onPress,
}: {
	attention: ShellAttention;
	onPress: (key: TerminalKey) => Promise<void>;
}) {
	return (
		<div className="border border-terminal-blue">
			<div className="flex items-center gap-2 border-outline border-b px-3 py-1.5 text-label text-terminal-blue">
				<span aria-hidden="true" className="size-1.5 rounded-full bg-terminal-blue" />
				NEEDS ATTENTION
			</div>
			<div className="flex flex-col gap-0.5 px-3 py-2">
				<span data-slot="message" className="text-body text-primary">{attention.message}</span>
				{attention.detail && (
					<span data-slot="detail" className="truncate text-data text-secondary">{attention.detail}</span>
				)}
			</div>
			<div className="flex border-outline border-t">
				<button
					type="button"
					data-slot="allow"
					className={`${ACTION_CLASS} text-primary`}
					onClick={() => onPress("1")}
				>
					Allow <span className="text-data text-outline-strong">1</span>
				</button>
				<button
					type="button"
					data-slot="always"
					className={`${ACTION_CLASS} border-outline border-l text-secondary`}
					onClick={() => onPress("2")}
				>
					Always <span className="text-data text-outline-strong">2</span>
				</button>
				<button
					type="button"
					data-slot="deny"
					className={`${ACTION_CLASS} border-outline border-l text-removed`}
					onClick={() => onPress("escape")}
				>
					Deny <span className="text-data text-outline-strong">Esc</span>
				</button>
			</div>
			<p data-slot="always-note" className="border-outline border-t px-3 py-1.5 text-data text-outline-strong">
				Always allows every edit for the rest of this session
			</p>
		</div>
	);
}

function AttentionKeypad({
	label,
	onPress,
}: {
	label: string;
	onPress: (key: TerminalKey) => Promise<void>;
}) {
	return (
		<div className="border border-outline">
			<span
				data-slot="label"
				className="block truncate border-outline border-b px-3 py-1.5 text-label text-terminal-blue"
			>
				{label.toUpperCase()}
			</span>
			<div className="flex gap-1 p-2">
				{KEYPAD.map((entry) => (
					<button
						key={entry.key}
						type="button"
						data-slot={`key-${entry.key}`}
						className="min-w-8 flex-1 border border-outline py-2 text-body text-secondary active:bg-surface-active active:text-primary"
						onClick={() => onPress(entry.key)}
					>
						{entry.label}
					</button>
				))}
			</div>
		</div>
	);
}
