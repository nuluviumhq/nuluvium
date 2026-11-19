"use client";

// A confirmation dialog in the login modal's style (same classes, no new styles): a title, what
// will happen, and the action. Escape, the Close button or a click outside closes it.
// Rendered into <body> through a portal: inside the app's boxes a fixed overlay would be clipped.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface DialogProps {
  /** Shown while true; the open transition runs a moment after. */
  open: boolean;
  title: string;
  lead: string;
  onClose: () => void;
  children?: React.ReactNode;
}

export function Dialog({ open, title, lead, onClose, children }: DialogProps) {
  const [shown, setShown] = useState(false);
  const card = useRef<HTMLDivElement | null>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      setShown(false);
      lastFocus.current?.focus?.();
      return;
    }
    lastFocus.current = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => {
      setShown(true);
      card.current?.querySelector<HTMLElement>("button:not(.modal-close)")?.focus();
    }, 20);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: a click on the backdrop is a mouse shortcut; keyboards close with Escape (above) or the Close button
    <div className={shown ? "modal open" : "modal"} onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-card" ref={card} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <button className="modal-close mono" type="button" onClick={onClose}>Close</button>
        <span className="wordmark">Nuluvium</span>
        <h2 className="title" id="dialog-title">{title}</h2>
        <p className="modal-lead">{lead}</p>
        {children}
      </div>
    </div>,
    document.body,
  );
}
