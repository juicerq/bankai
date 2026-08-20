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

function SearchMenuHarness({ onPick = () => {} }: { onPick?: (label: string) => void }) {
	return (
		<DropdownMenu
			component="first"
			icon={<span />}
			label="First"
			ariaLabel="First menu"
			search={{ placeholder: "Filter actions" }}
		>
			{(filter) =>
				["Alpha", "Beta"]
					.filter((label) => label.toLowerCase().includes(filter.toLowerCase()))
					.map((label) => <DropdownMenuItem key={label} label={label} onClick={() => onPick(label)} />)
			}
		</DropdownMenu>
	);
}

function menuItem(index: number) {
	const item = [...get("first-menu").querySelectorAll<HTMLElement>('[role="menuitem"]')].at(index);
	if (!item) {
		throw new Error(`No menu item at ${index}`);
	}

	return item;
}

test("a menu without a search takes focus so the arrows work at once", () => {
	render(<DropdownMenusHarness />);

	openMenu("first");

	expect(document.activeElement).toBe(get("first-menu"));

	fireEvent.keyDown(get("first-menu"), { key: "ArrowDown" });

	expect(document.activeElement?.textContent).toBe("First action");
});

test("arrow keys walk the menu items and wrap around", () => {
	render(<SearchMenuHarness />);

	openMenu("first");
	fireEvent.keyDown(get("first-menu"), { key: "ArrowDown" });
	fireEvent.keyDown(get("first-menu"), { key: "ArrowDown" });

	expect(document.activeElement).toBe(menuItem(1));

	fireEvent.keyDown(get("first-menu"), { key: "ArrowDown" });

	expect(document.activeElement).toBe(menuItem(0));

	fireEvent.keyDown(get("first-menu"), { key: "ArrowUp" });

	expect(document.activeElement).toBe(menuItem(1));
});

test("enter in the search picks the first match", () => {
	const picked: string[] = [];
	render(<SearchMenuHarness onPick={(label) => picked.push(label)} />);

	openMenu("first");
	const search = get("first-menu").querySelector<HTMLInputElement>('[data-slot="search-input"]');
	if (!search) {
		throw new Error("No search input");
	}

	fireEvent.input(search, { target: { value: "bet" } });
	fireEvent.keyDown(search, { key: "Enter" });

	expect(picked).toEqual(["Beta"]);
	expect(query("first-menu")).toBeNull();
});

test("arrow keys from the search move into the filtered items", () => {
	render(<SearchMenuHarness />);

	openMenu("first");
	fireEvent.keyDown(get("first-menu"), { key: "ArrowDown" });

	expect(document.activeElement).toBe(menuItem(0));
});
