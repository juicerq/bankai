export function get(component: string, filters?: Record<string, string>) {
	const matches = [...document.querySelectorAll<HTMLElement>(`[data-component="${component}"]`)]
		.filter((element) => !filters || Object.entries(filters).every(([key, value]) => element.dataset[key] === value));
	const [match] = matches;

	if (!match || matches.length !== 1) {
		throw new Error(`Expected one ${component}, found ${matches.length}`);
	}

	return match;
}

export function query(component: string, filters?: Record<string, string>) {
	const matches = [...document.querySelectorAll<HTMLElement>(`[data-component="${component}"]`)]
		.filter((element) => !filters || Object.entries(filters).every(([key, value]) => element.dataset[key] === value));
	const [match] = matches;

	if (matches.length > 1) {
		throw new Error(`Expected at most one ${component}, found ${matches.length}`);
	}

	if (!match) {
		return null;
	}

	return match;
}

export function slot<Element extends HTMLElement = HTMLElement>(parent: HTMLElement, name: string) {
	const matches = [...parent.querySelectorAll<Element>(`[data-slot="${name}"]`)];
	const [match] = matches;

	if (!match || matches.length !== 1) {
		throw new Error(`Expected one ${name} slot, found ${matches.length}`);
	}

	return match;
}
