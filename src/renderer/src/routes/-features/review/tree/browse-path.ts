function lastSeparatorIndex(path: string) {
	return Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
}

export function browseDirectoryPath(path: string) {
	const separator = lastSeparatorIndex(path);

	if (separator < 0) {
		return "";
	}

	return path.slice(0, separator + 1);
}

export function browseLeafSegment(path: string) {
	return path.slice(lastSeparatorIndex(path) + 1);
}

export function browseParentPath(path: string) {
	const directory = browseDirectoryPath(path);
	const separator = lastSeparatorIndex(directory.slice(0, -1));

	if (separator < 0) {
		return null;
	}

	return directory.slice(0, separator + 1);
}

export function browseSeparator(path: string) {
	if (path.includes("\\")) {
		return "\\";
	}

	return "/";
}

export function appendBrowseSegment(path: string, segment: string) {
	const directory = browseDirectoryPath(path);

	return `${directory}${segment}${browseSeparator(directory)}`;
}
