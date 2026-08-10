import "./register-dom";
import { afterEach, expect, test } from "bun:test";
import { useFocusTopBand } from "@renderer/routes/-features/workspace/layout/use-focus-top-band";
import { get, slot } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

afterEach(cleanup);

function Harness() {
	const { band, registerBand } = useFocusTopBand({ initialFullscreen: true });

	return (
		<div
			data-component="top-band"
			data-revealed={band.revealed}
			ref={registerBand}
			onFocus={band.onFocus}
			onBlur={band.onBlur}
		>
			<button type="button" data-slot="control">
				Close window
			</button>
		</div>
	);
}

const revealed = () => get("top-band").dataset.revealed;

function leaveRenderer() {
	fireEvent.pointerLeave(document.documentElement);
}

test("the pointer leaving the renderer withdraws the revealed band", () => {
	render(<Harness />);

	fireEvent.pointerMove(window, { clientY: 4 });
	expect(revealed()).toBe("true");

	leaveRenderer();

	expect(revealed()).toBe("false");
});

test("the band stays revealed while it holds the focus", () => {
	render(<Harness />);

	fireEvent.pointerMove(window, { clientY: 4 });
	fireEvent.focus(slot(get("top-band"), "control"));

	leaveRenderer();

	expect(revealed()).toBe("true");
});

test("the pointer coming back to the top edge reveals the band again", () => {
	render(<Harness />);

	fireEvent.pointerMove(window, { clientY: 4 });
	leaveRenderer();
	fireEvent.pointerMove(window, { clientY: 4 });

	expect(revealed()).toBe("true");
});

test("blurring the band after the pointer left withdraws it", () => {
	render(<Harness />);

	fireEvent.pointerMove(window, { clientY: 4 });
	const control = slot(get("top-band"), "control");
	fireEvent.focus(control);
	leaveRenderer();
	fireEvent.blur(control);

	expect(revealed()).toBe("false");
});
