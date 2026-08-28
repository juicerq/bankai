import {
	ArrowLeftIcon,
	CommandLineIcon,
	DevicePhoneMobileIcon,
	FolderIcon,
	ShieldCheckIcon,
	SwatchIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useState } from "react";
import type { Project } from "@shared/projects";
import { WINDOW_NO_DRAG_CLASS } from "@renderer/routes/-features/app/chrome/window-drag";
import { PickerHint } from "@renderer/routes/-features/shared/pickers/picker-hint";
import { BrowserDataSetting } from "@renderer/routes/-features/settings/settings-browser-data";
import { HarnessSetting } from "@renderer/routes/-features/settings/settings-harness";
import { SettingsProjects } from "@renderer/routes/-features/settings/settings-projects";
import { MobileAccessSetting } from "@renderer/routes/-features/settings/settings-mobile-access";
import { ThemeSetting } from "@renderer/routes/-features/settings/settings-theme";

const SECTIONS = [
	{ id: "harness", label: "Harness", icon: CommandLineIcon },
	{ id: "mobile", label: "Mobile access", icon: DevicePhoneMobileIcon },
	{ id: "appearance", label: "Appearance", icon: SwatchIcon },
	{ id: "projects", label: "Projects", icon: FolderIcon },
	{ id: "data", label: "Browser data", icon: ShieldCheckIcon },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

interface SettingsScreenProps {
	projects: Project[];
	shellCounts: ReadonlyMap<string, number>;
	onOpenDirectory: (path: string) => void;
	onRemoveProject: (projectId: string) => void;
	onClose: () => void;
}

export function SettingsScreen(props: SettingsScreenProps) {
	const [sectionId, setSectionId] = useState<SectionId>("harness");
	const takeFocus = useCallback((element: HTMLDivElement | null) => element?.focus(), []);
	const section = SECTIONS.find((entry) => entry.id === sectionId) ?? SECTIONS[0];

	return (
		<div
			data-component="settings-screen"
			role="dialog"
			aria-modal="true"
			aria-label="Settings"
			tabIndex={-1}
			ref={takeFocus}
			className="picker-backdrop absolute inset-0 z-40 flex flex-col bg-surface outline-none"
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					props.onClose();
				}
			}}
		>
			<div className="flex h-header shrink-0 items-center border-outline border-b bg-surface-raised">
				<div className="flex h-full w-56 shrink-0 items-center gap-2 border-outline border-r pr-3">
					<button
						type="button"
						data-slot="close-settings"
						aria-label="Close settings"
						className={`flex h-full w-header shrink-0 items-center justify-center text-secondary hover:bg-surface-hover hover:text-primary ${WINDOW_NO_DRAG_CLASS}`}
						onClick={props.onClose}
					>
						<ArrowLeftIcon className="size-4" aria-hidden="true" />
					</button>
					<span className="text-label text-secondary">SETTINGS</span>
				</div>
				<div className="flex h-full min-w-0 flex-1 items-center px-4">
					<PickerHint keys={["Esc"]} label="Close" />
				</div>
			</div>
			<div className="flex min-h-0 flex-1">
				<nav
					aria-label="Settings sections"
					className="flex w-56 shrink-0 flex-col overflow-y-auto border-outline border-r bg-surface-raised py-2"
				>
					{SECTIONS.map((entry) => (
						<SectionTab
							key={entry.id}
							section={entry}
							selected={entry.id === section.id}
							onSelect={() => setSectionId(entry.id)}
						/>
					))}
				</nav>
				<div className="min-w-0 flex-1 overflow-y-auto">
					<div className="mx-auto w-full max-w-3xl px-4 py-4">
						<h2 className="text-subtitle text-primary">{section.label}</h2>
						<div className="mt-3 divide-y divide-outline border border-outline bg-surface-raised">
							{section.id === "harness" && <HarnessSetting />}
							{section.id === "mobile" && <MobileAccessSetting />}
							{section.id === "appearance" && <ThemeSetting />}
							{section.id === "projects" && (
								<SettingsProjects
									projects={props.projects}
									shellCounts={props.shellCounts}
									onOpenDirectory={props.onOpenDirectory}
									onRemove={props.onRemoveProject}
								/>
							)}
							{section.id === "data" && <BrowserDataSetting />}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function SectionTab({
	section,
	selected,
	onSelect,
}: {
	section: (typeof SECTIONS)[number];
	selected: boolean;
	onSelect: () => void;
}) {
	const Icon = section.icon;

	return (
		<button
			type="button"
			data-component="settings-nav"
			data-id={section.id}
			aria-current={selected ? "page" : undefined}
			className={`relative flex h-8 shrink-0 items-center gap-2 px-3 text-left text-body ${
				selected ? "bg-surface-active text-primary" : "text-secondary hover:bg-surface-hover hover:text-primary"
			}`}
			onClick={onSelect}
		>
			<span
				aria-hidden="true"
				className={`absolute inset-y-0 left-0 w-0.5 ${selected ? "bg-outline-strong" : "bg-transparent"}`}
			/>
			<Icon className="size-4 shrink-0" aria-hidden="true" />
			<span className="min-w-0 truncate">{section.label}</span>
		</button>
	);
}
