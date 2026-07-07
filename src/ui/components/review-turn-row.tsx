import { TextAttributes } from "@opentui/core";
import { theme } from "@ui/theme";

const PREVIEW_BUDGET = 22;
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
	active,
	reviewed,
}: {
	index: number;
	prompt: string;
	active: boolean;
	reviewed: boolean;
}) {
	return (
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
	);
}
