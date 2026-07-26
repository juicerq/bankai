import { Cog6ToothIcon } from "@heroicons/react/24/outline";
import { useCallback } from "react";
import type { HarnessSettings } from "@main/store/settings";
import { PickerHint } from "@renderer/routes/-components/picker-hint";
import { useHarnessSettings } from "@renderer/routes/-utils/use-harness-settings";

export function SettingsModal({ onClose }: { onClose: () => void }) {
	const { harness, harnesses, save } = useHarnessSettings();
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
					<HarnessSection harness={harness} harnesses={harnesses} onSave={save} />
				) : (
					<p className="px-3 py-6 text-data text-secondary">Reading settings…</p>
				)}
				<div className="flex items-center border-outline border-t px-3 py-2">
					<PickerHint keys={["Esc"]} label="Close" />
				</div>
			</div>
		</div>
	);
}

function HarnessSection({
	harness,
	harnesses,
	onSave,
}: {
	harness: HarnessSettings;
	harnesses: { id: string; label: string }[];
	onSave: (harness: HarnessSettings) => void;
}) {
	return (
		<>
			<div className="flex items-start gap-3 border-outline border-b px-3 py-3">
				<div className="min-w-0 flex-1">
					<span className="block text-body text-primary">Start a harness in every new shell</span>
					<span className="mt-1 block text-data text-secondary">
						Quit it with Ctrl+C twice and the plain shell is right there.
					</span>
				</div>
				<Switch
					label="Start a harness in every new shell"
					on={harness.autostart}
					onToggle={() => onSave({ ...harness, autostart: !harness.autostart })}
				/>
			</div>
			<div className={harness.autostart ? "" : "opacity-40"}>
				<span className="block px-3 pt-3 pb-1 text-label text-secondary">HARNESS</span>
				<div role="radiogroup" aria-label="Harness" className="pb-1">
					{harnesses.map((entry) => (
						<HarnessRow
							key={entry.id}
							label={entry.label}
							id={entry.id}
							selected={entry.id === harness.id}
							disabled={!harness.autostart}
							onSelect={() => onSave({ ...harness, id: entry.id })}
						/>
					))}
				</div>
			</div>
		</>
	);
}

function HarnessRow({
	label,
	id,
	selected,
	disabled,
	onSelect,
}: {
	label: string;
	id: string;
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
			data-id={id}
			className={`relative flex w-full items-center gap-2.5 px-3 py-2 text-left ${
				selected ? "bg-surface-active" : "hover:bg-surface-hover"
			}`}
			onClick={onSelect}
		>
			{selected && <span className="absolute inset-y-0 left-0 w-0.5 bg-tertiary" aria-hidden="true" />}
			<span className="min-w-0 flex-1 truncate text-body text-primary">{label}</span>
			{selected && <span className="shrink-0 text-label text-tertiary">CURRENT</span>}
		</button>
	);
}

function Switch({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={on}
			aria-label={label}
			data-slot="autostart"
			className={`flex h-4 w-7 shrink-0 items-center border p-[2px] ${
				on ? "border-tertiary justify-end" : "border-outline-strong justify-start"
			}`}
			onClick={onToggle}
		>
			<span className={`size-2.5 ${on ? "bg-tertiary" : "bg-outline-strong"}`} aria-hidden="true" />
		</button>
	);
}
