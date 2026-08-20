import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";

export function SessionSearchField({
	term,
	onSearch,
}: {
	term: string;
	onSearch: (term: string) => void;
}) {
	return (
		<div
			data-component="session-search"
			className="flex h-8 shrink-0 items-center border-b border-outline px-3"
		>
			<MagnifyingGlassIcon className="size-3.5 shrink-0 text-secondary" aria-hidden="true" />
			<input
				data-slot="session-search-input"
				value={term}
				placeholder="Search sessions"
				aria-label="Search sessions"
				spellCheck={false}
				autoComplete="off"
				className="h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-body text-primary outline-none placeholder:text-secondary"
				onInput={(event) => onSearch(event.currentTarget.value)}
				onKeyDown={(event) => {
					if (event.key === "Escape" && term) {
						event.stopPropagation();
						onSearch("");
					}
				}}
			/>
			{term && (
				<button
					type="button"
					data-slot="clear-session-search"
					className="flex size-3.5 shrink-0 items-center justify-center text-secondary hover:text-primary"
					aria-label="Clear the session search"
					title="Clear (Esc)"
					onClick={() => onSearch("")}
				>
					<XMarkIcon className="size-3.5" aria-hidden="true" />
				</button>
			)}
		</div>
	);
}
