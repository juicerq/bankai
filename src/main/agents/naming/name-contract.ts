export const NAME_TARGET_CHARS = 40;
export const NAME_MAX_CHARS = 60;

const SURROUNDING_QUOTES = /^["'`“”‘’]+|["'`“”‘’]+$/g;
const TRAILING_PUNCTUATION = /[.,;:!?…]+$/;

function bare(name: string): string {
	let stripped = name;
	let previous = "";

	while (stripped !== previous) {
		previous = stripped;
		stripped = stripped.replace(SURROUNDING_QUOTES, "").replace(TRAILING_PUNCTUATION, "").trim();
	}

	return stripped;
}

export function acceptedName(raw: string): string | null {
	const name = bare(raw.trim().replace(/\s+/g, " "));

	if (!name || name.length > NAME_MAX_CHARS) {
		return null;
	}

	return name;
}
