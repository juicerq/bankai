import { TextAttributes } from "@opentui/core";
import type { FileDiff } from "@core/review/ReviewModel";
import { theme } from "@ui/theme";

const GUTTER = 4;

function lineColor(kind: "add" | "context"): string {
	return kind === "add" ? theme.add : theme.textFaint;
}

export function ReviewDiff({ files, scrollKey }: { files: FileDiff[]; scrollKey: string }) {
	if (files.length === 0) {
		return (
			<box style={{ flexGrow: 1, justifyContent: "center", alignItems: "center" }}>
				<text style={{ fg: theme.textFaint }}>No file changes in this turn.</text>
			</box>
		);
	}

	return (
		<scrollbox key={scrollKey} focused style={{ flexGrow: 1, padding: 1 }}>
			{files.map((file) => (
				<box key={file.path} style={{ flexDirection: "column", marginBottom: 1 }}>
					<text style={{ fg: theme.review, attributes: TextAttributes.BOLD }}>{file.path}</text>
					{file.lines.map((line) => (
						<text key={`${line.line}`} style={{ fg: lineColor(line.kind) }}>
							<span style={{ fg: theme.textFaint }}>{`${String(line.line).padStart(GUTTER, " ")} `}</span>
							{line.text}
						</text>
					))}
				</box>
			))}
		</scrollbox>
	);
}
