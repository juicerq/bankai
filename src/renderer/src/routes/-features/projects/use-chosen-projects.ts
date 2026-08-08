import { useCallback, useState } from "react";

export function useChosenProjects() {
	const [projectIds, setProjectIds] = useState<ReadonlySet<string>>(() => new Set());

	const toggle = useCallback((projectId: string) => {
		setProjectIds((current) => {
			const next = new Set(current);

			if (!next.delete(projectId)) {
				next.add(projectId);
			}

			return next;
		});
	}, []);

	const chooseAllExcept = useCallback((projectId: string, listedIds: readonly string[]) => {
		setProjectIds((current) => {
			const next = new Set(listedIds.filter((id) => id !== projectId));

			if (next.size === current.size && [...next].every((id) => current.has(id))) {
				return new Set();
			}

			return next;
		});
	}, []);

	const forget = useCallback((projectId: string) => {
		setProjectIds((current) => {
			if (!current.has(projectId)) {
				return current;
			}

			const next = new Set(current);
			next.delete(projectId);

			return next;
		});
	}, []);

	return { projectIds, toggle, chooseAllExcept, forget };
}
