import { useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { orpc } from "@renderer/lib/api";
import type { ContinuityValue } from "@shared/continuity";

const EMPTY_CONTINUITY: ContinuityValue = { workspaces: [] };
const CONTINUITY_KEY = orpc.continuity.get.queryOptions().queryKey;

interface ContinuityCache {
	value: ContinuityValue;
	failed: boolean;
}

interface Commit {
	reduce: (value: ContinuityValue) => ContinuityValue;
	write: () => Promise<unknown>;
	onSettled?: () => void;
	onSuccess?: () => void;
}

class ContinuityProjection {
	private readonly pending = new Set<symbol>();
	private latest: symbol | undefined;
	private reconcile = false;

	constructor(private readonly queryClient: ReturnType<typeof useQueryClient>) {}

	private project(reduce: Commit["reduce"]) {
		const token = Symbol();
		const previous = this.queryClient.getQueryData<ContinuityCache>(CONTINUITY_KEY);
		const projected = this.queryClient.setQueryData<ContinuityCache>(CONTINUITY_KEY, {
			value: reduce(previous?.value ?? EMPTY_CONTINUITY),
			failed: previous?.failed ?? false,
		});
		this.pending.add(token);
		this.latest = token;

		return {
			rollback: () => {
				if (this.latest !== token || this.queryClient.getQueryData(CONTINUITY_KEY) !== projected) {
					this.reconcile = true;
					return;
				}

				if (previous) {
					this.queryClient.setQueryData(CONTINUITY_KEY, previous);
					return;
				}

				this.queryClient.removeQueries({ queryKey: CONTINUITY_KEY, exact: true });
			},
			settle: () => {
				this.pending.delete(token);
				if (this.pending.size || !this.reconcile) {
					return;
				}

				this.reconcile = false;
				void this.queryClient.invalidateQueries({ queryKey: CONTINUITY_KEY, exact: true });
			},
		};
	}

	commit = (options: Commit) => {
		const projection = this.project(options.reduce);
		void options.write()
			.then(options.onSuccess, projection.rollback)
			.finally(() => {
				projection.settle();
				options.onSettled?.();
			});
	};

	commitAsync = async (options: Omit<Commit, "onSettled" | "onSuccess">) => {
		const projection = this.project(options.reduce);
		await options.write().catch((error) => {
			projection.rollback();
			throw error;
		}).finally(projection.settle);
	};

	applyConfirmed = (reduce: Commit["reduce"]) => {
		this.project(reduce).settle();
	};
}

export function useContinuityProjection() {
	const queryClient = useQueryClient();
	const projection = useRef<ContinuityProjection | null>(null);
	projection.current ??= new ContinuityProjection(queryClient);

	return projection.current;
}
