import { XMarkIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import type { Favorite } from "@shared/favorites";
import { SessionPageAddressText } from "@renderer/routes/-features/session-page/session-page-address-text";
import type { useFavorites } from "@renderer/routes/-features/session-page/use-favorites";

const SHORTCUT_LIMIT = 9;
const HINT = "Type an address above to open a page here";

function dragOrder(favorites: Favorite[], order: string[]) {
	const byId = new Map(favorites.map((favorite) => [favorite.id, favorite]));

	return [
		...order.flatMap((id) => byId.get(id) ?? []),
		...favorites.filter((favorite) => !order.includes(favorite.id)),
	];
}

export function SessionPageFavorites({
	store,
	onOpen,
}: {
	store: ReturnType<typeof useFavorites>;
	onOpen: (url: string) => void;
}) {
	const [order, setOrder] = useState<string[] | null>(null);
	const [dragged, setDragged] = useState<string | null>(null);
	const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
	const favorites = store.favorites;
	const listed = order ? dragOrder(favorites, order) : favorites;
	const failure = store.listError ?? store.saveError?.message;
	const dragTo = (id: string, target: number) => {
		if (listed[target]?.id === id) {
			return;
		}

		const rest = listed.map((favorite) => favorite.id).filter((other) => other !== id);
		setOrder([...rest.slice(0, target), id, ...rest.slice(target)]);
	};
	const rename = (id: string, title: string) => {
		const named = title.trim();
		setEditing(null);

		if (named) {
			store.update(id, named);
		}
	};

	if (listed.length === 0 && !failure) {
		return (
			<p data-component="session-page-favorites" data-empty className="w-full max-w-md text-center text-support text-secondary">
				{HINT}
			</p>
		);
	}

	return (
		<div data-component="session-page-favorites" className="flex w-full max-w-md flex-col">
			<span className="px-1 pb-1 text-label text-secondary">FAVORITES</span>
			{listed.map((favorite, index) => (
				<div
					key={favorite.id}
					data-component="session-page-favorite"
					data-favorite={favorite.id}
					draggable={editing?.id !== favorite.id}
					className={`group relative flex h-7 items-center gap-2 px-1 hover:bg-surface-hover ${
						dragged === favorite.id ? "opacity-50" : ""
					}`}
					onDragStart={(event) => {
						event.dataTransfer.effectAllowed = "move";
						event.dataTransfer.setData("text/plain", favorite.id);
						setDragged(favorite.id);
					}}
					onDragOver={(event) => {
						if (!dragged) {
							return;
						}

						event.preventDefault();
						event.dataTransfer.dropEffect = "move";
						dragTo(dragged, index);
					}}
					onDrop={(event) => {
						event.preventDefault();
						store.reorder(listed.map((entry) => entry.id));
					}}
					onDragEnd={() => {
						setDragged(null);
						setOrder(null);
					}}
					onDoubleClick={() => setEditing({ id: favorite.id, title: favorite.title })}
				>
					{editing?.id !== favorite.id && (
						<button
							type="button"
							data-slot="open"
							aria-label={`Open ${favorite.title}`}
							className="absolute inset-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
							onClick={() => onOpen(favorite.url)}
						/>
					)}
					<span
						data-slot="shortcut"
						className={`flex size-5 shrink-0 items-center justify-center text-data text-tertiary ${
							index < SHORTCUT_LIMIT ? "border border-outline" : ""
						}`}
					>
						{index < SHORTCUT_LIMIT ? `⌃${index + 1}` : ""}
					</span>
					{editing?.id === favorite.id
						? (
							<input
								data-slot="rename"
								autoFocus
								value={editing.title}
								spellCheck={false}
								autoComplete="off"
								aria-label={`Rename ${favorite.title}`}
								className="relative z-10 min-w-0 flex-1 border-0 bg-transparent text-body text-primary outline-none selection:bg-surface-active"
								onFocus={(event) => event.currentTarget.select()}
								onInput={(event) => setEditing({ id: favorite.id, title: event.currentTarget.value })}
								onBlur={() => setEditing(null)}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										rename(favorite.id, editing.title);
										return;
									}

									if (event.key === "Escape") {
										event.preventDefault();
										setEditing(null);
									}
								}}
							/>
						)
						: <span data-slot="title" className="min-w-0 flex-1 truncate text-body text-primary">{favorite.title}</span>}
					<span data-slot="host" className="shrink-0 truncate text-support text-secondary group-hover:hidden">
						{SessionPageAddressText.describe(favorite.url)?.host}
					</span>
					<button
						type="button"
						data-slot="remove"
						aria-label={`Remove ${favorite.title}`}
						className="relative z-10 hidden size-5 shrink-0 items-center justify-center text-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring group-hover:flex"
						onClick={() => store.remove(favorite.id)}
					>
						<XMarkIcon className="size-3.5" />
					</button>
				</div>
			))}
			{failure && (
				<div data-slot="failure" className="flex h-7 items-center gap-2 px-1">
					<span className="min-w-0 truncate text-support text-removed">{failure}</span>
					{store.listError && (
						<button
							type="button"
							data-slot="retry"
							className="shrink-0 text-label text-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
							onClick={() => store.retry()}
						>
							RETRY
						</button>
					)}
				</div>
			)}
			<p className="px-1 pt-3 text-support text-secondary">{HINT}</p>
		</div>
	);
}
