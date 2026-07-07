import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { useState } from "react";
import { useKeyboard } from "@opentui/react";
import { OverlayFrame } from "@ui/components/overlay-frame";
import { TextInput } from "@ui/components/text-input";
import { theme } from "@ui/theme";

export function ProjectAddOverlay({
	onSubmit,
	onCancel,
}: {
	onSubmit: (cwd: string, name: string) => void;
	onCancel: () => void;
}) {
	const [step, setStep] = useState<"path" | "name">("path");
	const [cwd, setCwd] = useState("");
	const [error, setError] = useState<string | null>(null);

	useKeyboard((key) => {
		if (key.name === "escape") {
			onCancel();
		}
	});

	const submitPath = (value: string) => {
		const path = value.trim();
		if (!path) {
			setError("Enter a directory path.");
			return;
		}

		stat(path)
			.then((info) => {
				if (!info.isDirectory()) {
					setError("That path is not a directory.");
					return;
				}

				setCwd(path);
				setError(null);
				setStep("name");
			})
			.catch(() => setError("Directory not found."));
	};

	return (
		<OverlayFrame title=" add project ">
			{step === "path" && (
				<box style={{ flexDirection: "column", gap: 1 }}>
					<text style={{ fg: theme.textDim }}>Directory to add:</text>
					<TextInput placeholder="/path/to/project" onSubmit={submitPath} />
				</box>
			)}

			{step === "name" && (
				<box style={{ flexDirection: "column", gap: 1 }}>
					<text style={{ fg: theme.textDim }}>{`Name for ${basename(cwd)}:`}</text>
					<TextInput
						value={basename(cwd)}
						onSubmit={(value) => onSubmit(cwd, value.trim() || basename(cwd))}
					/>
				</box>
			)}

			{!!error && <text style={{ fg: theme.danger }}>{error}</text>}
			{!error && <text style={{ fg: theme.textFaint }}>⏎ confirm · esc cancel</text>}
		</OverlayFrame>
	);
}
