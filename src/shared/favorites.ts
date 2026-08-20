import { type } from "arktype";
import { SessionPageSchemas } from "@shared/session-page";

const preview = type("string").narrow((value) => value.startsWith("data:image/jpeg;base64,"));

export const favoriteSchema = type({
	id: "string",
	title: "string",
	url: "string",
	"preview?": "string",
});

export const favoriteDraftSchema = type({
	title: type("string").atLeastLength(1).atMostLength(60),
	url: type("string").atMostLength(2000).pipe(SessionPageSchemas.url),
	"preview?": preview,
});

export type Favorite = typeof favoriteSchema.infer;
export type FavoriteDraft = typeof favoriteDraftSchema.infer;
