import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { Todo } from "@shared/todos";
import { orpc } from "@renderer/lib/api";

export function useTodos(projectId: string) {
	const queryClient = useQueryClient();
	const listOptions = orpc.todos.list.queryOptions({ input: { projectId } });
	const listed = useQuery(listOptions);
	const { mutate: add, error: addError } = useMutation(orpc.todos.add.mutationOptions({
		onSuccess: (todo) => {
			queryClient.setQueryData<Todo[]>(listOptions.queryKey, (current) => [...(current ?? []), todo]);
		},
	}));
	const { mutate: setDone, error: doneError } = useMutation(orpc.todos.setDone.mutationOptions({
		onSuccess: (todo) => {
			queryClient.setQueryData<Todo[]>(
				listOptions.queryKey,
				(current) => current?.map((entry) => entry.id === todo.id ? todo : entry),
			);
		},
	}));
	const { mutate: remove, error: removeError } = useMutation(orpc.todos.remove.mutationOptions({
		onSuccess: (_, input) => {
			queryClient.setQueryData<Todo[]>(
				listOptions.queryKey,
				(current) => current?.filter((todo) => todo.id !== input.id),
			);
		},
	}));
	const todos = listed.data ?? [];
	const saveFailure = [
		{ error: addError, message: "Not saved — your text is still in the line above. Try again." },
		{ error: doneError, message: "Not marked — the todo did not change. Try again." },
		{ error: removeError, message: "Not removed — the todo is still here. Try again." },
	].find((entry) => entry.error);

	return {
		open: todos.filter((todo) => todo.doneAt === undefined),
		done: todos.filter((todo) => todo.doneAt !== undefined),
		listError: listed.isError ? String(listed.error) : undefined,
		saveFailure,
		retry: useCallback(() => listed.refetch(), [listed.refetch]),
		add: useCallback(
			(text: string, onCaptured: () => void) => add({ projectId, text }, { onSuccess: onCaptured }),
			[add, projectId],
		),
		setDone: useCallback((id: string, done: boolean) => setDone({ id, done }), [setDone]),
		remove: useCallback((id: string) => remove({ id }), [remove]),
	};
}
