import { useEffect, useRef, useState } from 'react';
import { textAnnotationAt } from '../../lib/editor/geometry';
import type { Annotation, EditState } from '../../lib/editor/model';

interface TextDraft {
  x: number;
  y: number;
  seed: string;
  index: number | null;
  color: string;
  size: number;
  opacity: number;
}
interface Options {
  edit: EditState;
  change: (patch: Partial<EditState>) => void;
  setDraftAnnotation: (draft: { index: number; annotation: Annotation } | null) => void;
}

/**
 * The note being typed on the canvas. The text itself lives in the DOM node:
 * a controlled contenteditable fights the caret on every keystroke.
 */
export function useTextDraft({ edit, change, setDraftAnnotation }: Options) {
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const textDraftRef = useRef<HTMLDivElement>(null);
  const discarding = useRef(false);

  useEffect(() => {
    const el = textDraftRef.current;
    if (!textDraft || !el) return;
    el.innerText = textDraft.seed;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [textDraft]);

  function discardTextDraft() {
    // Escape unmounts the editor, and the blur that follows must not read as a commit.
    discarding.current = true;
    setDraftAnnotation(null);
    setTextDraft(null);
  }

  function commitTextDraft() {
    if (discarding.current) {
      discarding.current = false;
      return;
    }
    if (!textDraft) return;
    const value = (textDraftRef.current?.innerText ?? '').replace(/\s+$/, '');
    const editing = textDraft.index;
    setTextDraft(null);
    setDraftAnnotation(null);
    if (editing !== null) {
      // Rewriting an existing note: empty text deletes it.
      change({
        annotations: value.trim()
          ? edit.annotations.map((item, index) => (index === editing ? { ...item, text: value } : item))
          : edit.annotations.filter((_, index) => index !== editing),
      });
      return;
    }
    if (!value.trim()) return;
    change({
      annotations: [
        ...edit.annotations,
        {
          kind: 'text',
          x: textDraft.x,
          y: textDraft.y,
          endX: textDraft.x,
          endY: textDraft.y,
          color: textDraft.color,
          size: textDraft.size,
          opacity: textDraft.opacity,
          text: value,
        },
      ],
    });
  }

  /** Opens the note under the pointer for editing, or a new one at that point. */
  function openTextDraft(at: { x: number; y: number }, style: { color: string; size: number; opacity: number }) {
    const hit = textAnnotationAt(edit.annotations, at);
    commitTextDraft();
    discarding.current = false;
    if (hit === null) {
      setTextDraft({ ...at, seed: '', index: null, ...style });
      return;
    }
    const item = edit.annotations[hit]!;
    // Hide the original while its replacement is typed in the same spot.
    setDraftAnnotation({ index: hit, annotation: { ...item, text: '' } });
    setTextDraft({
      x: item.x,
      y: item.y,
      seed: item.text,
      index: hit,
      color: item.color,
      size: item.size,
      opacity: item.opacity ?? 1,
    });
  }

  return { textDraft, textDraftRef, openTextDraft, commitTextDraft, discardTextDraft };
}
