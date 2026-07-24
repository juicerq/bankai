# Main-owned Continuity

Continuity includes renderer-visible Project and Shell topology, but the Electron main process owns and persists it while the renderer sends typed mutations and initializes from the restored state. Renderer reloads and crashes destroy React state and their PTYs, so renderer-owned or exit-only persistence cannot provide the agreed recovery; the main process already owns both versioned stores and PTY lifecycle.
