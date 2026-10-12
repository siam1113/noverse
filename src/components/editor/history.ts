import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";

// Treat a structural button press as its own undo step, even when it follows typing.
export function structuralChange(editor: Editor, action: () => void) {
  editor.view.dispatch(closeHistory(editor.state.tr));
  action();
  editor.view.dispatch(closeHistory(editor.state.tr));
}
