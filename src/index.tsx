import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "@ui/app";

// exitOnCtrlC off so Ctrl+C reaches the focused shell instead of killing the app.
const renderer = await createCliRenderer({ exitOnCtrlC: false });

createRoot(renderer).render(<App />);
