import { useCallback, useMemo, useState } from "react";

export type ProjectMark = "chosen" | "excluded";

export type ProjectMarks = ReadonlyMap<string, ProjectMark>;

export function useProjectNarrowing() {
	const [marks, setMarks] = useState<ProjectMarks>(() => new Map());

	const mark = useCallback((projectId: string, wanted: ProjectMark) => {
		setMarks((current) => {
			const next = new Map(current);

			if (current.get(projectId) === wanted) {
				next.delete(projectId);
			} else {
				next.set(projectId, wanted);
			}

			return next;
		});
	}, []);

	const toggle = useCallback((projectId: string) => mark(projectId, "chosen"), [mark]);
	const exclude = useCallback((projectId: string) => mark(projectId, "excluded"), [mark]);

	const forget = useCallback((projectId: string) => {
		setMarks((current) => {
			if (!current.has(projectId)) {
				return current;
			}

			const next = new Map(current);
			next.delete(projectId);

			return next;
		});
	}, []);

	const includesProject = useMemo(() => narrowing(marks), [marks]);

	return { marks, toggle, exclude, forget, includesProject };
}

function narrowing(marks: ProjectMarks): (projectId: string) => boolean {
	const chosen = [...marks.values()].includes("chosen");

	if (chosen) {
		return (projectId) => marks.get(projectId) === "chosen";
	}

	return (projectId) => marks.get(projectId) !== "excluded";
}
