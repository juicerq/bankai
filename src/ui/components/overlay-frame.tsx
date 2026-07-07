import type { ReactNode } from "react";
import { theme } from "@ui/theme";

export function OverlayFrame({
	title,
	width = 60,
	children,
}: {
	title: string;
	width?: number;
	children: ReactNode;
}) {
	return (
		<box
			style={{
				position: "absolute",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				zIndex: 10,
				justifyContent: "center",
				alignItems: "center",
				backgroundColor: theme.bg,
			}}
		>
			<box
				title={title}
				titleColor={theme.accent}
				style={{
					width,
					border: true,
					borderStyle: "single",
					borderColor: theme.accent,
					backgroundColor: theme.panel,
					padding: 1,
					flexDirection: "column",
					gap: 1,
				}}
			>
				{children}
			</box>
		</box>
	);
}
