export function canSelfUpdate(input: {
	platform: NodeJS.Platform;
	execPath: string;
	appImage?: string;
	appDir?: string;
}): boolean {
	if (input.platform !== "linux") {
		return true;
	}

	if (!input.appImage || !input.appDir) {
		return false;
	}

	return input.execPath.startsWith(`${input.appDir}/`);
}
