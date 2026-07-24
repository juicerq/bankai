import { type } from "arktype";
import { dialog, shell } from "electron";
import { base } from "@main/router/_base";
import { Continuity } from "@main/store/continuity";
import { Projects } from "@main/store/projects";

export const projectsRouter = {
	list: base.handler(() => Projects.list()),
	openDirectory: base.input(type({ projectId: "string" })).handler(async ({ input }) => {
		const project = await Projects.find(input.projectId);
		const error = await shell.openPath(project.path);
		if (error) {
			throw new Error(error);
		}
	}),
	remove: base.input(type({ projectId: "string" })).handler(async ({ input }) => {
		await Projects.find(input.projectId);
		await Projects.remove(input.projectId);
		await Continuity.purgeProject(input.projectId);
	}),
	move: base.input(type({ projectId: "string", toIndex: "number" })).handler(async ({ input }) => {
		await Projects.find(input.projectId);
		await Projects.move(input);
	}),
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
