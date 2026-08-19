import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { Favorite, FavoriteDraft } from "@shared/favorites";
import { orpc } from "@renderer/lib/api";

export function useFavorites() {
	const queryClient = useQueryClient();
	const listOptions = orpc.favorites.list.queryOptions();
	const listed = useQuery(listOptions);
	const { mutate: add, error: addError } = useMutation(orpc.favorites.add.mutationOptions({
		onSuccess: (favorite) => {
			queryClient.setQueryData<Favorite[]>(listOptions.queryKey, (current) => [...(current ?? []), favorite]);
		},
	}));
	const { mutate: update, error: updateError } = useMutation(orpc.favorites.update.mutationOptions({
		onSuccess: (favorite) => {
			queryClient.setQueryData<Favorite[]>(
				listOptions.queryKey,
				(current) => current?.map((entry) => entry.id === favorite.id ? favorite : entry),
			);
		},
	}));
	const { mutate: remove, error: removeError } = useMutation(orpc.favorites.remove.mutationOptions({
		onSuccess: (_, input) => {
			queryClient.setQueryData<Favorite[]>(
				listOptions.queryKey,
				(current) => current?.filter((favorite) => favorite.id !== input.id),
			);
		},
	}));
	const { mutate: reorder, error: reorderError } = useMutation(orpc.favorites.reorder.mutationOptions({
		onMutate: ({ ids }) => {
			const previous = queryClient.getQueryData<Favorite[]>(listOptions.queryKey) ?? [];
			const byId = new Map(previous.map((favorite) => [favorite.id, favorite]));
			queryClient.setQueryData<Favorite[]>(listOptions.queryKey, [
				...ids.flatMap((id) => byId.get(id) ?? []),
				...previous.filter((favorite) => !ids.includes(favorite.id)),
			]);

			return { previous };
		},
		onError: (_err, _input, context) => {
			queryClient.setQueryData<Favorite[]>(listOptions.queryKey, context?.previous);
		},
		onSuccess: (favorites) => {
			queryClient.setQueryData<Favorite[]>(listOptions.queryKey, favorites);
		},
	}));

	return {
		favorites: listed.data ?? [],
		isPending: listed.isPending,
		listError: listed.isError ? String(listed.error) : undefined,
		saveError: addError ?? updateError ?? removeError ?? reorderError,
		retry: useCallback(() => listed.refetch(), [listed.refetch]),
		add: useCallback((draft: FavoriteDraft) => add(draft), [add]),
		update: useCallback((id: string, title: string) => update({ id, title }), [update]),
		remove: useCallback((id: string) => remove({ id }), [remove]),
		reorder: useCallback((ids: string[]) => reorder({ ids }), [reorder]),
	};
}
