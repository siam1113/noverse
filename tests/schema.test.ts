import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  contentSchema,
  emptyContent,
  orderedEvents,
  timelineSchema,
  updateSchema,
  type DocNode,
  type TimelineEvent,
} from "../src/lib/schema";
const event = (date: string | null = null): TimelineEvent => ({
  id: randomUUID(),
  date,
  title: "A milestone",
  description: "Some detail",
  status: "planned",
});
const timeline = () => ({
  type: "timeline",
  attrs: {
    schemaVersion: 1,
    subtitle: "The journey",
    sortMode: "manual",
    events: [event("2026-10-12"), event()],
  },
});
test("structured timeline and surrounding rich text survive JSON round trip", () => {
  const document: DocNode = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Before", marks: [{ type: "bold" }] }],
      },
      timeline(),
      { type: "paragraph", content: [{ type: "text", text: "After" }] },
    ],
  };
  assert.deepEqual(
    contentSchema.parse(JSON.parse(JSON.stringify(document))),
    document,
  );
});
test("empty document, callout, steps, headings and lists are accepted", () => {
  assert.equal(contentSchema.safeParse(emptyContent).success, true);
  const doc: DocNode = {
    type: "doc",
    content: [
      {
        type: "callout",
        attrs: {
          schemaVersion: 1,
          kind: "warning",
          title: "Wait",
          body: "Some detail",
        },
      },
      {
        type: "steps",
        attrs: {
          schemaVersion: 1,
          title: "Process",
          steps: [
            { id: randomUUID(), title: "Begin", description: "Start here" },
          ],
        },
      },
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Next" }],
      },
      {
        type: "orderedList",
        attrs: { start: 1, type: null },
        content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
      },
      {
        type: "taskList",
        content: [
          {
            type: "taskItem",
            attrs: { checked: false },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ],
  };
  assert.equal(contentSchema.safeParse(doc).success, true);
});
test("unknown nodes, invalid hierarchy, unexpected attrs, and unsafe links are rejected", () => {
  for (const node of [
    { type: "script" },
    { type: "paragraph", attrs: { onclick: "evil()" } },
    { type: "heading", attrs: { level: 7 } },
    { type: "text", text: "Not a block" },
    { type: "paragraph", content: [timeline()] },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Link",
          marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
        },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [{ type: "heading", attrs: { level: 1 } }],
        },
      ],
    },
  ])
    assert.equal(
      contentSchema.safeParse({ type: "doc", content: [node] }).success,
      false,
    );
});
test("event IDs, versions, counts, and string lengths are constrained", () => {
  const attrs = timeline().attrs;
  assert.equal(
    timelineSchema.safeParse({
      ...attrs,
      events: [attrs.events[0], attrs.events[0]],
    }).success,
    false,
  );
  assert.equal(
    timelineSchema.safeParse({ ...attrs, schemaVersion: 2 }).success,
    false,
  );
  assert.equal(
    timelineSchema.safeParse({
      ...attrs,
      events: Array.from({ length: 101 }, () => event()),
    }).success,
    false,
  );
  assert.equal(
    timelineSchema.safeParse({
      ...attrs,
      events: [{ ...event(), title: "x".repeat(241) }],
    }).success,
    false,
  );
});
test("pathological recursive trees fail safely before recursive validation", () => {
  let node: DocNode = { type: "paragraph" };
  for (let i = 0; i < 1000; i++) node = { type: "blockquote", content: [node] };
  assert.equal(
    contentSchema.safeParse({ type: "doc", content: [node] }).success,
    false,
  );
});
test("chronological display is stable and never mutates manual order", () => {
  const events = [
    event("Next week"),
    event("2026-11-02"),
    event(null),
    event("2026-10-01"),
  ];
  assert.deepEqual(
    orderedEvents(events, "chronological").map((item) => item.id),
    [events[3].id, events[1].id, events[0].id, events[2].id],
  );
  assert.equal(orderedEvents(events, "manual"), events);
});
test("updates require a revision and at least one valid change", () => {
  assert.equal(updateSchema.safeParse({ title: "Page" }).success, false);
  assert.equal(updateSchema.safeParse({ expectedRevision: 1 }).success, false);
  assert.equal(
    updateSchema.safeParse({ expectedRevision: 1, title: "Page" }).success,
    true,
  );
});
