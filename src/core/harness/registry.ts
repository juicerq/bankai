import { type } from "arktype";
import type { HarnessIntegration, NativeSessionRecord } from "@core/harness/Harness";
import { ClaudeHarness } from "@core/harness/claude";
import { CodexHarness } from "@core/harness/codex";
import { Logger } from "@core/logger";

const integrations = [ClaudeHarness, CodexHarness] as const;
const byId = new Map<string, HarnessIntegration>(
	integrations.map((integration) => [integration.id, integration]),
);
export const harnessId = type.enumerated(...integrations.map((integration) => integration.id));

export type HarnessId = typeof integrations[number]["id"];
export const harnessIds = integrations.map((integration) => integration.id);
export const sessionRef = type({ harness: harnessId, sessionId: "string" });
export type SessionRef = typeof sessionRef.infer;

export interface SessionDiscoveryRecord extends NativeSessionRecord {
	harness: HarnessId;
}

export function sessionKey(session: SessionRef): string {
	return `${session.harness}:${session.sessionId}`;
}

export function sameSession(
	left: SessionRef | null,
	right: SessionRef | null,
): boolean {
	return left?.harness === right?.harness
		&& left?.sessionId === right?.sessionId;
}

async function discover(): Promise<SessionDiscoveryRecord[]> {
	const discovered = await Promise.all(integrations.map(async (integration) => {
		const records = await integration.discovery.discover().catch((error) => {
			Logger.warn("harness:discovery-failed", {
				harness: integration.id,
				error: String(error),
			});
			return [];
		});

		return records.map((record) => ({
			...record,
			harness: integration.id,
		}));
	}));

	return discovered.flat();
}

export const Harnesses = {
	get(id: HarnessId): HarnessIntegration {
		const integration = byId.get(id);
		if (!integration) {
			throw new Error(`unknown Harness: ${id}`);
		}

		return integration;
	},
	discover,
};
