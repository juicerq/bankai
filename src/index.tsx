import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { Projects } from "@core/store/projects";
import { App } from "@ui/app";

const initialProjects = await Projects.list();

const renderer = await createCliRenderer({ exitOnCtrlC: false });

createRoot(renderer).render(<App initialProjects={initialProjects} />);
