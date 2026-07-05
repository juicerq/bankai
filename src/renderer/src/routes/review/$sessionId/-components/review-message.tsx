import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function ReviewMessage(props: {
	icon: LucideIcon;
	title: string;
	subtitle?: string;
	children?: ReactNode;
}) {
	const { icon: Icon, title, subtitle, children } = props;

	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
			<Icon size={38} strokeWidth={1} className="text-olive/40" />
			<div className="space-y-1">
				<p className="font-serif text-ink text-base">{title}</p>
				{subtitle && (
					<p className="font-mono text-[12px] text-ink-muted">{subtitle}</p>
				)}
			</div>
			{children}
		</div>
	);
}
