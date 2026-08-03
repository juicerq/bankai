const NAME_TARGET_CHARS = 40;
const NAME_MAX_CHARS = 60;

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

function acceptedName(raw: string): string | null {
	const name = bare(raw.trim().replace(/\s+/g, " "));

	if (!name || name.length > NAME_MAX_CHARS) {
		return null;
	}

	return name;
}

export const NameContract = {
	NAME_TARGET_CHARS,
	NAME_MAX_CHARS,
	accept: acceptedName,
};
