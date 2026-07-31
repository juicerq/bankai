import { Cog6ToothIcon } from "@heroicons/react/24/outline";
import { useCallback, useState } from "react";
import type { HarnessProfile, HarnessSettings } from "@main/store/settings";
import { PickerHint } from "@renderer/routes/-components/picker-hint";
import { Setting } from "@renderer/routes/-components/settings-controls";
import { MobileAccessSetting } from "@renderer/routes/-components/settings-mobile-access";
import { useHarnessSettings } from "@renderer/routes/-utils/use-harness-settings";
import { DEFAULT_HARNESS_HOOKS, DEFAULT_SESSION_NAMING } from "@shared/activity";

interface LaunchableHarness {
	id: string;
	label: string;
	hooks: boolean;
	available: boolean;
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
	const { harness, profile, harnesses, save, saveProfile, saveError } = useHarnessSettings();
	const takeFocus = useCallback((element: HTMLDivElement | null) => element?.focus(), []);

	return (
		<div
			className="picker-backdrop fixed inset-0 z-50 flex justify-center bg-surface-sunken/70 pt-[14vh]"
			onPointerDown={onClose}
		>
			<div
				data-component="settings-modal"
				role="dialog"
				aria-modal="true"
				aria-label="Settings"
				tabIndex={-1}
				ref={takeFocus}
				className="picker-enter flex h-fit w-[480px] max-w-[90vw] flex-col border border-outline-strong bg-surface-raised shadow-2xl outline-none"
				onPointerDown={(event) => event.stopPropagation()}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						onClose();
					}
				}}
			>
				<div className="flex items-center gap-2 border-outline border-b px-3 py-2.5">
					<Cog6ToothIcon className="size-3.5 shrink-0 text-tertiary" aria-hidden="true" />
					<span className="flex-1 text-label text-secondary">SETTINGS</span>
				</div>
				{harness && harnesses ? (
					<SettingsBody
						harness={harness}
						profile={profile}
						harnesses={harnesses}
						onSave={save}
						onSaveProfile={saveProfile}
					/>
				) : (
					<p className="px-3 py-6 text-data text-secondary">Reading settings…</p>
				)}
				<div className="flex items-center gap-3 border-outline border-t px-3 py-2">
					<PickerHint keys={["Esc"]} label="Close" />
					{saveError && (
						<span data-slot="save-error" className="min-w-0 flex-1 truncate text-right text-data text-removed">
							Could not save — the change was not applied.
						</span>
					)}
				</div>
			</div>
		</div>
	);
}

function SettingsBody({
	harness,
	profile,
	harnesses,
	onSave,
	onSaveProfile,
}: {
	harness: HarnessSettings;
	profile: HarnessProfile;
	harnesses: LaunchableHarness[];
	onSave: (patch: Partial<Pick<HarnessSettings, "autostart" | "id">>) => void;
	onSaveProfile: (patch: Partial<HarnessProfile>) => void;
}) {
	const hooks = profile.hooks ?? DEFAULT_HARNESS_HOOKS;
	const naming = profile.naming ?? DEFAULT_SESSION_NAMING;
	const hookable = harnesses.some((entry) => entry.id === harness.id && entry.hooks);

	return (
		<div className="divide-y divide-outline">
			<Setting
				title="Start a harness in every new shell"
				description="Quit it with Ctrl+C twice and the plain shell is right there. Alt+click New shell to skip it up front."
				slot="autostart"
				on={harness.autostart}
				onToggle={() => onSave({ autostart: !harness.autostart })}
			>
				<span className="block pb-1 text-label text-secondary">HARNESS</span>
				<div role="radiogroup" aria-label="Harness">
					{harnesses.map((entry) => (
						<HarnessRow
							key={entry.id}
							harness={entry}
							selected={entry.id === harness.id}
							disabled={!harness.autostart}
							onSelect={() => onSave({ id: entry.id })}
						/>
					))}
				</div>
				<ArgumentsField
					key={harness.id}
					args={profile.args ?? ""}
					disabled={!harness.autostart}
					onCommit={(args) => onSaveProfile({ args })}
				/>
			</Setting>
			{hookable && (
				<Setting
					title="Let the harness tell Bankai when it stops"
					description="Adds a hook to the harness so a card turns Done, or asks for you, the moment it happens instead of on the next poll."
					slot="harness-hooks"
					on={hooks}
					onToggle={() => onSaveProfile({ hooks: !hooks })}
				/>
			)}
			<Setting
				title="Name every session from its conversation"
				description="Asks the harness for a short name a few times as a session grows. Off, a card keeps the first thing you typed."
				slot="naming"
				on={naming}
				onToggle={() => onSaveProfile({ naming: !naming })}
			/>
			<MobileAccessSetting />
		</div>
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
