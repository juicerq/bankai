import type { DiffMode } from "../-utils/accumulate";
import { useReview } from "../-utils/review-context";

const OPTIONS: { value: DiffMode; label: string }[] = [
	{ value: "turn", label: "por turno" },
	{ value: "accumulated", label: "acumulado" },
];

export function ReviewModeToggle() {
	const { mode, setMode } = useReview();

	return (
		<div className="flex items-center gap-0.5 rounded-lg border border-ink/10 bg-paper/60 p-0.5">
			{OPTIONS.map((option) => {
				const active = option.value === mode;

				return (
					<button
						key={option.value}
						type="button"
						onClick={() => setMode(option.value)}
						className={`rounded-md px-2.5 py-1 font-mono text-[11px] transition-colors focus-visible:ring-2 focus-visible:ring-olive focus-visible:outline-none ${
							active
								? "bg-olive/15 text-olive"
								: "text-ink-muted hover:text-ink"
						}`}
					>
						{option.label}
					</button>
				);
			})}
		</div>
	);
}
