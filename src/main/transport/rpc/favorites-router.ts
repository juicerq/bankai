import { type } from "arktype";
import { base } from "@main/transport/rpc/rpc-base";
import { Favorites } from "@main/store/favorites";
import { favoriteDraftSchema } from "@shared/favorites";

export const favoritesRouter = {
	list: base.handler(() => Favorites.list()),
	add: base.input(favoriteDraftSchema).handler(({ input }) => Favorites.add(input)),
	update: base
		.input(favoriteDraftSchema.pick("title").and({ id: "string" }))
		.handler(({ input }) => Favorites.update(input)),
	remove: base.input(type({ id: "string" })).handler(({ input }) => Favorites.remove(input.id)),
	reorder: base.input(type({ ids: "string[]" })).handler(({ input }) => Favorites.reorder(input.ids)),
};
