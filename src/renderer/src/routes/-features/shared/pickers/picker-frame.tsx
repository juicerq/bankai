import type { ComponentPropsWithoutRef, ReactNode } from "react";

export function PickerFrame({
	children,
	onClose,
	...attributes
}: Omit<ComponentPropsWithoutRef<"div">, "children" | "className" | "onPointerDown"> & {
	children: ReactNode;
	onClose: () => void;
}) {
	return (
		<div
			className="picker-backdrop fixed inset-0 z-50 flex justify-center bg-surface-sunken/70 pt-[14vh]"
			onPointerDown={onClose}
		>
			<div
				{...attributes}
				className="picker-enter flex h-96 max-h-[72vh] w-[560px] max-w-[90vw] flex-col border border-outline-strong bg-surface-raised shadow-2xl"
				onPointerDown={(event) => event.stopPropagation()}
			>
				{children}
			</div>
		</div>
	);
}

export function PickerHeader({ children }: { children: ReactNode }) {
	return (
		<div className="flex h-12 shrink-0 items-center gap-2 border-outline border-b px-3">
			{children}
		</div>
	);
}

export function PickerFooter({ children }: { children: ReactNode }) {
	return (
		<div className="flex h-10 shrink-0 items-center gap-3 border-outline border-t px-3">
			{children}
		</div>
	);
}
