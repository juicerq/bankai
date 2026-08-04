import { SettingBlock } from "@renderer/routes/-components/settings-controls";
import { useThemeSetting } from "@renderer/routes/-utils/use-theme-setting";
import { THEME_PREFERENCES, type ThemePreference } from "@shared/theme";

const THEME_LABELS: Record<ThemePreference, string> = {
	dark: "Dark",
	light: "Light",
	system: "System",
};

export function ThemeSetting() {
	const { theme, saveError, save } = useThemeSetting();

	return (
		<SettingBlock
			title="Theme"
			description="Paints every surface, terminals included. System follows whatever your desktop is set to."
		>
			<div role="radiogroup" aria-label="Theme" className="flex gap-2">
				{THEME_PREFERENCES.map((preference) => (
					<ThemeOption
						key={preference}
						preference={preference}
						selected={preference === theme}
						onSelect={() => save(preference)}
					/>
				))}
			</div>
			{saveError && (
				<span data-slot="theme-failed" className="mt-3 block text-data text-removed">
					Could not change the theme — nothing moved.
				</span>
			)}
		</SettingBlock>
	);
}

function ThemeOption({
	preference,
	selected,
	onSelect,
}: {
	preference: ThemePreference;
	selected: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			role="radio"
			aria-checked={selected}
			data-component="settings-theme"
			data-id={preference}
			className={`flex-1 border px-2 py-1.5 text-center text-body ${
				selected
					? "border-tertiary bg-surface-active text-primary"
					: "border-outline text-secondary hover:bg-surface-hover hover:text-primary"
			}`}
			onClick={onSelect}
		>
			{THEME_LABELS[preference]}
		</button>
	);
}
