import { afterEach, expect, test } from "bun:test";
import { DropdownMenu, DropdownMenuItem } from "@renderer/routes/-features/shared/menus/dropdown-menu";
import { get, query } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

afterEach(cleanup);

function DropdownMenusHarness() {
	return (
		<>
			<DropdownMenu component="first" icon={<span />} label="First" ariaLabel="First menu">
				<DropdownMenuItem label="First action" onClick={() => {}} />
			</DropdownMenu>
			<DropdownMenu component="second" icon={<span />} label="Second" ariaLabel="Second menu">
				<DropdownMenuItem label="Second action" onClick={() => {}} />
			</DropdownMenu>
		</>
	);
}

function openMenu(component: string) {
	fireEvent.pointerDown(get(component));
	fireEvent.click(get(component));
}

test("opening a menu closes the one already open", () => {
	render(<DropdownMenusHarness />);

	openMenu("first");
	openMenu("second");

	expect(query("first-menu")).toBeNull();
	expect(query("second-menu")).not.toBeNull();
});

test("clicking an open menu's own trigger closes it", () => {
	render(<DropdownMenusHarness />);

	openMenu("first");
	openMenu("first");

	expect(query("first-menu")).toBeNull();
});

test("clicking outside closes the menu even where the surface stops propagation", () => {
	render(
		<div data-component="surface" onPointerDown={(event) => event.stopPropagation()}>
			<DropdownMenusHarness />
		</div>,
	);

	openMenu("first");
	fireEvent.pointerDown(get("surface"));

	expect(query("first-menu")).toBeNull();
});

test("clicking inside the menu keeps it open until the item runs", () => {
	render(<DropdownMenusHarness />);

	openMenu("first");
	fireEvent.pointerDown(get("first-menu"));

	expect(query("first-menu")).not.toBeNull();
});
