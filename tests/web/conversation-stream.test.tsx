import "./register-dom";
import { streamTransport } from "./stream-transport";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { useConversation } from "@renderer/routes/mobile/-utils/use-conversation";
import type { ConversationSnapshot } from "@shared/conversation";
import { act, cleanup, render, waitFor } from "./testing-library";

afterEach(cleanup);

const BACKFILL: ConversationSnapshot = {
	blocks: [
		{ kind: "user", id: "u1", text: "adiciona retry" },
		{ kind: "tool", id: "t1", name: "Edit", state: "running" },
	],
	title: "Retry no upload",
	startOffset: 2048,
	atStart: false,
};

function Probe({ shellId }: { shellId: string }) {
	const conversation = useConversation(shellId);

	return (
		<div
			data-testid="probe"
			data-title={conversation.title}
			data-at-start={String(conversation.atStart)}
			data-loading={String(conversation.loading)}
			data-loading-older={String(conversation.loadingOlder)}
		>
			<button type="button" data-testid="older" onClick={() => void conversation.loadOlder()}>older</button>
			{conversation.blocks.map((block) => `${block.id}:${block.kind === "tool" ? block.state : "-"}`).join(" ")}
		</div>
	);
}

function readBlocks(): string {
	return probe().textContent?.replace("older", "") ?? "";
}

function pullOlder() {
	const button = document.querySelector<HTMLElement>('[data-testid="older"]');
	if (!button) {
		throw new Error("The older-history trigger is not mounted");
	}

	act(() => button.click());
}

function probe() {
	const element = document.querySelector<HTMLElement>('[data-testid="probe"]');
	if (!element) {
		throw new Error("The conversation probe is not mounted");
	}

	return element;
}

beforeEach(() => {
	streamTransport.reset();
	streamTransport.handle("conversation", "subscribe", () => BACKFILL);
});

test("opening a conversation asks for the shell's transcript and paints the backfill", async () => {
	render(<Probe shellId="s1" />);

	await waitFor(() => expect(probe().dataset.loading).toBe("false"));

	expect(streamTransport.payloads("conversation", "subscribe")).toEqual([{ shellId: "s1" }]);
	expect(readBlocks()).toBe("u1:- t1:running");
	expect(probe().dataset.title).toBe("Retry no upload");
	expect(probe().dataset.atStart).toBe("false");
});

test("a pushed block lands at the end and a settled tool changes in place", async () => {
	render(<Probe shellId="s1" />);
	await waitFor(() => expect(probe().dataset.loading).toBe("false"));

	act(() => {
		streamTransport.push("conversation", "appended", {
			shellId: "s1",
			blocks: [
				{ kind: "tool", id: "t1", name: "Edit", state: "done" },
				{ kind: "agent", id: "m1", text: "Pronto." },
			],
			title: "Retry no upload de fotos",
		});
	});

	await waitFor(() => expect(readBlocks()).toBe("u1:- t1:done m1:-"));
	expect(probe().dataset.title).toBe("Retry no upload de fotos");
});

test("a push for another shell is not this conversation", async () => {
	render(<Probe shellId="s1" />);
	await waitFor(() => expect(probe().dataset.loading).toBe("false"));

	act(() => {
		streamTransport.push("conversation", "appended", {
			shellId: "s2",
			blocks: [{ kind: "agent", id: "m9", text: "outra sessão" }],
		});
	});

	expect(readBlocks()).toBe("u1:- t1:running");
});

test("a reset replaces the conversation, which is how a new agent session arrives", async () => {
	render(<Probe shellId="s1" />);
	await waitFor(() => expect(probe().dataset.loading).toBe("false"));

	act(() => {
		streamTransport.push("conversation", "reset", {
			shellId: "s1",
			blocks: [{ kind: "user", id: "u9", text: "recomeçando" }],
			startOffset: 0,
			atStart: true,
		});
	});

	await waitFor(() => expect(readBlocks()).toBe("u9:-"));
	expect(probe().dataset.atStart).toBe("true");
});

test("pulling older history asks from the offset the snapshot started at", async () => {
	streamTransport.handle("conversation", "history", () => {
		streamTransport.push("conversation", "reset", {
			shellId: "s1",
			blocks: [{ kind: "user", id: "u0", text: "o começo" }, ...BACKFILL.blocks],
			startOffset: 1024,
			atStart: false,
		});
	});
	render(<Probe shellId="s1" />);
	await waitFor(() => expect(probe().dataset.loading).toBe("false"));

	pullOlder();

	await waitFor(() => expect(readBlocks()).toBe("u0:- u1:- t1:running"));
	expect(streamTransport.payloads("conversation", "history")).toEqual([{ shellId: "s1", before: 2048 }]);

	pullOlder();

	await waitFor(() =>
		expect(streamTransport.payloads("conversation", "history")).toEqual([
			{ shellId: "s1", before: 2048 },
			{ shellId: "s1", before: 1024 },
		])
	);
});

test("a second pull while one step is in flight is not sent", async () => {
	let release = () => {};
	streamTransport.handle("conversation", "history", async () => {
		await new Promise<void>((resolve) => {
			release = resolve;
		});
	});
	render(<Probe shellId="s1" />);
	await waitFor(() => expect(probe().dataset.loading).toBe("false"));

	pullOlder();

	await waitFor(() => expect(probe().dataset.loadingOlder).toBe("true"));

	pullOlder();

	expect(streamTransport.payloads("conversation", "history")).toEqual([{ shellId: "s1", before: 2048 }]);

	await act(async () => release());
	await waitFor(() => expect(probe().dataset.loadingOlder).toBe("false"));
});

test("there is nothing older to ask for once the conversation starts at the file's first byte", async () => {
	streamTransport.handle("conversation", "subscribe", () => ({ ...BACKFILL, startOffset: 0, atStart: true }));
	render(<Probe shellId="s1" />);
	await waitFor(() => expect(probe().dataset.loading).toBe("false"));

	pullOlder();

	expect(streamTransport.payloads("conversation", "history")).toEqual([]);
});

test("leaving the conversation lets the main process stop tailing the file", async () => {
	const view = render(<Probe shellId="s1" />);
	await waitFor(() => expect(probe().dataset.loading).toBe("false"));

	act(() => view.unmount());

	expect(streamTransport.payloads("conversation", "unsubscribe")).toEqual([{ shellId: "s1" }]);
});
