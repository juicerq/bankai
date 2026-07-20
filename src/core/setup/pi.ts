import { execFile } from "node:child_process";
import {
	lstat,
	mkdir,
	readlink,
	rename,
	symlink,
	unlink,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { PI_COMPANION_ENTRY } from "@core/harness/pi/protocol";

const execFileAsync = promisify(execFile);
const PI_COMPATIBLE_MAJOR = 0;
const PI_COMPATIBLE_MINOR = 80;
const PI_MINIMUM_PATCH = 10;

export function compatiblePiVersion(output: string): boolean {
	const match = /(?:^|\s)(\d+)\.(\d+)\.(\d+)(?:\s|$)/.exec(output.trim());
	if (!match) {
		return false;
	}

	return Number(match[1]) === PI_COMPATIBLE_MAJOR
		&& Number(match[2]) === PI_COMPATIBLE_MINOR
		&& Number(match[3]) >= PI_MINIMUM_PATCH;
}

function piAgentDirectory(): string {
	return process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
}

function isBankaiCompanion(target: string): boolean {
	return basename(target) === PI_COMPANION_ENTRY
		|| basename(target) === "pi-companion.ts";
}

export async function installPiCompanion(input: {
	agentDirectory: string;
	companionPath: string;
}): Promise<string> {
	const artifact = await lstat(input.companionPath).catch(() => null);
	if (!artifact?.isFile()) {
		throw new Error(`bankai Pi companion artifact is missing: ${input.companionPath}`);
	}
	if (extname(input.companionPath) !== ".js") {
		throw new Error(`bankai Pi companion artifact must be compiled JavaScript: ${input.companionPath}`);
	}

	const extensions = join(input.agentDirectory, "extensions");
	const destination = join(extensions, PI_COMPANION_ENTRY);
	const current = await lstat(destination).catch(() => null);
	if (current && !current.isSymbolicLink()) {
		throw new Error(`refusing to overwrite non-symlink Pi extension: ${destination}`);
	}
	if (current?.isSymbolicLink()) {
		const target = await readlink(destination);
		if (!isBankaiCompanion(target)) {
			throw new Error(`refusing to overwrite foreign Pi extension link: ${destination}`);
		}
		if (target === input.companionPath) {
			return destination;
		}
	}

	await mkdir(extensions, { recursive: true });
	const temporary = `${destination}.${process.pid}.tmp`;
	await unlink(temporary).catch(() => {});
	await symlink(input.companionPath, temporary);
	await rename(temporary, destination).catch(async (error) => {
		await unlink(temporary).catch(() => {});
		throw error;
	});
	return destination;
}

function shippedCompanionPath(): string {
	const besideExecutable = join(import.meta.dirname, PI_COMPANION_ENTRY);
	if (import.meta.url.endsWith("/dist/index.js")) {
		return besideExecutable;
	}

	return fileURLToPath(new URL("../../../dist/bankai-pi-companion.js", import.meta.url));
}

async function installedPiVersion(): Promise<string> {
	const { stdout } = await execFileAsync("pi", ["--version"]);
	return stdout.trim();
}

export async function setupPi(input?: { companionPath?: string }): Promise<string> {
	const version = await installedPiVersion().catch((error) => {
		throw new Error(`Pi is not available: ${String(error)}`);
	});
	if (!compatiblePiVersion(version)) {
		throw new Error(
			`incompatible Pi version ${version || "unknown"}; bankai requires 0.80.${PI_MINIMUM_PATCH} or newer within the 0.80 release`,
		);
	}

	return await installPiCompanion({
		agentDirectory: piAgentDirectory(),
		companionPath: input?.companionPath ?? shippedCompanionPath(),
	});
}
