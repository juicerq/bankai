import { TextAttributes } from "@opentui/core";
import { theme } from "@ui/theme";

export function TabChip({ index, active }: { index: number; active: boolean }) {
	return (
		<text
			style={{
				fg: active ? theme.accent : theme.textDim,
				attributes: active ? TextAttributes.BOLD : TextAttributes.NONE,
			}}
		>
			{`${active ? "▐" : " "}${index + 1}`}
		</text>
	);
}
