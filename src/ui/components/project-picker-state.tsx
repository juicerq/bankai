import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { OverlayFrame } from "@ui/components/overlay-frame";
import { theme } from "@ui/theme";

export function ProjectPickerState(props: (
	| { status: "loading" }
	| { status: "error"; message: string }
) & {
	onCancel: () => void;
}) {
	const { width } = useTerminalDimensions();
	const label = props.status === "error" ? props.message : "loading...";
	useKeyboard((key) => {
		if (key.name === "q" || key.name === "escape") {
			props.onCancel();
		}
	});

	return (
		<OverlayFrame title=" add project " width={Math.max(1, Math.min(72, width - 2))}>
			<text style={{ fg: props.status === "error" ? theme.danger : theme.textFaint }}>
				{label}
			</text>
			<text style={{ fg: theme.textFaint }}>q/esc cancel</text>
		</OverlayFrame>
	);
}
