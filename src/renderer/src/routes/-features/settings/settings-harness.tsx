import { useState } from "react";
import { Setting } from "@renderer/routes/-features/settings/settings-controls";
import { useHarnessSettings } from "@renderer/routes/-features/settings/use-harness-settings";

interface LaunchableHarness {
	id: string;
	label: string;
	available: boolean;
}

export function HarnessSetting() {
	const { harness, profile, harnesses, save, saveProfile, saveError } = useHarnessSettings();

	if (!harness || !harnesses) {
		return <p className="px-3 py-6 text-data text-secondary">Reading settings…</p>;
	}

	return (
		<Setting
			title="Start a harness in every new shell"
			description="Quit it with Ctrl+C twice and the plain shell is right there. Alt+click New shell to skip it up front."
			slot="autostart"
			on={harness.autostart}
			onToggle={() => save({ autostart: !harness.autostart })}
		>
			<span className="block pb-1 text-label text-secondary">HARNESS</span>
			<div role="radiogroup" aria-label="Harness">
				{harnesses.map((entry) => (
					<HarnessRow
						key={entry.id}
						harness={entry}
						selected={entry.id === harness.id}
						disabled={!harness.autostart}
						onSelect={() => save({ id: entry.id })}
					/>
				))}
			</div>
			<ArgumentsField
				key={harness.id}
				args={profile.args ?? ""}
				disabled={!harness.autostart}
				onCommit={(args) => saveProfile({ args })}
			/>
			{saveError && (
				<span data-slot="save-error" className="mt-3 block text-data text-removed">
					Could not save — the change was not applied.
				</span>
			)}
		</Setting>
	);
}

function HarnessRow({
	harness,
	selected,
	disabled,
	onSelect,
}: {
	harness: LaunchableHarness;
	selected: boolean;
	disabled: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			role="radio"
			aria-checked={selected}
			disabled={disabled}
			data-component="settings-harness"
			data-id={harness.id}
			className={`flex w-full items-center gap-2.5 px-2 py-1.5 text-left disabled:opacity-40 ${
				selected ? "bg-surface-active" : "hover:bg-surface-hover"
			}`}
			onClick={onSelect}
		>
			<span className="min-w-0 flex-1 truncate text-body text-primary">{harness.label}</span>
			{!harness.available && (
				<span data-slot="missing" className="shrink-0 text-label text-removed">NOT ON PATH</span>
			)}
			{selected && harness.available && <span className="shrink-0 text-label text-tertiary">CURRENT</span>}
		</button>
	);
}

function ArgumentsField({
	args,
	disabled,
	onCommit,
}: {
	args: string;
	disabled: boolean;
	onCommit: (args: string) => void;
}) {
	const [draft, setDraft] = useState(args);
	const commit = () => {
		if (draft.trim() !== args) {
			onCommit(draft.trim());
		}
	};

	return (
		<div className={`mt-3 ${disabled ? "opacity-40" : ""}`}>
			<span className="block pb-1.5 text-label text-secondary">EXTRA ARGUMENTS</span>
			<input
				data-slot="harness-args"
				spellCheck={false}
				autoComplete="off"
				aria-label="Extra arguments"
				disabled={disabled}
				placeholder="--model opus"
				className="w-full border border-outline bg-surface px-2 py-1.5 text-data text-primary outline-none placeholder:text-secondary focus:border-tertiary"
				value={draft}
				onInput={(event) => setDraft(event.currentTarget.value)}
				onBlur={commit}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						commit();
					}
				}}
			/>
			<span className="mt-1.5 block text-data text-secondary">Appended to every launch and resume of this harness.</span>
		</div>
	);
}
