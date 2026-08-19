import { describe, expect, it } from "bun:test";
import { createRouterClient } from "@orpc/server";
import { Favorites } from "@main/store/favorites";
import { favoritesRouter } from "@main/transport/rpc/favorites-router";
import { favoriteDraftSchema } from "@shared/favorites";

describe("favorites", () => {
	it("starts empty and keeps every favorite in the order it was added", async () => {
		expect(await Favorites.list()).toEqual([]);

		await Favorites.add({ title: "Docs", url: "https://docs.example.com/" });
		await Favorites.add({ title: "Status", url: "https://status.example.com/" });

		expect((await Favorites.list()).map((favorite) => favorite.title)).toEqual(["Docs", "Status"]);
	});

	it("renames a favorite and leaves its identity and its site alone", async () => {
		const added = await Favorites.add({ title: "Dosc", url: "https://docs.example.com/" });
		const renamed = await Favorites.update({ id: added.id, title: "Docs" });

		expect(renamed).toEqual({ id: added.id, title: "Docs", url: "https://docs.example.com/" });
	});

	it("reports a rename of a favorite that is gone instead of recreating it", () => {
		expect(() => Favorites.update({ id: "missing", title: "Docs" })).toThrow("Favorite not found: missing");
	});

	it("drops one favorite and keeps the rest", async () => {
		const added = await Favorites.add({ title: "Docs", url: "https://docs.example.com/" });
		await Favorites.add({ title: "Status", url: "https://status.example.com/" });

		await Favorites.remove(added.id);

		expect((await Favorites.list()).map((favorite) => favorite.title)).toEqual(["Status"]);
	});

	it("moves a favorite to the position the given order names", async () => {
		const first = await Favorites.add({ title: "Docs", url: "https://docs.example.com/" });
		const second = await Favorites.add({ title: "Status", url: "https://status.example.com/" });
		const third = await Favorites.add({ title: "Board", url: "https://board.example.com/" });

		const reordered = await Favorites.reorder([third.id, first.id, second.id]);

		expect(reordered.map((favorite) => favorite.title)).toEqual(["Board", "Docs", "Status"]);
		expect((await Favorites.list()).map((favorite) => favorite.id)).toEqual([third.id, first.id, second.id]);
	});

	it("refuses an order that names a favorite the app does not hold", async () => {
		const added = await Favorites.add({ title: "Docs", url: "https://docs.example.com/" });

		expect(() => Favorites.reorder([added.id, "missing"])).toThrow("Favorite not found: missing");
		expect((await Favorites.list()).map((favorite) => favorite.id)).toEqual([added.id]);
	});

	it("keeps a favorite the order does not name at the end of the list", async () => {
		const first = await Favorites.add({ title: "Docs", url: "https://docs.example.com/" });
		const second = await Favorites.add({ title: "Status", url: "https://status.example.com/" });

		expect((await Favorites.reorder([second.id])).map((favorite) => favorite.id)).toEqual([second.id, first.id]);
	});

	it("refuses a draft with an empty name or a site the session page cannot open", () => {
		expect(() => favoriteDraftSchema.assert({ title: "", url: "https://docs.example.com/" })).toThrow();
		expect(() => favoriteDraftSchema.assert({ title: "Docs", url: "http://docs.example.com/" })).toThrow();
		expect(() => favoriteDraftSchema.assert({ title: "Docs", url: "not a url" })).toThrow();
		expect(favoriteDraftSchema.assert({ title: "Docs", url: "http://localhost:3000" })).toEqual({
			title: "Docs",
			url: "http://localhost:3000/",
		});
	});

	it("refuses to save a site the session page cannot open", async () => {
		const client = createRouterClient(favoritesRouter);

		expect(() => client.add({ title: "Docs", url: "ftp://docs.example.com/" })).toThrow();
		expect(await client.list()).toEqual([]);
	});

	it("saves, renames, reorders and drops a favorite over RPC", async () => {
		const client = createRouterClient(favoritesRouter);
		const docs = await client.add({ title: "Dosc", url: "https://docs.example.com/" });
		const status = await client.add({ title: "Status", url: "https://status.example.com/" });

		await client.update({ id: docs.id, title: "Docs" });
		await client.reorder({ ids: [status.id, docs.id] });

		expect((await client.list()).map((favorite) => favorite.title)).toEqual(["Status", "Docs"]);

		await client.remove({ id: status.id });

		expect((await client.list()).map((favorite) => favorite.title)).toEqual(["Docs"]);
	});
});
