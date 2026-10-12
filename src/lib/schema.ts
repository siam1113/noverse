import { z } from "zod";

export const MAX_ITEMS = 100;
export const MAX_BODY_BYTES = 1_000_000;
const shortText = z.string().max(240);
const description = z.string().max(10_000);
export const eventSchema = z
  .object({
    id: z.uuid(),
    date: z.string().max(80).nullable(),
    title: shortText,
    description,
    status: z.enum(["planned", "in-progress", "done"]).nullable(),
  })
  .strict();
export const stepSchema = z
  .object({ id: z.uuid(), title: shortText, description })
  .strict();
const uniqueIds = (items: { id: string }[]) =>
  new Set(items.map((item) => item.id)).size === items.length;
export const timelineSchema = z
  .object({
    schemaVersion: z.literal(1),
    subtitle: shortText,
    events: z
      .array(eventSchema)
      .max(MAX_ITEMS)
      .refine(uniqueIds, "Event IDs must be unique"),
    sortMode: z.enum(["manual", "chronological"]),
  })
  .strict();
export const calloutSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.enum(["info", "warning", "idea"]),
    title: shortText,
    body: description,
  })
  .strict();
export const stepsSchema = z
  .object({
    schemaVersion: z.literal(1),
    title: shortText,
    steps: z
      .array(stepSchema)
      .max(MAX_ITEMS)
      .refine(uniqueIds, "Step IDs must be unique"),
  })
  .strict();
export type TimelineEvent = z.infer<typeof eventSchema>;
export type TimelineAttrs = z.infer<typeof timelineSchema>;
export type CalloutAttrs = z.infer<typeof calloutSchema>;
export type Step = z.infer<typeof stepSchema>;
export type StepsAttrs = z.infer<typeof stepsSchema>;

export type DocNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
};
const safeUrl = z
  .string()
  .max(2048)
  .refine(
    (url) => /^(https?:\/\/|mailto:)/i.test(url),
    "Use an http, https, or mailto link",
  );
const markSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bold") }).strict(),
  z.object({ type: z.literal("italic") }).strict(),
  z.object({ type: z.literal("strike") }).strict(),
  z.object({ type: z.literal("underline") }).strict(),
  z.object({ type: z.literal("code") }).strict(),
  z
    .object({
      type: z.literal("link"),
      attrs: z
        .object({
          href: safeUrl,
          target: z.enum(["_blank", "_self"]).nullable().optional(),
          rel: z.string().max(120).nullable().optional(),
          class: z.null().optional(),
          title: z.string().max(240).nullable().optional(),
        })
        .strict(),
    })
    .strict(),
]);
const nodeSchema: z.ZodType<DocNode> = z.lazy(() =>
  z
    .object({
      type: z.enum([
        "doc",
        "paragraph",
        "text",
        "heading",
        "bulletList",
        "orderedList",
        "listItem",
        "taskList",
        "taskItem",
        "hardBreak",
        "horizontalRule",
        "blockquote",
        "codeBlock",
        "timeline",
        "callout",
        "steps",
      ]),
      attrs: z.record(z.string(), z.unknown()).optional(),
      content: z.array(nodeSchema).max(2000).optional(),
      text: z.string().min(1).max(100_000).optional(),
      marks: z.array(markSchema).max(8).optional(),
    })
    .strict(),
);
const attrsSchemas: Record<string, z.ZodType> = {
  timeline: timelineSchema,
  callout: calloutSchema,
  steps: stepsSchema,
  heading: z.object({ level: z.number().int().min(1).max(3) }).strict(),
  orderedList: z
    .object({
      start: z.number().int().min(1).max(1_000_000).optional(),
      type: z.enum(["1", "a", "A", "i", "I"]).nullable().optional(),
    })
    .strict(),
  taskItem: z.object({ checked: z.boolean() }).strict(),
  codeBlock: z
    .object({ language: z.string().max(80).nullable().optional() })
    .strict(),
};
const blocks = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "taskList",
  "horizontalRule",
  "blockquote",
  "codeBlock",
  "timeline",
  "callout",
  "steps",
];
const children: Record<string, string[]> = {
  doc: blocks,
  blockquote: blocks,
  paragraph: ["text", "hardBreak"],
  heading: ["text", "hardBreak"],
  bulletList: ["listItem"],
  orderedList: ["listItem"],
  taskList: ["taskItem"],
  listItem: blocks,
  taskItem: blocks,
  codeBlock: ["text"],
};

// Bound depth and total nodes before handing untrusted recursive JSON to Zod.
export const contentSchema = z
  .unknown()
  .superRefine((value, ctx) => {
    let count = 0;
    function inspect(node: unknown, depth: number) {
      if (++count > 5000 || depth > 12)
        throw new Error("Document is too large or deeply nested");
      if (
        node &&
        typeof node === "object" &&
        "content" in node &&
        Array.isArray(node.content)
      ) {
        for (const child of node.content) inspect(child, depth + 1);
      }
    }
    try {
      inspect(value, 0);
    } catch (error) {
      ctx.addIssue({ code: "custom", message: (error as Error).message });
    }
  })
  .pipe(nodeSchema)
  .superRefine((root, ctx) => {
    if (root.type !== "doc")
      ctx.addIssue({ code: "custom", message: "Root must be a document" });
    function check(node: DocNode, path: (string | number)[]) {
      const attrResult = (
        attrsSchemas[node.type] ?? z.object({}).strict()
      ).safeParse(node.attrs ?? {});
      if (!attrResult.success)
        ctx.addIssue({
          code: "custom",
          message: `Invalid ${node.type} attributes`,
          path,
        });
      if (node.type === "text" ? !node.text : node.text !== undefined)
        ctx.addIssue({ code: "custom", message: "Invalid text node", path });
      if (node.marks?.length && node.type !== "text")
        ctx.addIssue({ code: "custom", message: "Marks require text", path });
      const allowed = children[node.type] ?? [];
      if (
        [
          "doc",
          "listItem",
          "taskItem",
          "bulletList",
          "orderedList",
          "taskList",
          "blockquote",
        ].includes(node.type) &&
        !node.content?.length
      )
        ctx.addIssue({
          code: "custom",
          message: "Block requires content",
          path,
        });
      if (
        ["listItem", "taskItem"].includes(node.type) &&
        node.content?.[0]?.type !== "paragraph"
      )
        ctx.addIssue({
          code: "custom",
          message: "List items must start with a paragraph",
          path,
        });
      node.content?.forEach((child, i) => {
        if (!allowed.includes(child.type))
          ctx.addIssue({
            code: "custom",
            message: `Invalid child in ${node.type}`,
            path,
          });
        if (node.type === "codeBlock" && child.marks?.length)
          ctx.addIssue({
            code: "custom",
            message: "Code blocks cannot contain marks",
            path,
          });
        check(child, [...path, "content", i]);
      });
    }
    check(root, []);
  });
export const createSchema = z
  .object({
    title: z.string().trim().min(1).max(240).optional(),
    content: contentSchema.optional(),
  })
  .strict();
export const updateSchema = z
  .object({
    title: z.string().trim().min(1).max(240).optional(),
    content: contentSchema.optional(),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict()
  .refine(
    (value) => value.title !== undefined || value.content !== undefined,
    "No changes provided",
  );
export const emptyContent: DocNode = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
export type DocumentSummary = {
  id: string;
  title: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export type NoteDocument = DocumentSummary & { content: DocNode };

export function orderedEvents(
  events: TimelineEvent[],
  mode: TimelineAttrs["sortMode"],
) {
  if (mode === "manual") return events;
  const timestamp = (date: string | null) => {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Infinity;
    const time = Date.parse(date);
    return Number.isFinite(time) &&
      new Date(time).toISOString().slice(0, 10) === date
      ? time
      : Infinity;
  };
  return [...events].sort((a, b) => {
    const first = timestamp(a.date),
      second = timestamp(b.date);
    return first === second ? 0 : first - second;
  });
}
