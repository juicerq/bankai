import { ChevronLeftIcon, ExclamationTriangleIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { PickerHint } from "@renderer/routes/-features/shared/pickers/picker-hint";
import type { QuickOpenMatch } from "@renderer/routes/-features/review/header/review-quick-open/model";
import { useReviewQuickOpen } from "@renderer/routes/-features/review/header/review-quick-open/review-quick-open-context";

export function ReviewQuickOpenContent() {
	const { query, status, groups, picker, onBack, onOpen } = useReviewQuickOpen().content;
	return (
		<>
			<div className="flex items-center border-outline border-b">
				<button
					type="button"
					className="flex h-header w-header shrink-0 items-center justify-center border-outline border-r text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
					aria-label="Back to files and folders"
					onClick={onBack}
				>
					<ChevronLeftIcon className="size-4" aria-hidden="true" />
				</button>
				<div className="min-w-0 flex-1 px-3 py-2">
					<div className="text-label text-secondary">SEARCH CONTENTS</div>
					<div className="truncate pt-0.5 text-body text-primary" title={query}>
						{query}
					</div>
				</div>
			</div>
			<div
				data-slot="content-results"
				tabIndex={-1}
				autoFocus
				className="h-72 overflow-y-auto outline-none"
				role="listbox"
				aria-label="Content matches"
				onKeyDown={picker.onKeyDown}
			>
				{status === "searching" && (
					<ReviewQuickOpenNotice icon={MagnifyingGlassIcon} title="Searching…">
						Large worktrees can take up to 30 seconds.
					</ReviewQuickOpenNotice>
				)}
				{status === "error" && (
					<ReviewQuickOpenNotice icon={ExclamationTriangleIcon} title="Search failed">
						Go back to adjust the term.
					</ReviewQuickOpenNotice>
				)}
				{status === "empty" && (
					<ReviewQuickOpenNotice icon={MagnifyingGlassIcon} title="No matches">
						Go back to change the term.
					</ReviewQuickOpenNotice>
				)}
				{status === "truncated" && (
					<div data-slot="truncated" className="border-outline border-b px-3 py-2 text-data text-secondary">
						Search stopped early. Refine the term to inspect more files.
					</div>
				)}
				{status === "truncated" && groups.length === 0 && (
					<ReviewQuickOpenNotice icon={MagnifyingGlassIcon} title="No matches before the limit">
						Go back and try a more specific term.
					</ReviewQuickOpenNotice>
				)}
				{(status === "results" || status === "truncated") && groups.length > 0 && (
					<div className="divide-y divide-outline">
						{groups.map((group) => (
							<section
								key={group.path}
								data-component="review-quick-open-file"
								data-path={group.path}
								data-matches={group.matches.length}
							>
								<header className="truncate bg-surface px-3 py-1.5 text-data text-secondary" title={group.path}>
									{group.path}
								</header>
								<div className="divide-y divide-outline/70">
									{group.matches.map((item) => (
										<ReviewQuickOpenMatchItem
											key={item.key}
											item={item}
											{...picker.itemProps(item)}
											onSelect={() => onOpen(item)}
										/>
									))}
								</div>
							</section>
						))}
					</div>
				)}
			</div>
			<div className="flex items-center gap-3 border-outline border-t px-3 py-2">
				{groups.length > 0 && <PickerHint keys={["↑", "↓"]} label="Navigate" />}
				{groups.length > 0 && <PickerHint keys={["Enter"]} label="Open" />}
				<PickerHint keys={["Esc"]} label="Back" />
			</div>
		</>
	);
}

function ReviewQuickOpenMatchItem({
	item,
	highlighted,
	ref,
	onMouseMove,
	onSelect,
}: {
	item: QuickOpenMatch;
	highlighted: boolean;
	ref?: (element: HTMLElement | null) => void;
	onMouseMove: () => void;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			role="option"
			aria-selected={highlighted}
			data-component="review-quick-open-match"
			data-path={item.match.file}
			data-line={item.match.line}
			ref={ref}
			className={`relative flex w-full gap-2 px-3 py-1.5 text-left ${
				highlighted ? "bg-surface-active" : "hover:bg-surface-hover"
			}`}
			onMouseMove={onMouseMove}
			onMouseDown={(event) => event.preventDefault()}
			onClick={onSelect}
		>
			{highlighted && <span className="absolute inset-y-0 left-0 w-0.5 bg-tertiary" aria-hidden="true" />}
			<span className="w-8 shrink-0 text-right text-data text-outline-strong tabular-nums">{item.match.line}</span>
			<span className="min-w-0 flex-1 truncate text-support text-primary" title={item.match.text}>
				{item.match.text}
			</span>
		</button>
	);
}

function ReviewQuickOpenNotice({
	icon: Icon,
	title,
	children,
}: {
	icon: typeof MagnifyingGlassIcon;
	title: string;
	children: string;
}) {
	return (
		<div className="flex min-h-56 flex-col items-center justify-center px-4 py-6 text-center">
			<Icon className="mb-2 size-5 text-secondary" aria-hidden="true" />
			<div className="text-body text-primary">{title}</div>
			<p className="pt-1 text-support text-secondary">{children}</p>
		</div>
	);
}
