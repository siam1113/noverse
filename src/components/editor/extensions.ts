import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { TimelineView, CalloutView, StepsView } from "./block-views";
import { blockRegistry } from "./registry";

// Custom components serialize only structured attributes into the canonical document.
function componentNode(
  name: string,
  view: Parameters<typeof ReactNodeViewRenderer>[0],
) {
  const defaults = blockRegistry
    .find((block) => block.type === name)!
    .create().attrs!;
  return Node.create({
    name,
    group: "block",
    atom: true,
    selectable: true,
    isolating: true,
    addAttributes() {
      return Object.fromEntries(
        Object.entries(defaults).map(([key, value]) => [
          key,
          { default: Array.isArray(value) ? [] : value, rendered: false },
        ]),
      );
    },
    parseHTML() {
      return [];
    },
    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, { "data-block": name }),
        name,
      ];
    },
    addNodeView() {
      return ReactNodeViewRenderer(view);
    },
  });
}
export const customExtensions = [
  componentNode("timeline", TimelineView),
  componentNode("callout", CalloutView),
  componentNode("steps", StepsView),
];
