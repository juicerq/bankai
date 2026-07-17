import { useRef } from "react";
import type { InputRenderable } from "@opentui/core";
import { theme } from "@ui/theme";

const inputStyle = {
	width: "100%",
	backgroundColor: theme.bg,
	focusedBackgroundColor: theme.bg,
	textColor: theme.text,
	focusedTextColor: theme.text,
	placeholderColor: theme.textFaint,
} as const;

export function TextInput({
	value,
	placeholder,
	onSubmit,
}: {
	value?: string;
	placeholder?: string;
	onSubmit: (value: string) => void;
}) {
	const input = useRef<InputRenderable>(null);

	return (
		<input
			ref={input}
			focused
			value={value}
			placeholder={placeholder}
			onSubmit={() => {
				if (input.current) {
					onSubmit(input.current.value);
				}
			}}
			style={inputStyle}
		/>
	);
}
