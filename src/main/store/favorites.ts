import { randomUUID } from "node:crypto";
import { Store } from "@main/store/store";
import { type Favorite, type FavoriteDraft, favoriteSchema } from "@shared/favorites";

const store = new Store({
	name: "favorites",
	version: 1,
	contract: favoriteSchema.array(),
	migrators: {},
	seed: (): Favorite[] => [],
});

export const Favorites = {
	list: store.read.bind(store),

	add: async (draft: FavoriteDraft): Promise<Favorite> => {
		const favorite: Favorite = { id: randomUUID(), ...draft };
		await store.mutate((current) => [...current, favorite]);

		return favorite;
	},

	update: async (input: { id: string; title: string }): Promise<Favorite> => {
		const updated = await store.mutate((current) =>
			current.map((favorite) => (favorite.id === input.id ? { ...favorite, title: input.title } : favorite))
		);
		const favorite = updated.find((candidate) => candidate.id === input.id);

		if (!favorite) {
			throw new Error(`Favorite not found: ${input.id}`);
		}

		return favorite;
	},

	remove: async (id: string): Promise<void> => {
		await store.mutate((current) => current.filter((favorite) => favorite.id !== id));
	},

	reorder: (ids: string[]): Promise<Favorite[]> =>
		store.mutate((current) => {
			if (new Set(ids).size !== ids.length) {
				throw new Error("Favorite order names the same favorite twice");
			}

			const ordered = ids.map((id) => {
				const favorite = current.find((candidate) => candidate.id === id);

				if (!favorite) {
					throw new Error(`Favorite not found: ${id}`);
				}

				return favorite;
			});

			return [...ordered, ...current.filter((favorite) => !ids.includes(favorite.id))];
		}),
};
