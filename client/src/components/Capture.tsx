import { useLayoutEffect, useRef, useState, type Ref } from "react";

interface Props {
  ref: Ref<HTMLTextAreaElement>;
  onAdd(text: string): void;
}

export function Capture({ ref, onAdd }: Props) {
  const [text, setText] = useState("");
  const local = useRef<HTMLTextAreaElement | null>(null);

  // grow with the content
  useLayoutEffect(() => {
    const el = local.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    onAdd(value);
    setText("");
  };

  return (
    <form
      id="add"
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor="text" className="label">
        JUNK DRAWER
      </label>
      <textarea
        id="text"
        ref={(el) => {
          local.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) ref.current = el;
        }}
        rows={1}
        placeholder="throw it in…"
        enterKeyHint="send"
        autoFocus
        spellCheck
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter saves (also the iPhone keyboard's send key); Shift+Enter adds a line.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <p className="hint">enter = save · shift+enter = new line · "t:" forces todo · "n:" forces note</p>
    </form>
  );
}
