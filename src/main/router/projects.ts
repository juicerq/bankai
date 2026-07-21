import { dialog } from "electron";
import { base } from "@main/router/_base";
import { Projects } from "@main/store/projects";

export const projectsRouter = {
	list: base.handler(() => Projects.list()),
	chooseDirectory: base.handler(async () => {
		const result = await dialog.showOpenDialog({
			properties: ["openDirectory"],
			title: "Add project",
		});
		const path = result.filePaths[0];
		if (result.canceled || !path) {
			return null;
		}
		return await Projects.add(path);
	}),
};
