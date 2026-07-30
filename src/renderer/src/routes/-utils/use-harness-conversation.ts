import { orpc } from "@renderer/lib/api";
import { useQuery } from "@tanstack/react-query";

export interface DesktopOnlyHarness {
	label: string;
}

export function useDesktopOnlyHarness(harness: string | undefined): DesktopOnlyHarness | undefined {
	const { data } = useQuery(orpc.settings.listHarnesses.queryOptions());
	const entry = harness ? data?.find((candidate) => candidate.id === harness) : undefined;
	if (!entry || entry.conversation) {
		return undefined;
	}

	return { label: entry.label };
}
