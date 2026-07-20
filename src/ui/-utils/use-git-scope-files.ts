import { useCallback, useSyncExternalStore } from "react";
import type { GitScope } from "@core/git/gitScope";
import { GitScopes, type GitScopeState } from "@core/git/GitScopeStore";

const UNAVAILABLE: GitScopeState = { status: "unavailable" };

export function useGitScopeFiles(
	dir: string | undefined,
	scope: GitScope | null,
): GitScopeState | null {
	const subscribe = useCallback(
		(listener: () => void) =>
			scope === null || dir === undefined ? () => {} : GitScopes.watch(dir, scope, listener),
		[dir, scope],
	);

	return useSyncExternalStore(subscribe, () => {
		if (scope === null) {
			return null;
		}
		if (dir === undefined) {
			return UNAVAILABLE;
		}

		return GitScopes.get(dir, scope);
	});
}
