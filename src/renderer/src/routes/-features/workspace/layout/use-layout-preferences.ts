import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { LayoutSettings } from "@shared/settings";
import { orpc } from "@renderer/lib/api";
import { DEFAULT_RAIL_WIDTH, MAX_RAIL_WIDTH, MIN_RAIL_WIDTH } from "@renderer/routes/-features/workspace/layout/rail-layout";
import {
	DEFAULT_DIFF_WIDTH,
	DEFAULT_TREE_WIDTH,
	MIN_DIFF_WIDTH,
	MIN_TREE_WIDTH,
} from "@renderer/routes/-features/review/panel/review-layout";

export interface LayoutPreferences {
	railWidth: number;
	diffWidth: number;
	treeWidth: number;
	fullscreen: boolean;
	reviewOpen: boolean;
	reviewExpanded: boolean;
	treeOpen: boolean;
}

export function clampLayout(stored: LayoutSettings | null): LayoutPreferences {
	return {
		railWidth: Math.min(Math.max(stored?.railWidth ?? DEFAULT_RAIL_WIDTH, MIN_RAIL_WIDTH), MAX_RAIL_WIDTH),
		diffWidth: Math.max(MIN_DIFF_WIDTH, stored?.diffWidth ?? DEFAULT_DIFF_WIDTH),
		treeWidth: Math.max(MIN_TREE_WIDTH, stored?.treeWidth ?? DEFAULT_TREE_WIDTH),
		fullscreen: stored?.fullscreen ?? false,
		reviewOpen: stored?.reviewOpen ?? true,
		reviewExpanded: stored?.reviewExpanded ?? false,
		treeOpen: stored?.treeOpen ?? true,
	};
}

export function useLayoutPreferences() {
	const queryClient = useQueryClient();
	const stored = useQuery(orpc.settings.getLayout.queryOptions());
	const mutation = useMutation(
		orpc.settings.updateLayout.mutationOptions({
			onSuccess: (layout) => queryClient.setQueryData(orpc.settings.getLayout.key({ type: "query" }), layout),
		}),
	);
	const persist = useCallback((patch: LayoutSettings) => mutation.mutate(patch), [mutation.mutate]);

	return {
		initial: clampLayout(stored.data ?? null),
		persist,
	};
}
