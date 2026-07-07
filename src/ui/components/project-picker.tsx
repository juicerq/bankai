import { dirname } from "node:path";
import { useEffect, useRef, useState } from "react";
import { type ScrollBoxRenderable, TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { type DirEntry, listDirs } from "@core/fs/listDirs";
import { OverlayFrame } from "@ui/components/overlay-frame";
import { theme } from "@ui/theme";

function homeRelative(path: string, home: string): string {
	if (path === home) {
		return "~";
	}

	if (path.startsWith(`${home}/`)) {
		return `~${path.slice(home.length)}`;
	}

	return path;
}

export function ProjectPicker({
	home,
	initialEntries,
	existingCwds,
	onPick,
	onCancel,
}: {
	home: string;
	initialEntries: DirEntry[];
	existingCwds: string[];
	onPick: (cwd: string) => void;
	onCancel: () => void;
}) {
	const { width, height } = useTerminalDimensions();
	const scroll = useRef<ScrollBoxRenderable>(null);
	const [current, setCurrent] = useState({ path: home, entries: initialEntries });
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [showHidden, setShowHidden] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const visible = showHidden ? current.entries : current.entries.filter((entry) => !entry.hidden);
	const index = Math.min(selectedIndex, Math.max(0, visible.length - 1));
	const selected = visible[index];
	const added = new Set(existingCwds);

	const listRows = Math.min(Math.max(visible.length, 1), Math.max(3, height - 12));

	useEffect(() => {
		if (selected) {
			scroll.current?.scrollChildIntoView(selected.path);
		}
	}, [selected]);

	const go = (path: string) => {
		listDirs(path)
			.then((entries) => {
				setCurrent({ path, entries });
				setSelectedIndex(0);
				setError(null);
			})
			.catch(() => setError("permission denied"));
	};

	useKeyboard((key) => {
		if (key.name === "q") {
			onCancel();
			return;
		}

		if (key.name === "up") {
			setSelectedIndex(Math.max(index - 1, 0));
			return;
		}

		if (key.name === "down") {
			setSelectedIndex(Math.min(index + 1, visible.length - 1));
			return;
		}

		if (key.name === "return" && selected) {
			go(selected.path);
			return;
		}

		if (key.name === "escape" || key.name === "backspace") {
			const parent = dirname(current.path);
			if (parent !== current.path) {
				go(parent);
			}

			return;
		}

		if (key.name === "space" && selected) {
			onPick(selected.path);
			return;
		}

		if (key.name === ".") {
			setShowHidden((prev) => !prev);
			setSelectedIndex(0);
		}
	});

	return (
		<OverlayFrame title=" add project " width={Math.min(72, Math.max(40, width - 8))}>
			<text style={{ fg: theme.accent, attributes: TextAttributes.BOLD }}>
				{homeRelative(current.path, home)}
			</text>

			{visible.length === 0 && <text style={{ fg: theme.textFaint }}>empty</text>}
			<scrollbox ref={scroll} viewportCulling={false} style={{ height: listRows }}>
				{visible.map((entry) => (
					<text
						key={entry.path}
						id={entry.path}
						style={{
							fg: entry === selected ? theme.accent : theme.textDim,
							attributes: entry === selected ? TextAttributes.BOLD : TextAttributes.NONE,
						}}
					>
						{`${entry === selected ? "▐" : " "} ${entry.name}`}
						{added.has(entry.path) && <span style={{ fg: theme.textFaint }}> · added</span>}
					</text>
				))}
			</scrollbox>

			{!!error && <text style={{ fg: theme.danger }}>{error}</text>}
			<text style={{ fg: theme.textFaint }}>
				↑↓ navigate · ⏎ enter · esc/⌫ back · space choose · . hidden · q cancel
			</text>
		</OverlayFrame>
	);
}
