import { TextAttributes } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useState } from "react";
import { type HarnessId, harnessIds } from "@core/harness/registry";
import { OverlayFrame } from "@ui/components/overlay-frame";
import { theme } from "@ui/theme";

export function SettingsOverlay({
	defaultHarness,
	onSelect,
	onClose,
}: {
	defaultHarness: HarnessId;
	onSelect: (harness: HarnessId) => void;
	onClose: () => void;
}) {
	const [cursor, setCursor] = useState(() =>
		Math.max(0, harnessIds.indexOf(defaultHarness)));

	useKeyboard((key) => {
		if (key.name === "escape") {
			onClose();
			return;
		}

		if (key.name === "up" || key.name === "k") {
			setCursor((index) => Math.max(index - 1, 0));
			return;
		}

		if (key.name === "down" || key.name === "j") {
			setCursor((index) => Math.min(index + 1, harnessIds.length - 1));
			return;
		}

		if (key.name === "return") {
			onSelect(harnessIds[cursor]!);
		}
	});

	return (
		<OverlayFrame title=" settings " width={40}>
			<text style={{ fg: theme.textDim }}>Default harness</text>
			{harnessIds.map((harness, index) => (
				<text
					key={harness}
					style={{
						fg: index === cursor ? theme.accent : theme.textDim,
						attributes: index === cursor ? TextAttributes.BOLD : TextAttributes.NONE,
					}}
				>
					{`${index === cursor ? "▐" : " "} ${harness}`}
					{harness === defaultHarness && <span style={{ fg: theme.add }}> ●</span>}
				</text>
			))}
			<text style={{ fg: theme.textFaint }}>↑↓/jk navigate · ⏎ set default · esc close</text>
		</OverlayFrame>
	);
}
