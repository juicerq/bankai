import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicWrite } from "@main/store/atomic";
import { envelopeSchema } from "@main/store/envelope";
import { resolveDataDir } from "@main/store/paths";

type StoreOptions<T> = {
	name: string;
	version: number;
	contract: { assert: (raw: unknown) => T };
	migrators: Record<number, (raw: unknown) => unknown>;
	seed: () => T;
};

export class Store<T> {
	private queue: Promise<unknown> = Promise.resolve();

	constructor(private opts: StoreOptions<T>) {}

	private path(): string {
		return join(resolveDataDir(), `${this.opts.name}.json`);
	}

	read(): Promise<T> {
		return this.serial(() => this.readNow());
	}

	write(value: T): Promise<void> {
		return this.serial(() => this.writeNow(value));
	}

	mutate(fn: (current: T) => T | Promise<T>): Promise<T> {
		return this.serial(async () => {
			const current = await this.readNow();
			const next = await fn(current);
			await this.writeNow(next);
			return next;
		});
	}

	private serial<R>(op: () => Promise<R> | R): Promise<R> {
		const next = this.queue.then(op);
		this.queue = next.catch(noop);
		return next;
	}

	private async readNow(): Promise<T> {
		const raw = await readFile(this.path(), "utf8").catch((err) => {
			if (isNotFound(err)) {
				return null;
			}
			throw err;
		});

		if (raw === null) {
			return this.opts.seed();
		}

		const env = envelopeSchema.assert(JSON.parse(raw));

		if (env.version > this.opts.version) {
			throw new Error(
				`store '${this.opts.name}': file version ${env.version} is newer than code version ${this.opts.version}`,
			);
		}

		let migrated: unknown = env.data;
		for (let v = env.version; v < this.opts.version; v++) {
			const migrate = this.opts.migrators[v];
			if (!migrate) {
				throw new Error(
					`store '${this.opts.name}': missing migrator from v${v}`,
				);
			}
			migrated = migrate(migrated);
		}

		return this.opts.contract.assert(migrated);
	}

	private writeNow(value: T): Promise<void> {
		const envelope = { version: this.opts.version, data: value };
		return atomicWrite(this.path(), JSON.stringify(envelope, null, 2));
	}
}

function noop(): void {}

function isNotFound(err: unknown): boolean {
	if (typeof err !== "object" || err === null) {
		return false;
	}
	if (!("code" in err)) {
		return false;
	}
	return (err as { code: string }).code === "ENOENT";
}
