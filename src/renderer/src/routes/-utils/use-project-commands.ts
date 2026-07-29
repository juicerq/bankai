import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { ProjectCommandDraft } from "@main/store/commands";
import { orpc } from "@renderer/lib/api";

export function useProjectCommands(projectId: string) {
	const queryClient = useQueryClient();
	const listed = useQuery(orpc.commands.list.queryOptions({ input: { projectId } }));
	const refresh = useCallback(
		() => queryClient.invalidateQueries({ queryKey: orpc.commands.list.key() }),
		[queryClient],
	);
	const add = useMutation(orpc.commands.add.mutationOptions({ onSuccess: refresh }));
	const update = useMutation(orpc.commands.update.mutationOptions({ onSuccess: refresh }));
	const remove = useMutation(orpc.commands.remove.mutationOptions({ onSuccess: refresh }));

	return {
		commands: listed.data,
		loading: listed.isPending,
		saveError: add.error ?? update.error ?? remove.error,
		add: useCallback((draft: ProjectCommandDraft) => add.mutate({ ...draft, projectId }), [add.mutate, projectId]),
		update: useCallback((id: string, draft: ProjectCommandDraft) => update.mutate({ ...draft, id }), [update.mutate]),
		remove: useCallback((id: string) => remove.mutate({ id }), [remove.mutate]),
	};
}
