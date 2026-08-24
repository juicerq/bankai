import { expect, test } from "bun:test";
import { APP_VERSION } from "@main/infra/app-version";

test("the app reads a released version out of its own manifest", () => {
	expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
});
