import { useEffect, useRef } from "react";
import { type ScrollBoxRenderable, TextAttributes } from "@opentui/core";
import { diffRows, diffStats, unifiedRows } from "@core/review/diff";
import type { FileChange } from "@core/review/FileChange";
import { useHighlightedFiles } from "@ui/-utils/use-highlighted-files";
import { useScrollAnchor } from "@ui/-utils/use-scroll-anchor";
import { ReviewDiffRow } from "@ui/components/review-screen/review-diff-row";
import { theme } from "@ui/theme";

export function ReviewDiff({
	files,
	unified,
	folded,
	focused,
	resetKey,
	empty,
}: {
	files: FileChange[];
	unified: boolean;
	folded: boolean;
	focused: boolean;
	resetKey: string;
	empty: { label: string; hint: string };
}) {
	const scroll = useRef<ScrollBoxRenderable>(null);
	const styled = useHighlightedFiles(files);
	const filesRows = files.map((file) => ({
		file,
		path: file.path,
		stats: diffStats([file]),
		rows: (unified ? unifiedRows : diffRows)(file.before, file.after, folded),
	}));

	useScrollAnchor({ scroll, viewKey: `${unified}:${folded}`, filesRows });

	useEffect(() => {
		if (scroll.current) {
			scroll.current.scrollTop = 0;
		}
	}, [resetKey]);

	return (
		<box style={{ flexGrow: 1, flexDirection: "row" }}>
			{files.length === 0 && (
				<box style={{ flexGrow: 1, justifyContent: "center", alignItems: "center", gap: 1 }}>
					<text style={{ fg: theme.textDim }}>{empty.label}</text>
					<text style={{ fg: theme.textFaint }}>{empty.hint}</text>
				</box>
			)}

			{files.length > 0 && (
				<scrollbox ref={scroll} focused={focused} style={{ flexGrow: 1, padding: 1 }}>
					{filesRows.map((file) => {
						const slash = file.path.lastIndexOf("/") + 1;
						const added = file.stats.state === "exact" ? String(file.stats.added) : "?";
						const removed = file.stats.state === "exact" ? String(file.stats.removed) : "?";

						return (
							<box key={file.path} style={{ flexDirection: "column", marginBottom: 1 }}>
								<box
									style={{
										flexDirection: "row",
										justifyContent: "space-between",
										backgroundColor: focused ? theme.border : theme.panel,
										paddingLeft: 1,
										paddingRight: 1,
										marginBottom: 1,
									}}
								>
									<text>
										<span style={{ fg: focused ? theme.textDim : theme.textFaint }}>
											{file.path.slice(0, slash)}
										</span>
										<span style={{ fg: theme.text, attributes: TextAttributes.BOLD }}>
											{file.path.slice(slash)}
										</span>
									</text>
									<text>
										<span style={{ fg: theme.add }}>{`+${added}`}</span>
										<span style={{ fg: theme.danger }}>{` -${removed}`}</span>
									</text>
								</box>
								{file.rows.map((row, i) => (
									<ReviewDiffRow
										key={`${row.kind}:${i}`}
										row={row}
										styledLines={styled.get(file.file)}
									/>
								))}
							</box>
						);
					})}
				</scrollbox>
			)}
		</box>
	);
}
