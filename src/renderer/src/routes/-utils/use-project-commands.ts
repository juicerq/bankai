import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { ProjectCommand, ProjectCommandDraft } from "@main/store/project-commands";
import type { Project } from "@main/store/projects";
import { orpc } from "@renderer/lib/api";

export function useProjectCommands(projects: readonly Project[]) {
	const queryClient = useQueryClient();
	const listed = useQueries({
		queries: projects.map((project) => orpc.commands.list.queryOptions({ input: { projectId: project.id } })),
	});
	const { mutate: add, error: addError } = useMutation(orpc.commands.add.mutationOptions({
		onSuccess: (command) => {
			queryClient.setQueryData<ProjectCommand[]>(
				orpc.commands.list.queryOptions({ input: { projectId: command.projectId } }).queryKey,
				(current) => [...(current ?? []), command],
			);
		},
	}));
	const { mutate: update, error: updateError } = useMutation(orpc.commands.update.mutationOptions({
		onSuccess: (command) => {
			queryClient.setQueriesData<ProjectCommand[]>(
				{ queryKey: orpc.commands.list.key() },
				(current) => current?.map((entry) => entry.id === command.id ? command : entry),
			);
		},
	}));
	const { mutate: remove, error: removeError } = useMutation(orpc.commands.remove.mutationOptions({
		onSuccess: (_, input) => {
			queryClient.setQueriesData<ProjectCommand[]>(
				{ queryKey: orpc.commands.list.key() },
				(current) => current?.filter((command) => command.id !== input.id),
			);
		},
	}));

	return {
		commands: listed.flatMap((query) => query.data ?? []),
		pendingProjectIds: projects.filter((_, index) => listed[index]?.isPending).map((project) => project.id),
		failedProjectIds: projects.filter((_, index) => listed[index]?.isError).map((project) => project.id),
		saveError: addError ?? updateError ?? removeError,
		add: useCallback(
			(projectId: string, draft: ProjectCommandDraft) => add({ ...draft, projectId }),
			[add],
		),
		update: useCallback((id: string, draft: ProjectCommandDraft) => update({ ...draft, id }), [update]),
		remove: useCallback((id: string) => remove({ id }), [remove]),
	};
}
