import { useState } from "react";
import { SessionPageUrl } from "@shared/session-page";

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function resolve(draft: string) {
	const typed = draft.trim();

	if (SCHEME.test(typed)) {
		return SessionPageUrl.parse(typed);
	}

	return SessionPageUrl.parse(`https://${typed}`);
}

export function SessionPageAddress({ url, onNavigate }: { url: string; onNavigate: (url: string) => void }) {
	const [draft, setDraft] = useState<string | null>(null);
	const [invalid, setInvalid] = useState(false);
	const discard = () => {
		setDraft(null);
		setInvalid(false);
	};
	const submit = () => {
		if (draft === null) {
			return;
		}

		const resolved = resolve(draft);

		if (!resolved) {
			setInvalid(true);
			return;
		}

		discard();
		onNavigate(resolved);
	};

	return (
		<input
			data-component="session-page-address"
			data-invalid={invalid}
			value={draft ?? url}
			spellCheck={false}
			autoComplete="off"
			aria-label="Page address"
			aria-invalid={invalid}
			className={`h-full min-w-0 flex-1 border-0 bg-transparent pr-3 text-data outline-none selection:bg-surface-active ${
				invalid
					? "text-removed ring-1 ring-removed ring-inset"
					: "text-secondary focus:bg-surface-hover focus:text-primary"
			}`}
			onFocus={(event) => event.currentTarget.select()}
			onInput={(event) => {
				setDraft(event.currentTarget.value);
				setInvalid(false);
			}}
			onBlur={discard}
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
	);
}
