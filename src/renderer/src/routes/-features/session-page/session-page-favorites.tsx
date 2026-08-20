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
		<div data-component="session-page-favorites" className="flex w-full max-w-3xl flex-col">
			<span className="px-1 pb-2 text-center text-label text-secondary">FAVORITES</span>
			<div className="flex flex-wrap justify-center gap-3">
				{listed.map((favorite, index) => {
					const host = SessionPageAddressText.describe(favorite.url)?.host;

					return (
						<div
							key={favorite.id}
							data-component="session-page-favorite"
							data-favorite={favorite.id}
							draggable={editing?.id !== favorite.id}
							className={`group relative flex w-56 max-w-full flex-col border border-outline bg-surface-raised hover:bg-surface-hover ${
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
							<div
								data-slot="preview"
								className="flex aspect-video items-center justify-center overflow-hidden border-outline border-b bg-surface-sunken"
							>
								{favorite.preview
									? (
										<img
											src={favorite.preview}
											alt=""
											draggable={false}
											className="size-full object-cover object-top opacity-90 group-hover:opacity-100"
										/>
									)
									: <span data-slot="fallback" className="px-2 text-center text-label text-secondary">{host}</span>}
								<span
									data-slot="shortcut"
									className={`absolute top-1 right-1 flex h-5 items-center justify-center text-data text-tertiary ${
										index < SHORTCUT_LIMIT ? "border border-outline bg-surface-active px-1" : ""
									}`}
								>
									{index < SHORTCUT_LIMIT ? `Ctrl+${index + 1}` : ""}
								</span>
							</div>
							<div className="flex items-center gap-2 p-2">
								<div className="flex min-w-0 flex-1 flex-col">
									{editing?.id === favorite.id
										? (
											<input
												data-slot="rename"
												autoFocus
												value={editing.title}
												spellCheck={false}
												autoComplete="off"
												aria-label={`Rename ${favorite.title}`}
												className="relative z-10 min-w-0 border-0 bg-transparent text-body text-primary outline-none selection:bg-surface-active"
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
										: <span data-slot="title" className="truncate text-body text-primary">{favorite.title}</span>}
									<span data-slot="host" className="truncate text-data text-secondary">{host}</span>
								</div>
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
						</div>
					);
				})}
			</div>
			{failure && (
				<div data-slot="failure" className="flex h-7 items-center gap-2 px-1 pt-2">
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
			<p className="px-1 pt-3 text-center text-support text-secondary">{HINT}</p>
		</div>
	);
}
