import { useEffect, useRef } from "react";
import { type ScrollBoxRenderable, TextAttributes } from "@opentui/core";
import { diffRows, unifiedRows } from "@core/review/diff";
import type { FileSnapshot } from "@core/review/ReviewModel";
import { useHighlightedFiles } from "@ui/-utils/use-highlighted-files";
import { useScrollAnchor } from "@ui/-utils/use-scroll-anchor";
import { ReviewDiffRow } from "@ui/components/review-diff-row";
import { theme } from "@ui/theme";

export function ReviewDiff({
	files,
	unified,
	folded,
	focused,
	resetKey,
	emptyLabel,
}: {
	files: FileSnapshot[];
	unified: boolean;
	folded: boolean;
	focused: boolean;
	resetKey: string;
	emptyLabel: string;
}) {
	const scroll = useRef<ScrollBoxRenderable>(null);
	const styled = useHighlightedFiles(files);
	const filesRows = files.map((file) => ({
		path: file.path,
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
			<box style={{ width: 1, backgroundColor: focused ? theme.review : theme.bg }} />

			{files.length === 0 && (
				<box style={{ flexGrow: 1, justifyContent: "center", alignItems: "center" }}>
					<text style={{ fg: theme.textFaint }}>{emptyLabel}</text>
				</box>
			)}

			{files.length > 0 && (
				<scrollbox ref={scroll} focused={focused} style={{ flexGrow: 1, padding: 1 }}>
					{filesRows.map((file) => (
						<box key={file.path} style={{ flexDirection: "column", marginBottom: 1 }}>
							<text style={{ fg: theme.review, attributes: TextAttributes.BOLD }}>{file.path}</text>
							{file.rows.map((row, i) => (
								<ReviewDiffRow
									key={`${row.kind}:${i}`}
									row={row}
									styledLines={styled.get(file.path)}
								/>
							))}
						</box>
					))}
				</scrollbox>
			)}
		</box>
	);
}
