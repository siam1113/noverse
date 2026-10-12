import { newEvent, newStep } from "@/components/editor/registry";
import type { DocNode } from "./schema";
export function welcomeContent(): DocNode {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Some thoughts need more than a paragraph. Give your milestones, ideas, and next steps a place on the page.",
          },
        ],
      },
      {
        type: "timeline",
        attrs: {
          schemaVersion: 1,
          subtitle: "From the first spark to something real",
          sortMode: "manual",
          events: [
            {
              ...newEvent(),
              date: "The beginning",
              title: "Find the thread",
              description:
                "A question, a conversation, a thought you keep coming back to. Start there.",
              status: "done",
            },
            {
              ...newEvent(),
              date: "Right now",
              title: "Make a little room",
              description:
                "Edit this milestone. Add a date, change its status, or put the story in your own words.",
              status: "in-progress",
            },
            {
              ...newEvent(),
              date: "What’s next",
              title: "See where it goes",
              description:
                "Add another milestone when you’re ready. There’s no need to have it all figured out.",
              status: "planned",
            },
          ],
        },
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "A useful thing to remember",
            marks: [{ type: "bold" }],
          },
        ],
      },
      {
        type: "callout",
        attrs: {
          schemaVersion: 1,
          kind: "idea",
          title: "Start with a slash",
          body: "Type / on any text line to add a timeline, a callout, a process, or a list. Everything on this page is yours to edit.",
        },
      },
      { type: "paragraph" },
    ],
  };
}
export function processContent(): DocNode {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "What are we working toward? Write the outcome here.",
          },
        ],
      },
      {
        type: "steps",
        attrs: {
          schemaVersion: 1,
          title: "The way forward",
          steps: [
            {
              ...newStep(),
              title: "Define the outcome",
              description: "What would a good result look like?",
            },
            {
              ...newStep(),
              title: "Take the first step",
              description: "Choose one small action to get moving.",
            },
            {
              ...newStep(),
              title: "Reflect and adjust",
              description: "What did you learn, and what comes next?",
            },
          ],
        },
      },
      { type: "paragraph" },
    ],
  };
}
