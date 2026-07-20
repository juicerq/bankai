import { TextAttributes } from "@opentui/core";
import type { SessionRef } from "@core/harness/registry";
import type { DiffScope } from "@core/review/diffScope";
import { diffStats } from "@core/review/diff";
import type { FileChange } from "@core/review/FileChange";
import { theme } from "@ui/theme";

export function ReviewHeader({
	session,
	turnIndex,
	turnCount,
	scope,
	unified,
	folded,
	files,
}: {
	session: SessionRef | null;
	turnIndex: number;
	turnCount: number;
	scope: DiffScope;
	unified: boolean;
	folded: boolean;
	files: FileChange[];
}) {
	const stats = diffStats(files);
	const added = stats.state === "exact" ? String(stats.added) : "?";
	const removed = stats.state === "exact" ? String(stats.removed) : "?";
	const sessionLabel = session
		? `${session.harness}:${session.sessionId}`
		: "no session on this tab";
	const currentTurn = turnCount === 0 ? 0 : turnIndex + 1;
	const scopeLabel = scope === "turn" ? `turn ${currentTurn}/${turnCount}` : scope;

	return (
		<box
			style={{
				flexShrink: 0,
				flexDirection: "row",
				gap: 2,
				paddingLeft: 2,
				paddingRight: 2,
				backgroundColor: theme.panel,
				border: ["bottom"],
				borderColor: theme.border,
			}}
		>
			<text style={{ fg: theme.review, attributes: TextAttributes.BOLD }}>REVIEW</text>
			<text style={{ fg: theme.textFaint }}>{sessionLabel}</text>
			<box style={{ flexGrow: 1 }} />
			<text>
				<span style={{ fg: theme.textDim }}>
					{scopeLabel}
				</span>
				{unified && <span style={{ fg: theme.textDim }}>{" · unified"}</span>}
				{!folded && <span style={{ fg: theme.textDim }}>{" · full"}</span>}
				<span style={{ fg: theme.add }}>{`  +${added}`}</span>
				<span style={{ fg: theme.danger }}>{` -${removed}`}</span>
				<span style={{ fg: theme.textFaint }}>
					{`  ${files.length} ${files.length === 1 ? "file" : "files"}`}
				</span>
			</text>
		</box>
	);
}
