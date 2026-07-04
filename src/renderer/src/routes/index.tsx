import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { orpc } from "@renderer/lib/api";
import { useTheme } from "@renderer/lib/theme";

export const Route = createFileRoute("/")({
	component: TodosPage,
});

const THEME_CYCLE = ["light", "dark", "system"] as const;

function TodosPage() {
	const queryClient = useQueryClient();
	const [title, setTitle] = useState("");
	const { theme, setTheme } = useTheme();

	const list = useQuery(orpc.todos.list.queryOptions());

	const create = useMutation(
		orpc.todos.create.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.todos.list.key() });
				setTitle("");
			},
		}),
	);

	return (
		<main className="mx-auto max-w-xl p-6">
			<header className="mb-4 flex items-center justify-between">
				<h1 className="text-2xl font-semibold">Todos</h1>
				<button
					type="button"
					onClick={() => {
						const next =
							THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length];

						if (next) {
							setTheme(next);
						}
					}}
					className="rounded border border-neutral-300 px-3 py-1 text-sm dark:border-neutral-700"
				>
					Tema: {theme}
				</button>
			</header>

			<form
				className="mb-6 flex gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					create.mutate({ title: title.trim() });
				}}
			>
				<input
					className="flex-1 rounded border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					placeholder="O que precisa ser feito?"
				/>
				<button
					type="submit"
					disabled={!title.trim() || create.isPending}
					className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
				>
					Adicionar
				</button>
			</form>

			<ul className="flex flex-col gap-2">
				{list.data?.map((todo) => (
					<li
						key={todo.id}
						className="rounded border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900"
					>
						{todo.title}
					</li>
				))}
			</ul>
		</main>
	);
}
