import { type } from "arktype";
import { Store } from "@core/store/Store";

const project = type({ id: "string", cwd: "string", name: "string" });
const projectsContract = project.array();

export type Project = typeof project.infer;
type ProjectsValue = typeof projectsContract.infer;

// Order is the array position — the sidebar renders top-to-bottom, so persisting
// the ordered array persists the order without a separate field to keep in sync.
const store = new Store({
	name: "projects",
	version: 1,
	contract: projectsContract,
	migrators: {},
	seed: (): ProjectsValue => [],
});

function swap(list: Project[], a: number, b: number): Project[] {
	const next = [...list];
	const first = next[a]!;
	next[a] = next[b]!;
	next[b] = first;
	return next;
}

export const Projects = {
	list: () => store.read(),

	add: (input: { cwd: string; name: string }) =>
		store.mutate((current) => [
			...current,
			{ id: crypto.randomUUID(), cwd: input.cwd.trim(), name: input.name.trim() },
		]),

	remove: (id: string) =>
		store.mutate((current) => current.filter((p) => p.id !== id)),

	rename: (id: string, name: string) =>
		store.mutate((current) =>
			current.map((p) => (p.id === id ? { ...p, name: name.trim() } : p)),
		),

	move: (input: { id: string; direction: "up" | "down" }) =>
		store.mutate((current) => {
			const index = current.findIndex((p) => p.id === input.id);
			const target = input.direction === "up" ? index - 1 : index + 1;
			if (index < 0 || target < 0 || target >= current.length) {
				return current;
			}

			return swap(current, index, target);
		}),
};
