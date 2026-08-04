import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

function escapes(root: string, target: string): boolean {
	const fromRoot = relative(root, target);

	return fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot);
}

async function assertWithin({ root, file }: { root: string; file: string }): Promise<void> {
	if (isAbsolute(file)) {
		throw new Error("File path must be relative to the repository root");
	}

	if (escapes(resolve(root), resolve(root, file))) {
		throw new Error("File path must stay within the repository root");
	}

	const resolvedFile = await realpath(resolve(root, file)).catch((err) => {
		if (err instanceof Error && "code" in err && err.code === "ENOENT") {
			return null;
		}

		throw err;
	});
	if (!resolvedFile) {
		return;
	}

	if (escapes(await realpath(root), resolvedFile)) {
		throw new Error("File path must stay within the repository root");
	}
}

export const RepoPath = {
	assertWithin,
};
