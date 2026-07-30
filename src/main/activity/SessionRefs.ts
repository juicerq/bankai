export const SESSION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SessionRef {
	harness: string;
	sessionId: string;
	cwd: string;
}

export interface ShellSessionObservation {
	shellId: string;
	projectId: string;
	session: SessionRef | undefined;
}

export type SessionRefChange =
	| { kind: "upsert"; projectId: string; shellId: string; session: SessionRef }
	| { kind: "clear"; projectId: string; shellId: string };

function sameRef(remembered: SessionRef | undefined, observed: SessionRef): boolean {
	if (!remembered) {
		return false;
	}

	return remembered.harness === observed.harness
		&& remembered.sessionId === observed.sessionId
		&& remembered.cwd === observed.cwd;
}

export function reconcileSessionRefs(
	previous: Map<string, SessionRef>,
	observations: ShellSessionObservation[],
): { changes: SessionRefChange[]; next: Map<string, SessionRef> } {
	const changes: SessionRefChange[] = [];
	const next = new Map<string, SessionRef>();

	for (const observation of observations) {
		const remembered = previous.get(observation.shellId);

		if (observation.session) {
			next.set(observation.shellId, observation.session);
			if (!sameRef(remembered, observation.session)) {
				changes.push({
					kind: "upsert",
					projectId: observation.projectId,
					shellId: observation.shellId,
					session: observation.session,
				});
			}

			continue;
		}

		if (remembered) {
			changes.push({ kind: "clear", projectId: observation.projectId, shellId: observation.shellId });
		}
	}

	return { changes, next };
}
