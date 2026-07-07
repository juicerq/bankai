const palette = {
	bg: "#0d0e12",
	panel: "#14161c",

	border: "#232734",

	text: "#c8ccd4",
	textDim: "#727a8a",
	textFaint: "#454d5e",

	accent: "#e0a54a",
	review: "#6cb2c2",
	add: "#7c9e6a",

	danger: "#d16b6b",
} as const;

export const theme = {
	...palette,

	syntax: {
		default: { fg: palette.text },
		variable: { fg: palette.text },
		property: { fg: palette.text },
		keyword: { fg: palette.review },
		string: { fg: palette.add },
		function: { fg: palette.accent },
		type: { fg: "#8fd0dd" },
		number: { fg: "#d4b070" },
		constant: { fg: "#d4b070" },
		comment: { fg: palette.textFaint, italic: true },
		operator: { fg: palette.textDim },
		punctuation: { fg: palette.textDim },
	},
} as const;
