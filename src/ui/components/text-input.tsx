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
	return (
		<input
			focused
			value={value}
			placeholder={placeholder}
			onSubmit={(submitted) => onSubmit(submitted as string)}
			style={inputStyle}
		/>
	);
}
