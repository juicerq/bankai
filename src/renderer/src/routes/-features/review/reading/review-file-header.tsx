import { ChevronDownIcon, ChevronRightIcon, ViewfinderCircleIcon } from "@heroicons/react/24/outline";
import type { ReviewFileRow } from "@renderer/routes/-features/review/reading/review-rows";
import { STATUS_MARK } from "@renderer/routes/-features/review/tree/status-mark";

export function ReviewFileHeader({
	row,
	sticky = false,
	onToggleOpen,
	onFocusFile,
}: {
	row: ReviewFileRow;
	sticky?: boolean;
	onToggleOpen: (path: string) => void;
	onFocusFile: (path: string) => void;
}) {
	const ChevronIcon = row.open ? ChevronDownIcon : ChevronRightIcon;
	const fileNameStart = row.file.path.lastIndexOf("/") + 1;
	const directoryPath = row.file.path.slice(0, fileNameStart);
	const fileName = row.file.path.slice(fileNameStart);

	return (
		<header
			className={`flex h-8 w-full items-center justify-between gap-2 border-outline bg-surface-raised px-3 text-data ${
				row.first || sticky ? "" : "border-t"
			}`}
		>
			<span className="flex min-w-0 flex-1 items-center gap-2">
				<span className="shrink-0 text-secondary">{STATUS_MARK[row.file.status]}</span>
				<button
					type="button"
					className="group -m-1 flex min-w-0 flex-1 items-center gap-2 p-1 text-left text-body"
					aria-expanded={row.open}
					aria-label={`${row.open ? "Close" : "Open"} ${row.file.path}`}
					onClick={() => onToggleOpen(row.file.path)}
				>
					<ChevronIcon className="size-4 shrink-0 text-secondary group-hover:text-primary" />
					<span className="flex min-w-0 flex-1 group-hover:underline" title={row.file.path}>
						<span dir="rtl" className="truncate opacity-60">{`${directoryPath}\u200E`}</span>
						<span dir="rtl" className="max-w-full shrink-0 truncate text-primary">{`${fileName}\u200E`}</span>
					</span>
				</button>
			</span>
			<span className="flex shrink-0 items-center gap-2">
				{(row.file.additions > 0 || row.file.deletions > 0) && (
					<>
						<span className="text-added">+{row.file.additions}</span>
						<span className="text-removed">−{row.file.deletions}</span>
					</>
				)}
				<button
					type="button"
					className="-m-1 p-1 text-secondary hover:text-primary"
					aria-label={`Focus ${row.file.path}`}
					onClick={() => onFocusFile(row.file.path)}
				>
					<ViewfinderCircleIcon className="size-4" />
				</button>
			</span>
		</header>
	);
}
