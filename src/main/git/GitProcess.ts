import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import type * as ElectronModule from "electron";
import {
	reviewContentSchema,
	reviewFilesSchema,
	reviewSnapshotSchema,
	worktreesSchema,
	type FullFile,
	type ReviewContent,
	type ReviewFiles,
	type ReviewMode,
	type ReviewSnapshot,
	type Worktree,
} from "@main/git/contracts";
import { gitResponseSchema, type GitRequest } from "@main/git/protocol";
import { Logger } from "@main/logger";

const require = createRequire(import.meta.url);

interface ReviewScope {
	path: string;
	mode: ReviewMode;
	shellId?: string;
}

type GitRequestInput =
	| ({ operation: "snapshot" } & ReviewScope)
	| ({ operation: "files"; files: string[] } & ReviewScope)
	| ({ operation: "file"; file: string } & ReviewScope)
	| ({ operation: "fullFile"; file: string } & ReviewScope)
	| { operation: "worktrees"; path: string }
	| { operation: "startTurn"; path: string; shellId: string }
	| { operation: "forgetTurn"; shellId: string };

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (reason: Error) => void;
}

interface ChildState {
	process: ElectronModule.UtilityProcess;
	ready: Promise<void>;
	rejectReady: (err: Error) => void;
}

class GitUtilityProcess {
	private child?: ChildState;
	private readonly pending = new Map<string, PendingRequest>();
	private closed = false;

	async startTurn(input: { path: string; shellId: string }): Promise<void> {
		await this.request({ operation: "startTurn", ...input });
	}

	async forgetTurn(shellId: string): Promise<void> {
		await this.request({ operation: "forgetTurn", shellId });
	}

	async worktrees(input: { path: string }): Promise<Worktree[]> {
		return worktreesSchema.assert(await this.request({ operation: "worktrees", ...input }));
	}

	async snapshot(scope: ReviewScope): Promise<ReviewSnapshot> {
		return reviewSnapshotSchema.assert(await this.request({ operation: "snapshot", ...scope }));
	}

	async files(input: ReviewScope & { files: string[] }): Promise<ReviewFiles> {
		return reviewFilesSchema.assert(await this.request({ operation: "files", ...input }));
	}

	async file(input: ReviewScope & { file: string }): Promise<ReviewContent> {
		return reviewContentSchema.assert(await this.request({ operation: "file", ...input }));
	}

	async fullFile(input: ReviewScope & { file: string }): Promise<FullFile> {
		return reviewContentSchema.assert(await this.request({ operation: "fullFile", ...input }));
	}

	close(): void {
		this.closed = true;
		const err = new Error("Git utility process stopped");
		this.rejectPending(err);
		this.child?.rejectReady(err);
		this.child?.process.kill();
		this.child = undefined;
	}

	private request(input: GitRequestInput): Promise<unknown> {
		if (this.closed) {
			return Promise.reject(new Error("Git utility process stopped"));
		}

		return this.send(input);
	}

	private async send(input: GitRequestInput): Promise<unknown> {
		const child = this.child ?? this.spawn();
		await child.ready;
		if (this.child !== child || !child.process.pid) {
			throw new Error("Git utility process exited before handling the request");
		}

		const id = randomUUID();
		const request = { id, ...input } satisfies GitRequest;
		return await new Promise<unknown>((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			try {
				// Electron UtilityProcess has no target-origin parameter.
				// eslint-disable-next-line unicorn/require-post-message-target-origin
				child.process.postMessage(request);
			} catch (err) {
				this.pending.delete(id);
				const message = err instanceof Error ? err.message : String(err);
				reject(new Error(message, { cause: err }));
			}
		});
	}

	private spawn(): ChildState {
		const { utilityProcess }: typeof ElectronModule = require("electron");
		const child = utilityProcess.fork(join(import.meta.dirname, "git-worker.js"), [], {
			serviceName: "Bankai Git",
			stdio: ["ignore", "ignore", "pipe"],
		});
		const { promise: ready, resolve: markReady, reject: failReady } = Promise.withResolvers<void>();
		const state: ChildState = {
			process: child,
			ready,
			rejectReady: failReady,
		};
		this.child = state;

		child.once("spawn", () => markReady());
		child.stderr?.setEncoding("utf8");
		child.stderr?.on("data", (data: string) => {
			Logger.error("git-process:stderr", { data: data.trim() });
		});
		child.on("message", (raw) => this.handleMessage(raw));
		child.on("error", (type, location) => {
			Logger.error("git-process:error", { type, location });
		});
		child.once("exit", (code) => {
			if (this.child !== state) {
				return;
			}
			const err = new Error(`Git utility process exited with code ${code}`);
			this.child = undefined;
			failReady(err);
			this.rejectPending(err);
		});

		return state;
	}

	private handleMessage(raw: unknown): void {
		let response: typeof gitResponseSchema.infer;
		try {
			response = gitResponseSchema.assert(raw);
		} catch (err) {
			const protocolError = new Error(`Invalid Git utility response: ${String(err)}`);
			this.rejectPending(protocolError);
			this.child?.process.kill();
			return;
		}

		const request = this.pending.get(response.id);
		if (!request) {
			return;
		}
		this.pending.delete(response.id);
		if (response.ok) {
			request.resolve(response.result);
		} else {
			request.reject(new Error(response.error));
		}
	}

	private rejectPending(err: Error): void {
		for (const request of this.pending.values()) {
			request.reject(err);
		}
		this.pending.clear();
	}
}

export const GitProcess = new GitUtilityProcess();
