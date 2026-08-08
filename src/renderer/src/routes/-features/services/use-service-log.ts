import { useCallback, useState } from "react";
import type { ProjectCommand } from "@shared/project-commands";

export function useServiceLog({
	services,
	onOpen,
}: {
	services: readonly ProjectCommand[];
	onOpen: () => void;
}) {
	const [openedCommandId, setOpenedCommandId] = useState<string>();
	const close = useCallback(() => setOpenedCommandId(undefined), []);
	const toggle = useCallback(
		(commandId: string) => {
			if (commandId === openedCommandId) {
				setOpenedCommandId(undefined);

				return;
			}

			setOpenedCommandId(commandId);
			onOpen();
		},
		[onOpen, openedCommandId],
	);

	return {
		openedCommandId,
		opened: services.find((service) => service.id === openedCommandId),
		toggle,
		close,
	};
}
