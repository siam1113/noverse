"use client";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  MoreHorizontal,
  Plus,
  Trash2,
  AlignLeft,
  Route,
  GitBranch,
  Lightbulb,
  Info,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { newEvent, newStep } from "./registry";
import { structuralChange } from "./history";
import {
  MAX_ITEMS,
  orderedEvents,
  type TimelineAttrs,
  type CalloutAttrs,
  type StepsAttrs,
} from "@/lib/schema";

function cloneIds(value: Record<string, unknown>) {
  const attrs = structuredClone(value);
  for (const key of ["events", "steps"])
    if (Array.isArray(attrs[key]))
      attrs[key] = (attrs[key] as Record<string, unknown>[]).map((item) => ({
        ...item,
        id: crypto.randomUUID(),
      }));
  return attrs;
}
function plainText(props: NodeViewProps) {
  const attrs = props.node.attrs;
  if (props.node.type.name === "timeline")
    return [
      attrs.subtitle,
      ...attrs.events.map(
        (event: {
          date: string;
          title: string;
          description: string;
          status: string;
        }) =>
          [event.date, event.title, event.description, event.status]
            .filter(Boolean)
            .join(" — "),
      ),
    ]
      .filter(Boolean)
      .join("\n");
  if (props.node.type.name === "steps")
    return [
      attrs.title,
      ...attrs.steps.map(
        (step: { title: string; description: string }, i: number) =>
          `${i + 1}. ${step.title}${step.description ? ` — ${step.description}` : ""}`,
      ),
    ]
      .filter(Boolean)
      .join("\n");
  return [attrs.title, attrs.body].filter(Boolean).join("\n");
}
function BlockToolbar(props: NodeViewProps) {
  const { editor, node, getPos, deleteNode } = props;
  const pos = getPos();
  function move(direction: -1 | 1) {
    const position = getPos();
    if (position === undefined) return;
    const $pos = editor.state.doc.resolve(position);
    const index = $pos.index();
    const sibling = $pos.parent.maybeChild(index + direction);
    if (!sibling) return;
    const target =
      direction === -1
        ? position - sibling.nodeSize
        : position + sibling.nodeSize;
    const transaction = editor.state.tr
      .delete(position, position + node.nodeSize)
      .insert(target, node);
    structuralChange(editor, () =>
      editor.view.dispatch(transaction.scrollIntoView()),
    );
  }
  function insert(below: boolean) {
    const position = getPos();
    if (position !== undefined)
      structuralChange(editor, () => {
        editor
          .chain()
          .focus()
          .insertContentAt(position + (below ? node.nodeSize : 0), {
            type: "paragraph",
          })
          .run();
      });
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`${node.type.name} block menu`}
          className="block-menu"
        >
          <MoreHorizontal size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => insert(false)}>
          <Plus />
          Insert text above
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => insert(true)}>
          <Plus />
          Insert text below
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={
            pos === undefined || editor.state.doc.resolve(pos).index() === 0
          }
          onSelect={() => move(-1)}
        >
          <ArrowUp />
          Move up
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={
            pos === undefined ||
            editor.state.doc.resolve(pos).index() ===
              editor.state.doc.resolve(pos).parent.childCount - 1
          }
          onSelect={() => move(1)}
        >
          <ArrowDown />
          Move down
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            structuralChange(editor, () => {
              const position = getPos();
              if (position !== undefined)
                editor
                  .chain()
                  .focus()
                  .insertContentAt(position + node.nodeSize, {
                    type: node.type.name,
                    attrs: cloneIds(node.attrs),
                  })
                  .run();
            })
          }
        >
          <Copy />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            structuralChange(editor, () => {
              const position = getPos();
              if (position !== undefined) {
                const text = plainText(props);
                editor
                  .chain()
                  .focus()
                  .insertContentAt(
                    { from: position, to: position + node.nodeSize },
                    {
                      type: "paragraph",
                      content: text ? [{ type: "text", text }] : [],
                    },
                  )
                  .run();
              }
            })
          }
        >
          <AlignLeft />
          Convert to text
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="danger-text"
          onSelect={() => structuralChange(editor, deleteNode)}
        >
          <Trash2 />
          Delete block
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
function ItemControls({
  label,
  index,
  length,
  move,
  remove,
  disabled = false,
}: {
  label: string;
  index: number;
  length: number;
  move: (direction: -1 | 1) => void;
  remove: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="item-controls">
      <Button
        variant="ghost"
        size="icon"
        disabled={disabled || index === 0}
        aria-label={`Move ${label} up`}
        onClick={() => move(-1)}
      >
        <ArrowUp size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={disabled || index === length - 1}
        aria-label={`Move ${label} down`}
        onClick={() => move(1)}
      >
        <ArrowDown size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Delete ${label}`}
        onClick={remove}
      >
        <Trash2 size={14} />
      </Button>
    </div>
  );
}
function reordered<T>(items: T[], index: number, direction: -1 | 1) {
  const next = [...items];
  [next[index], next[index + direction]] = [
    next[index + direction],
    next[index],
  ];
  return next;
}
function undoInField(event: React.KeyboardEvent, props: NodeViewProps) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) props.editor.commands.redo();
    else props.editor.commands.undo();
  }
}
export function TimelineView(props: NodeViewProps) {
  const updateStructure = (attrs: Record<string, unknown>) =>
    structuralChange(props.editor, () => props.updateAttributes(attrs));
  const attrs = props.node.attrs as TimelineAttrs;
  const events = orderedEvents(attrs.events, attrs.sortMode);
  function change(id: string, patch: Partial<TimelineAttrs["events"][number]>) {
    props.updateAttributes({
      events: attrs.events.map((event) =>
        event.id === id ? { ...event, ...patch } : event,
      ),
    });
  }
  return (
    <NodeViewWrapper
      className={`visual-block timeline-block ${props.selected ? "is-selected" : ""}`}
      contentEditable={false}
      onKeyDown={(event: React.KeyboardEvent) => undoInField(event, props)}
    >
      <div className="block-heading">
        <span className="block-icon">
          <Route size={18} />
        </span>
        <span>Timeline</span>
        <div className="block-heading-actions">
          <select
            aria-label="Timeline sort order"
            value={attrs.sortMode}
            onChange={(event) =>
              props.updateAttributes({ sortMode: event.target.value })
            }
          >
            <option value="manual">Manual order</option>
            <option value="chronological">Chronological</option>
          </select>
          <BlockToolbar {...props} />
        </div>
      </div>
      <input
        className="block-subtitle"
        aria-label="Timeline subtitle"
        placeholder="A journey, one milestone at a time…"
        maxLength={240}
        value={attrs.subtitle}
        onChange={(event) =>
          props.updateAttributes({ subtitle: event.target.value })
        }
      />
      <div className="timeline-events">
        {events.map((item, index) => (
          <div
            className={`timeline-event status-${item.status ?? "none"}`}
            key={item.id}
            data-testid="timeline-event"
          >
            <span className="event-marker">
              {item.status === "done" ? "✓" : index + 1}
            </span>
            <div className="event-card">
              <div className="event-meta">
                <input
                  aria-label={`Event ${index + 1} date`}
                  placeholder="Date or time label"
                  maxLength={80}
                  value={item.date ?? ""}
                  onChange={(event) =>
                    change(item.id, { date: event.target.value || null })
                  }
                />
                <select
                  aria-label={`Event ${index + 1} status`}
                  value={item.status ?? ""}
                  onChange={(event) =>
                    change(item.id, {
                      status: (event.target.value ||
                        null) as typeof item.status,
                    })
                  }
                >
                  <option value="">No status</option>
                  <option value="planned">Planned</option>
                  <option value="in-progress">In progress</option>
                  <option value="done">Done</option>
                </select>
              </div>
              <input
                className="event-title"
                aria-label={`Event ${index + 1} title`}
                placeholder="Milestone title"
                maxLength={240}
                value={item.title}
                onChange={(event) =>
                  change(item.id, { title: event.target.value })
                }
                onBlur={() => {
                  if (!item.title.trim())
                    change(item.id, { title: "Untitled milestone" });
                }}
              />
              <textarea
                aria-label={`Event ${index + 1} details`}
                placeholder="What happens here?"
                maxLength={10000}
                rows={2}
                value={item.description}
                onChange={(event) =>
                  change(item.id, { description: event.target.value })
                }
              />
              <ItemControls
                label={`event ${index + 1}`}
                index={index}
                length={events.length}
                disabled={attrs.sortMode === "chronological"}
                move={(direction) =>
                  updateStructure({
                    events: reordered(attrs.events, index, direction),
                  })
                }
                remove={() =>
                  updateStructure({
                    events: attrs.events.filter(
                      (event) => event.id !== item.id,
                    ),
                  })
                }
              />
            </div>
          </div>
        ))}
      </div>
      <Button
        className="add-item"
        variant="ghost"
        size="sm"
        disabled={events.length >= MAX_ITEMS}
        onClick={() =>
          updateStructure({ events: [...attrs.events, newEvent()] })
        }
      >
        <Plus size={16} />
        {events.length ? "Add milestone" : "Add your first event"}
      </Button>
      {attrs.sortMode === "chronological" && (
        <span className="block-hint">
          Use YYYY-MM-DD to sort dates. Other labels follow dated events.
        </span>
      )}
    </NodeViewWrapper>
  );
}
export function CalloutView(props: NodeViewProps) {
  const attrs = props.node.attrs as CalloutAttrs;
  const Icon = { idea: Lightbulb, info: Info, warning: TriangleAlert }[
    attrs.kind
  ];
  return (
    <NodeViewWrapper
      className={`visual-block callout-block callout-${attrs.kind}`}
      contentEditable={false}
      onKeyDown={(event: React.KeyboardEvent) => undoInField(event, props)}
    >
      <div className="block-heading">
        <Icon size={19} />
        <select
          aria-label="Callout type"
          value={attrs.kind}
          onChange={(event) =>
            props.updateAttributes({ kind: event.target.value })
          }
        >
          <option value="idea">Idea</option>
          <option value="info">Information</option>
          <option value="warning">Warning</option>
        </select>
        <div className="block-heading-actions">
          <BlockToolbar {...props} />
        </div>
      </div>
      <input
        className="event-title"
        aria-label="Callout title"
        placeholder="Something worth remembering"
        maxLength={240}
        value={attrs.title}
        onChange={(event) =>
          props.updateAttributes({ title: event.target.value })
        }
      />
      <textarea
        aria-label="Callout body"
        placeholder="Capture the thought…"
        rows={2}
        maxLength={10000}
        value={attrs.body}
        onChange={(event) =>
          props.updateAttributes({ body: event.target.value })
        }
      />
    </NodeViewWrapper>
  );
}
export function StepsView(props: NodeViewProps) {
  const updateStructure = (attrs: Record<string, unknown>) =>
    structuralChange(props.editor, () => props.updateAttributes(attrs));
  const attrs = props.node.attrs as StepsAttrs;
  function change(id: string, patch: Partial<StepsAttrs["steps"][number]>) {
    props.updateAttributes({
      steps: attrs.steps.map((step) =>
        step.id === id ? { ...step, ...patch } : step,
      ),
    });
  }
  return (
    <NodeViewWrapper
      className="visual-block steps-block"
      contentEditable={false}
      onKeyDown={(event: React.KeyboardEvent) => undoInField(event, props)}
    >
      <div className="block-heading">
        <span className="block-icon">
          <GitBranch size={18} />
        </span>
        <span>Steps</span>
        <div className="block-heading-actions">
          <BlockToolbar {...props} />
        </div>
      </div>
      <input
        className="block-subtitle"
        aria-label="Process title"
        placeholder="A little structure for the next big thing…"
        maxLength={240}
        value={attrs.title}
        onChange={(event) =>
          props.updateAttributes({ title: event.target.value })
        }
      />
      {attrs.steps.map((step, index) => (
        <div className="process-step" key={step.id}>
          <span className="step-number">{index + 1}</span>
          <div className="step-content">
            <input
              className="event-title"
              aria-label={`Step ${index + 1} title`}
              placeholder="Step title"
              maxLength={240}
              value={step.title}
              onChange={(event) =>
                change(step.id, { title: event.target.value })
              }
            />
            <textarea
              aria-label={`Step ${index + 1} description`}
              placeholder="What needs to happen?"
              rows={2}
              maxLength={10000}
              value={step.description}
              onChange={(event) =>
                change(step.id, { description: event.target.value })
              }
            />
            <ItemControls
              label={`step ${index + 1}`}
              index={index}
              length={attrs.steps.length}
              move={(direction) =>
                updateStructure({
                  steps: reordered(attrs.steps, index, direction),
                })
              }
              remove={() =>
                updateStructure({
                  steps: attrs.steps.filter((item) => item.id !== step.id),
                })
              }
            />
          </div>
        </div>
      ))}
      <Button
        className="add-item"
        variant="ghost"
        size="sm"
        disabled={attrs.steps.length >= MAX_ITEMS}
        onClick={() => updateStructure({ steps: [...attrs.steps, newStep()] })}
      >
        <Plus size={16} />
        {attrs.steps.length ? "Add step" : "Add your first step"}
      </Button>
    </NodeViewWrapper>
  );
}
