import { afterEach, expect, test } from "bun:test";
import { useRef, useState } from "react";
import { Divider } from "@renderer/routes/-features/shared/interaction/divider";
import { useDivider } from "@renderer/routes/-features/shared/interaction/use-divider";
import { get, slot } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

afterEach(cleanup);

function DividerHarness({ sign }: { sign: 1 | -1 }) {
	const [width, setWidth] = useState(810);
	const host = useRef<HTMLDivElement>(null);
	const control = useDivider({
		value: width,
		min: 0,
		max: 5000,
		sign,
		target: host,
		resolve: (proposed) => ({
			vars: [{ property: "--w", value: proposed }],
			commit: () => setWidth(proposed),
		}),
	});

	return (
		<main data-component="divider-host" data-width={width} data-resizing={control.resizing} ref={host}>
			<Divider control={control} side="left" label="Resize" />
		</main>
	);
}

test("commits the pointer release position even when movement outruns rendering", () => {
	render(<DividerHarness sign={-1} />);

	const handle = slot(get("divider-host"), "resize");
	fireEvent.pointerDown(handle, { clientX: 800, pointerId: 1 });
	fireEvent.pointerUp(handle, { clientX: 400, pointerId: 1 });

	expect(get("divider-host").dataset.width).toBe("1210");
	expect(get("divider-host").dataset.resizing).toBe("false");
});

test("tracks the pointer through CSS variables before committing on release", () => {
	render(<DividerHarness sign={-1} />);

	const host = get("divider-host");
	const handle = slot(host, "resize");
	fireEvent.pointerDown(handle, { clientX: 800, pointerId: 1 });
	fireEvent.pointerMove(handle, { clientX: 700, pointerId: 1 });

	expect(host.style.getPropertyValue("--w")).toBe("910px");
	expect(host.dataset.width).toBe("810");

	fireEvent.pointerUp(handle, { clientX: 700, pointerId: 1 });
	expect(host.dataset.width).toBe("910");
});

test("keyboard arrows step the width by the divider step", () => {
	render(<DividerHarness sign={1} />);

	const handle = slot(get("divider-host"), "resize");
	fireEvent.keyDown(handle, { key: "ArrowRight" });
	expect(get("divider-host").dataset.width).toBe("818");

	fireEvent.keyDown(handle, { key: "ArrowLeft" });
	expect(get("divider-host").dataset.width).toBe("810");
});
