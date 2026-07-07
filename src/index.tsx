import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { HookInstaller } from "@core/hooks/HookInstaller";
import { Logger } from "@core/logger";
import { Projects } from "@core/store/projects";
import { App } from "@ui/app";

await HookInstaller.install().catch((err) => Logger.error("hooks:install-failed", String(err)));

const initialProjects = await Projects.list();

const renderer = await createCliRenderer({ exitOnCtrlC: false });

createRoot(renderer).render(<App initialProjects={initialProjects} />);
