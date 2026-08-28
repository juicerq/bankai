import { type } from "arktype";

export const reviewClosedTargetSchema = type({
	kind: type.enumerated("file", "directory"),
	path: "string >= 1",
});

export type ReviewClosedTarget = typeof reviewClosedTargetSchema.infer;

function sameTarget(left: ReviewClosedTarget, right: ReviewClosedTarget) {
	return left.kind === right.kind && left.path === right.path;
}

export const ReviewDefaultClosure = {
	has(targets: readonly ReviewClosedTarget[], target: ReviewClosedTarget) {
		return targets.some((candidate) => sameTarget(candidate, target));
	},

	matches(targets: readonly ReviewClosedTarget[], path: string) {
		return targets.some((target) =>
			target.kind === "file" ? target.path === path : path.startsWith(`${target.path}/`),
		);
	},

	closedFiles(
		paths: readonly string[],
		targets: readonly ReviewClosedTarget[],
		overrides: ReadonlyMap<string, boolean>,
	) {
		const closed = new Set<string>();
		for (const path of paths) {
			if (overrides.get(path) ?? ReviewDefaultClosure.matches(targets, path)) {
				closed.add(path);
			}
		}
		return closed;
	},

	update(targets: readonly ReviewClosedTarget[], target: ReviewClosedTarget, closed: boolean) {
		const present = ReviewDefaultClosure.has(targets, target);
		if (present === closed) {
			return [...targets];
		}

		if (closed) {
			return [...targets, target];
		}

		return targets.filter((candidate) => !sameTarget(candidate, target));
	},
};
