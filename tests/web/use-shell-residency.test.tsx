import "./register-dom";
import { expect, test } from "bun:test";
import { type ResidencyShell, useShellResidency } from "@renderer/routes/-features/sessions/lifecycle/use-shell-residency";
import { act, renderHook } from "./testing-library";

const SESSION = { harness: "claude", sessionId: "abc", cwd: "/repo" };

function renderResidency(shells: ResidencyShell[]) {
	return renderHook(() => useShellResidency({ shells }));
}

test("an archived shell starts asleep and stays asleep across a re-render", () => {
	const { result, rerender } = renderResidency([{ id: "s1", archivedAt: 10, session: SESSION }]);

	expect(result.current.asleep.has("s1")).toBe(true);

	rerender();

	expect(result.current.asleep.has("s1")).toBe(true);
});

test("waking an archived shell keeps it running until it is filed again", () => {
	const { result } = renderResidency([{ id: "s1", archivedAt: 10, session: SESSION }]);

	act(() => result.current.wake("s1"));

	expect(result.current.asleep.has("s1")).toBe(false);

	act(() => result.current.sleep("s1"));

	expect(result.current.asleep.has("s1")).toBe(true);
});

test("filing a shell that was never woken still puts it to sleep", () => {
	const shell: ResidencyShell = { id: "s1", session: SESSION };
	const { result, rerender } = renderHook(
		(props: { shells: ResidencyShell[] }) => useShellResidency({ shells: props.shells }),
		{ initialProps: { shells: [shell] } },
	);

	expect(result.current.asleep.has("s1")).toBe(false);

	act(() => result.current.sleep("s1"));
	rerender({ shells: [{ ...shell, archivedAt: 10 }] });

	expect(result.current.asleep.has("s1")).toBe(true);
});
