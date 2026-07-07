import { SyntaxStyle } from "@opentui/core";
import { theme } from "@ui/theme";

let style: SyntaxStyle | undefined;

export function themeSyntaxStyle(): SyntaxStyle {
	style ??= SyntaxStyle.fromStyles(theme.syntax);

	return style;
}
