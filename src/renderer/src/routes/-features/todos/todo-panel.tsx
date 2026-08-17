import { XMarkIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import type { Project } from "@shared/projects";
import type { Todo } from "@shared/todos";
import { ElapsedClock } from "@renderer/routes/-features/shared/time/elapsed-clock";
import { EmptyState } from "@renderer/routes/-features/app/status/empty-state";
import { useTodos } from "@renderer/routes/-features/todos/use-todos";

export function TodoPanel({ project, onClose }: { project: Project; onClose: () => void }) {
	const { open, done, listError, saveFailure, retry, add, setDone, remove } = useTodos(project.id);
	const [draft, setDraft] = useState("");
	const capture = () => {
		const text = draft.trim();

		if (!text) {
			return;
		}

		add(text, () => setDraft(""));
	};

	return (
		<section data-component="todo-panel" className="flex size-full min-w-0 flex-col bg-surface-raised">
			<div className="flex h-header shrink-0 items-center border-outline border-b">
				<span className="shrink-0 pl-3 text-label text-secondary">TODO</span>
				<span className="min-w-0 flex-1 truncate pl-2 text-body text-secondary">{project.name}</span>
				<span data-slot="open-count" className="shrink-0 px-3 text-data text-secondary tabular-nums">
					{open.length} open
				</span>
				<button
					type="button"
					data-slot="close"
					className="flex h-full w-header shrink-0 items-center justify-center border-outline border-l text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
					aria-label="Close todo list"
					title="Close todo list"
					onClick={onClose}
				>
					<XMarkIcon className="size-4" />
				</button>
			</div>
			<div className="flex h-header shrink-0 items-center gap-2 border-outline border-b px-3">
				<span aria-hidden="true" className="w-3 shrink-0 text-center text-body text-tertiary">›</span>
				<input
					data-slot="capture"
					autoFocus
					maxLength={2000}
					spellCheck={false}
					autoComplete="off"
					disabled={!!listError}
					aria-label="Write a todo"
					placeholder="Write it down before it is gone"
					className="min-w-0 flex-1 bg-transparent text-body text-primary outline-none placeholder:text-outline-strong disabled:cursor-default"
					value={draft}
					onInput={(event) => setDraft(event.currentTarget.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							capture();
						}
					}}
				/>
			</div>
			{saveFailure && (
				<p
					data-slot="notice"
					data-message={String(saveFailure.error)}
					className="shrink-0 border-outline border-b px-3 py-2 text-data text-removed"
				>
					{saveFailure.message}
				</p>
			)}
			<div className="min-h-0 flex-1 overflow-y-auto bg-surface-sunken">
				<TodoBody
					open={open}
					done={done}
					listError={listError}
					onRetry={retry}
					onSetDone={setDone}
					onRemove={remove}
				/>
			</div>
		</section>
	);
}

function TodoBody({
	open,
	done,
	listError,
	onRetry,
	onSetDone,
	onRemove,
}: {
	open: Todo[];
	done: Todo[];
	listError: string | undefined;
	onRetry: () => void;
	onSetDone: (id: string, done: boolean) => void;
	onRemove: (id: string) => void;
}) {
	if (listError) {
		return (
			<div data-slot="failure" data-message={listError} className="flex h-full">
				<EmptyState
					mark="!"
					title="Todos unavailable"
					description={listError}
					actionLabel="Retry loading"
					onAction={onRetry}
				/>
			</div>
		);
	}

	if (open.length === 0 && done.length === 0) {
		return (
			<p data-slot="blank" className="flex h-full items-center justify-center px-6 text-center text-secondary text-support">
				Nothing captured for this project yet
			</p>
		);
	}

	return (
		<>
			<TodoList todos={open} onSetDone={onSetDone} onRemove={onRemove} />
			{done.length > 0 && (
				<div data-slot="done-section" className="border-outline border-t">
					<div className="flex items-center gap-2 px-3 pt-3 pb-1">
						<span className="text-label text-secondary">DONE</span>
						<span data-slot="done-count" className="text-data text-secondary tabular-nums">{done.length}</span>
					</div>
					<TodoList todos={done} onSetDone={onSetDone} onRemove={onRemove} />
				</div>
			)}
		</>
	);
}

function TodoList({
	todos,
	onSetDone,
	onRemove,
}: {
	todos: Todo[];
	onSetDone: (id: string, done: boolean) => void;
	onRemove: (id: string) => void;
}) {
	return (
		<ul className="flex flex-col">
			{todos.map((todo) => <TodoRow key={todo.id} todo={todo} onSetDone={onSetDone} onRemove={onRemove} />)}
		</ul>
	);
}

function TodoRow({
	todo,
	onSetDone,
	onRemove,
}: {
	todo: Todo;
	onSetDone: (id: string, done: boolean) => void;
	onRemove: (id: string) => void;
}) {
	const done = todo.doneAt !== undefined;

	return (
		<li
			data-component="todo-row"
			data-todo={todo.id}
			data-done={done}
			className="group flex items-start gap-2 px-3 py-1.5 hover:bg-surface-hover"
		>
			<button
				type="button"
				role="checkbox"
				data-slot="toggle"
				aria-checked={done}
				aria-label={todo.text}
				className="-my-0.5 flex size-5 shrink-0 items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				onClick={() => onSetDone(todo.id, !done)}
			>
				<span
					aria-hidden="true"
					className={`flex size-3 border p-px ${done ? "border-tertiary" : "border-outline-strong group-hover:border-secondary"}`}
				>
					{done && <span className="size-full bg-tertiary" />}
				</span>
			</button>
			<span
				data-slot="text"
				className={`min-w-0 flex-1 whitespace-pre-wrap break-words text-body ${
					done ? "text-secondary line-through" : "text-primary"
				}`}
			>
				{todo.text}
			</span>
			<ElapsedClock since={todo.createdAt} slot="age" className="mt-0.5 text-data text-secondary tabular-nums" />
			<button
				type="button"
				data-slot="remove"
				className="-my-0.5 flex size-5 shrink-0 items-center justify-center text-secondary opacity-0 hover:text-primary focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
				aria-label={`Remove ${todo.text}`}
				title="Remove"
				onClick={() => onRemove(todo.id)}
			>
				<XMarkIcon className="size-3.5" />
			</button>
		</li>
	);
}
