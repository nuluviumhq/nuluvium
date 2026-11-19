"use client";

// A select in the app's style (the native list is an unstyled OS menu). Pattern: a button that
// opens a listbox (WAI-ARIA "select-only combobox"). Keyboard: Enter, Space or the arrows open it;
// arrows, Home and End move; Enter or Space picks; Escape or Tab closes; typing jumps to a match.
// Closes on a click outside. The list sits under the button, right-aligned, inside the screen.

import { useCallback, useEffect, useId, useRef, useState } from "react";

export interface ChoiceOption<T extends string | number> {
  value: T;
  label: string;
  /** Small mono note after the label (optional). */
  hint?: string;
}

interface ChoiceProps<T extends string | number> {
  value: T;
  options: ChoiceOption<T>[];
  onChange: (value: T) => void;
  /** Id of the element that names this control (the row label). */
  labelledBy: string;
}

export function Choice<T extends string | number>({ value, options, onChange, labelledBy }: ChoiceProps<T>) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement | null>(null);
  const button = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLUListElement | null>(null);
  const typed = useRef({ text: "", at: 0 });
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const current = options[selectedIndex];

  const show = useCallback((index: number) => {
    setActive(index);
    setOpen(true);
  }, []);
  const close = useCallback((focusButton: boolean) => {
    setOpen(false);
    if (focusButton) button.current?.focus();
  }, []);
  const pick = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    close(true);
  };

  // Focus the list when it opens, so the keys below reach it; close on a click outside.
  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  // Keep the active option in view when the list scrolls.
  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);

  /** Type-ahead: letters typed within a second form a prefix to jump to. */
  const typeAhead = (key: string) => {
    const now = Date.now();
    typed.current = { text: (now - typed.current.at < 1000 ? typed.current.text : "") + key.toLowerCase(), at: now };
    const match = options.findIndex((option) => option.label.toLowerCase().startsWith(typed.current.text));
    return match;
  };

  const onButtonKey = (event: React.KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      show(event.key === "ArrowUp" ? Math.max(0, selectedIndex - 1) : selectedIndex);
    } else if (event.key.length === 1) {
      const match = typeAhead(event.key);
      if (match >= 0) onChange(options[match]!.value);
    }
  };

  const onListKey = (event: React.KeyboardEvent) => {
    const last = options.length - 1;
    const moves: Record<string, number> = { ArrowDown: Math.min(last, active + 1), ArrowUp: Math.max(0, active - 1), Home: 0, End: last };
    if (event.key in moves) {
      event.preventDefault();
      setActive(moves[event.key]!);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick(active);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      setOpen(false);
    } else if (event.key.length === 1) {
      const match = typeAhead(event.key);
      if (match >= 0) setActive(match);
    }
  };

  return (
    <div className="choice" ref={root}>
      <button
        ref={button}
        type="button"
        className="choice-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-labelledby={`${labelledBy} ${id}-value`}
        onClick={() => (open ? close(false) : show(selectedIndex))}
        onKeyDown={onButtonKey}
      >
        <span id={`${id}-value`}>{current?.label}</span>
        <span className="choice-chevron" aria-hidden="true"></span>
      </button>
      {open ? (
        <ul
          ref={list}
          id={`${id}-list`}
          className="choice-list"
          role="listbox"
          tabIndex={-1}
          aria-labelledby={labelledBy}
          aria-activedescendant={`${id}-${active}`}
          onKeyDown={onListKey}
        >
          {options.map((option, index) => (
            <li
              key={String(option.value)}
              id={`${id}-${index}`}
              role="option"
              aria-selected={index === selectedIndex}
              className={index === active ? "active" : undefined}
              onPointerEnter={() => setActive(index)}
              onClick={() => pick(index)}
            >
              <span>{option.label}</span>
              {option.hint ? <small>{option.hint}</small> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
