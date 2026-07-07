import { useKeyboard } from "@opentui/react";
import { OverlayFrame } from "@ui/components/overlay-frame";
import { TextInput } from "@ui/components/text-input";
import { theme } from "@ui/theme";

export function ProjectRenameOverlay({
	current,
	onSubmit,
	onCancel,
}: {
	current: string;
	onSubmit: (name: string) => void;
	onCancel: () => void;
}) {
	useKeyboard((key) => {
		if (key.name === "escape") {
			onCancel();
		}
	});

	return (
		<OverlayFrame title=" rename project ">
			<text style={{ fg: theme.textDim }}>New name:</text>
			<TextInput value={current} onSubmit={(value) => onSubmit(value.trim() || current)} />
			<text style={{ fg: theme.textFaint }}>⏎ confirm · esc cancel</text>
		</OverlayFrame>
	);
}
