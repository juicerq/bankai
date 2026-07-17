import { TextAttributes } from "@opentui/core";
import { theme } from "@ui/theme";

const PREVIEW_BUDGET = 20;
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
	selected,
	reviewed,
	focused,
}: {
	index: number;
	prompt: string;
	fileCount: number;
	selected: boolean;
	reviewed: boolean;
	focused: boolean;
}) {
	const count = fileCount === 0 ? "" : String(fileCount);
	const active = selected && focused;
	const promptFg = active ? theme.text : reviewed && !selected ? theme.textFaint : theme.textDim;
	const markerFg = active ? theme.accent : theme.textDim;

	return (
		<box
			style={{
				flexDirection: "row",
				justifyContent: "space-between",
				paddingRight: 1,
				backgroundColor: selected ? theme.border : theme.panel,
			}}
		>
			<text
				style={{
					fg: promptFg,
					attributes: active ? TextAttributes.BOLD : TextAttributes.NONE,
				}}
			>
				<span style={{ fg: markerFg }}>
					{selected && "▐"}
					{!selected && " "}
				</span>
				{`${String(index + 1).padStart(2, " ")} `}
				<span style={{ fg: reviewed ? theme.review : theme.textFaint }}>
					{reviewed && "✓"}
					{!reviewed && "·"}
				</span>
				{` ${preview(prompt)}`}
			</text>
			<text style={{ fg: selected ? theme.textDim : theme.textFaint }}>{count}</text>
		</box>
	);
}
