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
		{ kind: "tool", id: "t1", label: "Editing files", state: "running" },
	],
	title: "Retry no upload",
	truncated: true,
};

function Probe({ shellId }: { shellId: string }) {
	const conversation = useConversation(shellId);

	return (
		<div
			data-testid="probe"
			data-title={conversation.title}
			data-truncated={String(conversation.truncated)}
			data-loading={String(conversation.loading)}
		>
			{conversation.blocks.map((block) => `${block.id}:${block.kind === "tool" ? block.state : "-"}`).join(" ")}
		</div>
	);
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
	expect(probe().textContent).toBe("u1:- t1:running");
	expect(probe().dataset.title).toBe("Retry no upload");
	expect(probe().dataset.truncated).toBe("true");
});

test("a pushed block lands at the end and a settled tool changes in place", async () => {
	render(<Probe shellId="s1" />);
	await waitFor(() => expect(probe().dataset.loading).toBe("false"));

	act(() => {
		streamTransport.push("conversation", "appended", {
			shellId: "s1",
			blocks: [
				{ kind: "tool", id: "t1", label: "Editing files", state: "done" },
				{ kind: "agent", id: "m1", text: "Pronto." },
			],
			title: "Retry no upload de fotos",
		});
	});

	await waitFor(() => expect(probe().textContent).toBe("u1:- t1:done m1:-"));
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

	expect(probe().textContent).toBe("u1:- t1:running");
});

test("a reset replaces the conversation, which is how a new agent session arrives", async () => {
	render(<Probe shellId="s1" />);
	await waitFor(() => expect(probe().dataset.loading).toBe("false"));

	act(() => {
		streamTransport.push("conversation", "reset", {
			shellId: "s1",
			blocks: [{ kind: "user", id: "u9", text: "recomeçando" }],
			truncated: false,
		});
	});

	await waitFor(() => expect(probe().textContent).toBe("u9:-"));
	expect(probe().dataset.truncated).toBe("false");
});

test("leaving the conversation lets the main process stop tailing the file", async () => {
	const view = render(<Probe shellId="s1" />);
	await waitFor(() => expect(probe().dataset.loading).toBe("false"));

	act(() => view.unmount());

	expect(streamTransport.payloads("conversation", "unsubscribe")).toEqual([{ shellId: "s1" }]);
});
