import "./register-dom";
import { afterEach, expect, test } from "bun:test";
import { SessionPageAddress } from "@renderer/routes/-features/session-page/session-page-address";
import { get } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

afterEach(cleanup);

const field = () => get<HTMLInputElement>("session-page-address");

function edit(value: string) {
	fireEvent.focus(field());
	fireEvent.input(field(), { target: { value } });
}

test("submitting a valid address navigates to its canonical form", () => {
	const navigations: string[] = [];
	render(<SessionPageAddress url="https://example.com/path" onNavigate={(url) => navigations.push(url)} />);

	edit("https://other.test");
	fireEvent.keyDown(field(), { key: "Enter" });

	expect(navigations).toEqual(["https://other.test/"]);
	expect(field().dataset.invalid).toBe("false");
});

test("a bare host is completed with https before navigating", () => {
	const navigations: string[] = [];
	render(<SessionPageAddress url="https://example.com/path" onNavigate={(url) => navigations.push(url)} />);

	edit("example.com");
	fireEvent.keyDown(field(), { key: "Enter" });

	expect(navigations).toEqual(["https://example.com/"]);
});

test("a rejected address keeps the draft, flags the field and does not navigate", () => {
	const navigations: string[] = [];
	render(<SessionPageAddress url="https://example.com/path" onNavigate={(url) => navigations.push(url)} />);

	edit("ftp://example.com");
	fireEvent.keyDown(field(), { key: "Enter" });

	expect(navigations).toEqual([]);
	expect(field().dataset.invalid).toBe("true");
	expect(field().value).toBe("ftp://example.com");
});

test("escape discards the draft and restores the current address", () => {
	const navigations: string[] = [];
	render(<SessionPageAddress url="https://example.com/path" onNavigate={(url) => navigations.push(url)} />);

	edit("ftp://example.com");
	fireEvent.keyDown(field(), { key: "Enter" });
	fireEvent.keyDown(field(), { key: "Escape" });

	expect(field().value).toBe("https://example.com/path");
	expect(field().dataset.invalid).toBe("false");
	expect(navigations).toEqual([]);
});

test("blur discards the draft and restores the current address", () => {
	render(<SessionPageAddress url="https://example.com/path" onNavigate={() => {}} />);

	edit("half-typed");
	fireEvent.blur(field());

	expect(field().value).toBe("https://example.com/path");
});

test("enter without an edit does not navigate", () => {
	const navigations: string[] = [];
	render(<SessionPageAddress url="https://example.com/path" onNavigate={(url) => navigations.push(url)} />);

	fireEvent.focus(field());
	fireEvent.keyDown(field(), { key: "Enter" });

	expect(navigations).toEqual([]);
});

test("focus selects the whole address", () => {
	render(<SessionPageAddress url="https://example.com/path" onNavigate={() => {}} />);

	fireEvent.focus(field());

	expect(field().selectionStart).toBe(0);
	expect(field().selectionEnd).toBe("https://example.com/path".length);
});

test("an address changed by the page itself replaces the field while it is not edited", () => {
	const view = render(<SessionPageAddress url="https://example.com/path" onNavigate={() => {}} />);

	view.rerender(<SessionPageAddress url="https://example.com/next" onNavigate={() => {}} />);

	expect(field().value).toBe("https://example.com/next");
});

test("an address changed by the page itself does not overwrite an open draft", () => {
	const view = render(<SessionPageAddress url="https://example.com/path" onNavigate={() => {}} />);

	edit("typing.test");
	view.rerender(<SessionPageAddress url="https://example.com/next" onNavigate={() => {}} />);

	expect(field().value).toBe("typing.test");
});
