import { dirname } from "node:path";
import { useEffect, useRef, useState } from "react";
import { type ScrollBoxRenderable, TextAttributes } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { type DirEntry, listDirs } from "@core/fs/listDirs";
import { OverlayFrame } from "@ui/components/overlay-frame";
import { homePathLabel } from "@ui/-utils/path-label";
import { theme } from "@ui/theme";

export function ProjectPicker({
	home,
	entries: initialEntries,
	existingCwds,
	onPick,
	onCancel,
}: {
	home: string;
	entries: DirEntry[];
	existingCwds: string[];
	onPick: (cwd: string) => void;
	onCancel: () => void;
}) {
	const { width, height } = useTerminalDimensions();
	const scroll = useRef<ScrollBoxRenderable>(null);
	const navigation = useRef(0);
	const [current, setCurrent] = useState<
		| { state: "loading"; path: string }
		| { state: "ready"; path: string; entries: DirEntry[] }
		| { state: "error"; path: string; message: string }
	>({ state: "ready", path: home, entries: initialEntries });
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [showHidden, setShowHidden] = useState(false);

	const entries = current.state === "ready" ? current.entries : [];
	const visible = showHidden ? entries : entries.filter((entry) => !entry.hidden);
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
		const request = ++navigation.current;
		setCurrent({ state: "loading", path });
		setSelectedIndex(0);
		listDirs(path)
			.then((entries) => {
				if (navigation.current !== request) {
					return;
				}

				setCurrent({ state: "ready", path, entries });
			})
			.catch((error) => {
				if (navigation.current === request) {
					setCurrent({
						state: "error",
						path,
						message: error instanceof Error ? error.message : "unable to list directory",
					});
				}
			});
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
			setSelectedIndex(Math.max(0, Math.min(index + 1, visible.length - 1)));
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
		<OverlayFrame title=" add project " width={Math.max(1, Math.min(72, width - 2))}>
			<text style={{ fg: theme.accent, attributes: TextAttributes.BOLD }}>
				{homePathLabel(current.path)}
			</text>

			{current.state === "loading" && (
				<text style={{ fg: theme.textFaint }}>loading…</text>
			)}
			{current.state === "ready" && visible.length === 0 && (
				<text style={{ fg: theme.textFaint }}>empty</text>
			)}
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

			{current.state === "error" && (
				<text style={{ fg: theme.danger }}>{current.message}</text>
			)}
			<text style={{ fg: theme.textFaint }}>
				↑↓ navigate · ⏎ enter · esc/⌫ back · space choose · . hidden · q cancel
			</text>
		</OverlayFrame>
	);
}
