import { TextAttributes } from "@opentui/core";
import { theme } from "@ui/theme";

const PREVIEW_BUDGET = 18;
const ELLIPSIS = String.fromCodePoint(0x2026);

function preview(prompt: string): string {
	const flat = prompt.replaceAll(/\s+/g, " ").trim();
	if (flat.length === 0) {
		return "(no prompt)";
	}

	if (flat.length <= PREVIEW_BUDGET) {
		return flat;
	}

	return `${flat.slice(0, PREVIEW_BUDGET - 1)}${ELLIPSIS}`;
}

export function ReviewTurnRow({
	index,
	prompt,
	fileCount,
	active,
	reviewed,
}: {
	index: number;
	prompt: string;
	fileCount: number;
	active: boolean;
	reviewed: boolean;
}) {
	const count = fileCount === 0 ? "" : String(fileCount);

	return (
		<box style={{ flexDirection: "row", justifyContent: "space-between" }}>
			<text
				style={{
					fg: active ? theme.accent : theme.textDim,
					attributes: active ? TextAttributes.BOLD : TextAttributes.NONE,
				}}
			>
				{`${active ? "▐" : " "}${String(index + 1).padStart(2, " ")} `}
				<span style={{ fg: reviewed ? theme.review : theme.textFaint }}>
					{reviewed && "✓"}
					{!reviewed && "·"}
				</span>
				{` ${preview(prompt)}`}
			</text>
			<text style={{ fg: theme.textFaint }}>{count}</text>
		</box>
	);
}
