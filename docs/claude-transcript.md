---
title: Traps in Claude Code toolUseResult records; read before changing claude transcript normalization
tags: [harness]
updated_at: 2026-07-17
created_at: 2026-07-17
---

# Claude Code transcript

## `originalFile` is null for files over ~10KB

Since Claude Code 2.1.x, Edit toolUseResults carry `originalFile: null` when the edited
file exceeds roughly 10KB — about a quarter of all Edit records in real transcripts.
`oldString`/`newString`/`replaceAll` stay verbatim. Reconstruction reverses the
replacement against the file on disk (or a later full snapshot of the same path in the
batch) and forward-validates the result; an edit the file cannot confirm marks the
Session unsafe, same as a codex patch mismatch.

## `structuredPatch` content is whitespace-mangled

The hunks in `structuredPatch` expand tabs to spaces, so their line content does not
match the file. Line numbers and prefixes are reliable; the text is display-only. Never
splice hunk lines into reconstructed content.

## Write results

Write toolUseResults have `type: "create" | "update"`. Creates always carry
`originalFile: null` and an empty `structuredPatch`; the empty `before` is truthful.
Updates on files over the size cap also come with `originalFile: null` — the previous
content is unrecoverable from the transcript, so those still project as a full-file
addition.
