---
title: Why continuity pushes preserve unchanged workspace references
tags: [continuity, ui]
updated_at: 2026-07-31
created_at: 2026-07-27
---

## Structural sharing is what makes a push cheap

TanStack Query applies `replaceEqualDeep` to `setQueryData`, so a push that changes one workspace hands every other workspace back by identity. That is the whole reason `ProjectWorkspace` can be a `memo` over `shells`: a push touching another project compares equal and the workspace does not re-render. `tests/web/use-sessions.test.tsx` pins it with a `structuredClone`d push, because the guarantee comes from the library rather than from our code.
