import { type } from "arktype";
import { Store } from "@core/store/Store";

const nonEmpty = type("string").pipe((value) => value.trim()).pipe(type("string > 0"));
const project = type({ id: "string", cwd: nonEmpty, name: nonEmpty });
const projectInput = type({ cwd: nonEmpty, name: nonEmpty });
const projectsContract = project.array();

export type Project = typeof project.infer;
type ProjectsValue = typeof projectsContract.infer;

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

	add: async (input: { cwd: string; name: string }) => {
		const value = projectInput.assert(input);
		return await store.mutate((current) => [
			...current,
			{ id: crypto.randomUUID(), ...value },
		]);
	},

	remove: (id: string) =>
		store.mutate((current) => current.filter((p) => p.id !== id)),

	rename: async (id: string, name: string) => {
		const nextName = nonEmpty.assert(name);
		return await store.mutate((current) => {
			return current.map((project) =>
				project.id === id ? { ...project, name: nextName } : project);
		});
	},

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
