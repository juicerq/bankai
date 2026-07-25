import { afterEach, expect, test } from "bun:test";
import { HeaderMenu, HeaderMenuItem } from "@renderer/routes/-components/header-menu";
import { get, query } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

afterEach(cleanup);

function HeaderMenusHarness() {
	return (
		<>
			<HeaderMenu component="first" icon={<span />} label="First" ariaLabel="First menu">
				<HeaderMenuItem label="First action" onClick={() => {}} />
			</HeaderMenu>
			<HeaderMenu component="second" icon={<span />} label="Second" ariaLabel="Second menu">
				<HeaderMenuItem label="Second action" onClick={() => {}} />
			</HeaderMenu>
		</>
	);
}

function openMenu(component: string) {
	fireEvent.pointerDown(get(component));
	fireEvent.click(get(component));
}

test("opening a menu closes the one already open", () => {
	render(<HeaderMenusHarness />);

	openMenu("first");
	openMenu("second");

	expect(query("first-menu")).toBeNull();
	expect(query("second-menu")).not.toBeNull();
});

test("clicking an open menu's own trigger closes it", () => {
	render(<HeaderMenusHarness />);

	openMenu("first");
	openMenu("first");

	expect(query("first-menu")).toBeNull();
});
