import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { createRouterClient } from "@orpc/server";
import { reviewRouter } from "@main/transport/rpc/review-router";
import { Projects } from "@main/store/projects";
import { assertDefined } from "./utils/assertions";

describe("review router", () => {
	it("propagates cancellation from the RPC caller to content search", async () => {
		const dataDir = process.env.DATA_DIR;
		assertDefined(dataDir);
		const projectPath = join(dataDir, "search-project");
		const bin = join(dataDir, "search-rpc-bin");
		const startedFile = join(dataDir, "search-rpc-started");
		const git = join(bin, "git");
		mkdirSync(projectPath);
		mkdirSync(bin);
		writeFileSync(
			git,
			`#!/usr/bin/env bun\nimport { writeFileSync } from "node:fs";\nwriteFileSync(process.env.SEARCH_STARTED_FILE, String(process.pid));\nsetInterval(() => {}, 1000);\n`,
		);
		chmodSync(git, 0o755);
		const originalPath = process.env.PATH;
		assertDefined(originalPath);
		process.env.PATH = `${bin}:${originalPath}`;
		process.env.SEARCH_STARTED_FILE = startedFile;
		const project = await Projects.add(projectPath);
		const controller = new AbortController();
		const client = createRouterClient(reviewRouter);

		try {
			const search = client.searchContent(
				{ projectId: project.id, query: "needle" },
				{ signal: controller.signal },
			);
			while (!(await Bun.file(startedFile).exists())) {
				await Bun.sleep(5);
			}
			const pid = Number(readFileSync(startedFile, "utf8"));
			controller.abort(new Error("search superseded"));

			expect(() => search).toThrow("search superseded");
			expect(() => process.kill(pid, 0)).toThrow();
			expect(await Bun.file(join(dataDir, "log.ndjson")).exists()).toBe(false);
		} finally {
			controller.abort();
			process.env.PATH = originalPath;
			delete process.env.SEARCH_STARTED_FILE;
		}
	});
});
