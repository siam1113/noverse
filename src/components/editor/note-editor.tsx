"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Code,
  Link2,
  Undo2,
  Redo2,
  Plus,
  ChevronDown,
} from "lucide-react";
import { customExtensions } from "./extensions";
import {
  blockRegistry,
  filterBlocks,
  insertBlock,
  type BlockDefinition,
} from "./registry";
import type { DocNode } from "@/lib/schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

type SlashState = {
  from: number;
  to: number;
  query: string;
  left: number;
  top: number;
  above: boolean;
};
export function NoteEditor({
  content,
  onChange,
  onBlur,
}: {
  content: DocNode;
  onChange: (content: DocNode) => void;
  onBlur: () => void;
}) {
  const [slash, setSlash] = useState<SlashState | null>(null);
  const [index, setIndex] = useState(0);
  const [insertOpen, setInsertOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [linkError, setLinkError] = useState("");
  const [, renderToolbar] = useState(0);
  const slashRef = useRef<SlashState | null>(null);
  const indexRef = useRef(0);
  const dismissed = useRef("");
  const callbacks = useRef({ onChange, onBlur });
  callbacks.current = { onChange, onBlur };
  const choose = useRef<(definition: BlockDefinition) => void>(() => {});
  function close() {
    slashRef.current = null;
    setSlash(null);
  }
  function updateMenu(editor: Editor) {
    if (!editor.view.hasFocus()) {
      close();
      return;
    }
    const { selection } = editor.state;
    const parent = selection.$from.parent;
    if (
      !selection.empty ||
      !["paragraph", "heading"].includes(parent.type.name)
    ) {
      close();
      return;
    }
    const text = parent.textBetween(
      0,
      selection.$from.parentOffset,
      undefined,
      "\ufffc",
    );
    const match = /(?:^|\s)\/([a-zA-Z0-9-]*)$/.exec(text);
    if (!match) {
      dismissed.current = "";
      close();
      return;
    }
    const query = match[1];
    const from = selection.from - query.length - 1;
    if (dismissed.current === `${from}:${query}`) {
      close();
      return;
    }
    const coords = editor.view.coordsAtPos(selection.from);
    const above = coords.bottom + 350 > window.innerHeight;
    const next = {
      from,
      to: selection.from,
      query,
      left: Math.max(12, Math.min(coords.left, window.innerWidth - 324)),
      top: above ? Math.max(16, coords.top - 8) : coords.bottom + 8,
      above,
    };
    if (slashRef.current?.query !== query) {
      setIndex(0);
      indexRef.current = 0;
    }
    slashRef.current = next;
    setSlash(next);
  }
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, protocols: ["http", "https", "mailto"] },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: "Write something, or type / for a block…",
      }),
      ...customExtensions,
    ],
    content,
    editorProps: {
      attributes: {
        class: "note-prose",
        "aria-label": "Document content",
        role: "textbox",
        "aria-multiline": "true",
      },
      handleKeyDown: (_view, event) => {
        const current = slashRef.current;
        if (!current) return false;
        const matches = filterBlocks(current.query);
        if (event.key === "Escape") {
          dismissed.current = `${current.from}:${current.query}`;
          close();
          return true;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          if (matches.length) {
            indexRef.current =
              (indexRef.current +
                (event.key === "ArrowDown" ? 1 : -1) +
                matches.length) %
              matches.length;
            setIndex(indexRef.current);
          }
          return true;
        }
        if (event.key === "Enter" && matches.length) {
          choose.current(matches[indexRef.current] ?? matches[0]);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      callbacks.current.onChange(editor.getJSON() as DocNode);
      updateMenu(editor);
    },
    onSelectionUpdate: ({ editor }) => updateMenu(editor),
    onTransaction: () => renderToolbar((value) => value + 1),
    onBlur: () => {
      close();
      callbacks.current.onBlur();
    },
  });
  choose.current = (definition) => {
    if (!editor) return;
    const range = slashRef.current;
    close();
    setInsertOpen(false);
    insertBlock(editor, definition, range ?? undefined);
  };
  useEffect(() => {
    const hide = (event: Event) => {
      if (
        event.type === "scroll" &&
        event.target instanceof Element &&
        event.target.closest("#slash-block-menu")
      )
        return;
      slashRef.current = null;
      setSlash(null);
    };
    window.addEventListener("resize", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.removeEventListener("resize", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);
  useEffect(() => {
    if (slash) {
      const menu = document.getElementById("slash-block-menu");
      const option = document.getElementById(`slash-option-${index}`);
      if (menu && option) {
        if (option.offsetTop < menu.scrollTop)
          menu.scrollTop = option.offsetTop;
        else if (
          option.offsetTop + option.offsetHeight >
          menu.scrollTop + menu.clientHeight
        )
          menu.scrollTop =
            option.offsetTop + option.offsetHeight - menu.clientHeight;
      }
    }
    if (!editor) return;
    const dom = editor.view.dom;
    if (slash) {
      dom.setAttribute("aria-controls", "slash-block-menu");
      dom.setAttribute("aria-activedescendant", `slash-option-${index}`);
    } else {
      dom.removeAttribute("aria-controls");
      dom.removeAttribute("aria-activedescendant");
    }
  }, [index, slash, editor]);
  const applyLink = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const value = url.trim();
      if (value && !/^(https?:\/\/|mailto:)/i.test(value)) {
        setLinkError("Start your link with https://, http://, or mailto:");
        return;
      }
      if (value)
        editor
          ?.chain()
          .focus()
          .extendMarkRange("link")
          .setLink({ href: value })
          .run();
      else editor?.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkOpen(false);
    },
    [editor, url],
  );
  if (!editor) return <div className="editor-loading">Opening your page…</div>;
  const matches = slash ? filterBlocks(slash.query) : blockRegistry;
  return (
    <>
      <div
        className="editor-toolbar"
        role="toolbar"
        aria-label="Text formatting"
        onMouseDown={(event) => {
          if ((event.target as HTMLElement).closest("button"))
            event.preventDefault();
        }}
      >
        <select
          aria-label="Text style"
          value={
            editor.isActive("heading", { level: 1 })
              ? "h1"
              : editor.isActive("heading", { level: 2 })
                ? "h2"
                : editor.isActive("heading", { level: 3 })
                  ? "h3"
                  : "text"
          }
          onChange={(event) => {
            const value = event.target.value;
            if (value === "text") editor.chain().focus().setParagraph().run();
            else
              editor
                .chain()
                .focus()
                .setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 })
                .run();
          }}
        >
          <option value="text">Text</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
        <span className="toolbar-divider" />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Bold"
          aria-pressed={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Italic"
          aria-pressed={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Inline code"
          aria-pressed={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code size={17} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Edit link"
          aria-pressed={editor.isActive("link")}
          onClick={() => {
            setUrl(editor.getAttributes("link").href ?? "");
            setLinkError("");
            setLinkOpen(true);
          }}
        >
          <Link2 size={16} />
        </Button>
        <span className="toolbar-divider" />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Undo"
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 size={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Redo"
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 size={16} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="insert-button"
          aria-label="Insert block"
          onClick={() => setInsertOpen(true)}
        >
          <Plus size={15} />
          <span>Insert</span>
          <ChevronDown size={13} />
        </Button>
      </div>
      <EditorContent editor={editor} />
      {slash && (
        <div
          id="slash-block-menu"
          className="slash-menu"
          style={{
            left: slash.left,
            top: slash.top,
            transform: slash.above ? "translateY(-100%)" : undefined,
          }}
          role="listbox"
          aria-label="Insert a block"
          aria-activedescendant={`slash-option-${index}`}
        >
          <div className="slash-label">
            Add to your page <kbd>esc</kbd>
          </div>
          {matches.length ? (
            matches.map((block, i) => (
              <button
                type="button"
                id={`slash-option-${i}`}
                key={block.type}
                className={`slash-option ${i === index ? "active" : ""}`}
                role="option"
                aria-selected={i === index}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose.current(block)}
                onMouseMove={() => {
                  indexRef.current = i;
                  setIndex(i);
                }}
              >
                <span className="slash-icon">
                  <block.icon size={19} />
                </span>
                <span>
                  <strong>{block.label}</strong>
                  <small>{block.description}</small>
                </span>
                {i === index && <kbd>↵</kbd>}
              </button>
            ))
          ) : (
            <p className="slash-empty">No blocks found. Try “timeline”.</p>
          )}
        </div>
      )}
      <Dialog open={insertOpen} onOpenChange={setInsertOpen}>
        <DialogContent>
          <DialogTitle>Add a block</DialogTitle>
          <DialogDescription>
            Give your ideas a little structure.
          </DialogDescription>
          <div className="insert-grid">
            {blockRegistry.map((block) => (
              <button
                className="slash-option"
                key={block.type}
                onClick={() => choose.current(block)}
              >
                <span className="slash-icon">
                  <block.icon size={19} />
                </span>
                <span>
                  <strong>{block.label}</strong>
                  <small>{block.description}</small>
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogTitle>Edit link</DialogTitle>
          <DialogDescription>
            Link the selected text. Leave empty to remove a link.
          </DialogDescription>
          <form onSubmit={applyLink}>
            <label className="field-label" htmlFor="link-url">
              URL
            </label>
            <input
              className="form-input"
              id="link-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com"
            />
            {linkError && <p className="danger-text">{linkError}</p>}
            <div className="dialog-actions">
              <Button type="submit">Apply link</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
