import { useState } from "react";
import { SessionPageAddressText } from "@renderer/routes/-features/session-page/session-page-address-text";

function tone(invalid: boolean, masked: boolean) {
	if (invalid) {
		return "text-removed ring-1 ring-removed ring-inset";
	}

	if (masked) {
		return "text-transparent";
	}

	return "text-secondary focus:bg-surface-hover focus:text-primary";
}

export function SessionPageAddress({
	url,
	autoFocus,
	onNavigate,
}: {
	url: string;
	autoFocus?: boolean;
	onNavigate: (url: string) => void;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	const [focused, setFocused] = useState(false);
	const [invalid, setInvalid] = useState(false);
	const discard = () => {
		setDraft(null);
		setInvalid(false);
	};
	const submit = () => {
		if (draft === null) {
			return;
		}

		const resolved = SessionPageAddressText.resolve(draft);

		if (!resolved) {
			setInvalid(true);
			return;
		}

		discard();
		onNavigate(resolved);
	};
	const parts = focused ? undefined : SessionPageAddressText.describe(url);

	return (
		<div className="relative flex h-full min-w-0 flex-1 items-center">
			<input
				data-component="session-page-address"
				data-invalid={invalid}
				value={draft ?? url}
				autoFocus={autoFocus}
				placeholder="Type an address"
				spellCheck={false}
				autoComplete="off"
				aria-label="Page address"
				aria-invalid={invalid}
				title={invalid ? "This address cannot be opened here" : undefined}
				className={`h-full min-w-0 flex-1 border-0 bg-transparent pr-3 text-data outline-none selection:bg-surface-active placeholder:text-tertiary ${tone(invalid, !!parts)}`}
				onFocus={(event) => {
					setFocused(true);
					event.currentTarget.select();
				}}
				onInput={(event) => {
					setDraft(event.currentTarget.value);
					setInvalid(false);
				}}
				onBlur={() => {
					setFocused(false);
					discard();
				}}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						event.stopPropagation();
						submit();
						return;
					}

					if (event.key === "Escape") {
						event.preventDefault();
						event.stopPropagation();
						discard();
					}
				}}
			/>
			{parts && (
				<span
					data-slot="display"
					aria-hidden="true"
					className="pointer-events-none absolute inset-y-0 right-3 left-0 flex items-center overflow-hidden whitespace-nowrap text-data"
				>
					<span className="shrink-0 text-secondary">{parts.host}</span>
					<span className="truncate text-tertiary">{parts.path}</span>
				</span>
			)}
		</div>
	);
}
