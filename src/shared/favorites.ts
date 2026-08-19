import { type } from "arktype";
import { SessionPageSchemas } from "@shared/session-page";

export const favoriteSchema = type({
	id: "string",
	title: "string",
	url: "string",
});

export const favoriteDraftSchema = type({
	title: type("string").atLeastLength(1).atMostLength(60),
	url: type("string").atMostLength(2000).pipe(SessionPageSchemas.url),
});

export type Favorite = typeof favoriteSchema.infer;
export type FavoriteDraft = typeof favoriteDraftSchema.infer;
