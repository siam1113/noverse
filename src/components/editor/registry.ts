import type { Editor } from "@tiptap/react";
import {
  AlignLeft,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Route,
  Lightbulb,
  GitBranch,
  type LucideIcon,
} from "lucide-react";
import type { DocNode } from "@/lib/schema";
import { structuralChange } from "./history";

export const newEvent = () => ({
  id: crypto.randomUUID(),
  date: null,
  title: "",
  description: "",
  status: "planned" as const,
});
export const newStep = () => ({
  id: crypto.randomUUID(),
  title: "",
  description: "",
});
export type BlockDefinition = {
  type: string;
  label: string;
  description: string;
  keywords: string[];
  icon: LucideIcon;
  create: () => DocNode;
};
export const blockRegistry: BlockDefinition[] = [
  {
    type: "timeline",
    label: "Timeline",
    description: "Map milestones and moments",
    keywords: ["time", "history", "milestones", "dates"],
    icon: Route,
    create: () => ({
      type: "timeline",
      attrs: {
        schemaVersion: 1,
        subtitle: "",
        events: [newEvent()],
        sortMode: "manual",
      },
    }),
  },
  {
    type: "callout",
    label: "Callout",
    description: "Give an idea room to stand out",
    keywords: ["info", "warning", "idea", "note"],
    icon: Lightbulb,
    create: () => ({
      type: "callout",
      attrs: { schemaVersion: 1, kind: "idea", title: "", body: "" },
    }),
  },
  {
    type: "steps",
    label: "Steps",
    description: "Break a process into steps",
    keywords: ["process", "flow", "workflow"],
    icon: GitBranch,
    create: () => ({
      type: "steps",
      attrs: { schemaVersion: 1, title: "", steps: [newStep()] },
    }),
  },
  {
    type: "paragraph",
    label: "Text",
    description: "Start with a simple paragraph",
    keywords: ["paragraph"],
    icon: AlignLeft,
    create: () => ({ type: "paragraph" }),
  },
  ...([1, 2, 3] as const).map((level) => ({
    type: `heading${level}`,
    label: `Heading ${level}`,
    description: [
      "",
      "A new section",
      "A smaller section",
      "A supporting heading",
    ][level],
    keywords: [`h${level}`, "heading"],
    icon: [Heading1, Heading2, Heading3][level - 1],
    create: () => ({ type: "heading", attrs: { level } }),
  })),
  {
    type: "bulletList",
    label: "Bullet list",
    description: "Collect related ideas",
    keywords: ["list", "bullets"],
    icon: List,
    create: () => ({
      type: "bulletList",
      content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
    }),
  },
  {
    type: "orderedList",
    label: "Numbered list",
    description: "Put things in order",
    keywords: ["list", "numbers"],
    icon: ListOrdered,
    create: () => ({
      type: "orderedList",
      attrs: { start: 1 },
      content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
    }),
  },
  {
    type: "taskList",
    label: "Checklist",
    description: "Make a little progress",
    keywords: ["task", "todo", "check"],
    icon: ListChecks,
    create: () => ({
      type: "taskList",
      content: [
        {
          type: "taskItem",
          attrs: { checked: false },
          content: [{ type: "paragraph" }],
        },
      ],
    }),
  },
];
export function insertBlock(
  editor: Editor,
  definition: BlockDefinition,
  range?: { from: number; to: number },
) {
  const chain = editor.chain().focus();
  if (range) chain.deleteRange(range);
  // One transaction keeps slash removal, insertion and undo together.
  const node = definition.create();
  structuralChange(editor, () => {
    chain
      .insertContent(
        ["timeline", "callout", "steps"].includes(definition.type)
          ? [node, { type: "paragraph" }]
          : node,
      )
      .run();
  });
}
export function filterBlocks(query: string) {
  const search = query.toLowerCase();
  return blockRegistry.filter((block) =>
    [block.label, ...block.keywords].some((word) =>
      word.toLowerCase().includes(search),
    ),
  );
}
