---
title: What the Last turn scope can and cannot attribute, and why shells sharing a worktree mix
tags: [git, ui]
updated_at: 2026-07-25
created_at: 2026-07-25
---

# Last turn is a time window over a directory

`captureTurnBaseline` snapshots the content of every dirty file when a shell's agent opens a turn, and `turnSnapshot` diffs the whole worktree against that snapshot. The baseline is keyed by shell, so each tab already reads its own marker — but the comparison is per directory, not per author.

Two shells in the same worktree therefore share one diff. Whatever shell 1 writes after shell 2's turn opens shows up in shell 2's Last turn, even when shell 2 only answered a question. What shell 1 wrote *before* that moment does not: it is already in the baseline.

## Author attribution would lose more than it hides

Filtering the diff by the files a session edited was considered and rejected. Claude transcripts (`~/.claude/projects/*/*.jsonl`) record `Edit`/`Write` with a `file_path`, but a working session runs more `Bash` calls than edits — a formatter, a codegen step, a checkout all change files and name none of them. Filtering by tool call would drop those real changes from the panel silently.

Two smaller holes: when both sessions touch one file, filtering by path still mixes them, because the diff is against a content baseline rather than a write log; and the user's own edits in an editor would disappear from the turn.

The panel prefers a false positive you can see over a false negative you cannot. Isolation belongs to a worktree per shell, which the product already supports.
