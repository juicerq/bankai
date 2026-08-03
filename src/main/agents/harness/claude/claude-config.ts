import { homedir } from "node:os";
import { join } from "node:path";

export function claudeConfigDir(): string {
	return process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
}
