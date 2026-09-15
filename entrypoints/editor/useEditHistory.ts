import { useState } from 'react';
import type { EditState } from '../../lib/editor-model';

const LIMIT = 40;

/**
 * Undo/redo over the edit state owned by the parent. The section is keyed by
 * image id, so remounting on a different image starts a fresh history.
 */
export function useEditHistory(edit: EditState, onChange: (edit: EditState) => void) {
  const [past, setPast] = useState<EditState[]>([]);
  const [future, setFuture] = useState<EditState[]>([]);
  function change(patch: Partial<EditState>) {
    setPast((items) => [...items.slice(-(LIMIT - 1)), edit]); setFuture([]); onChange({ ...edit, ...patch });
  }
  function undo() {
    const previous = past.at(-1); if (!previous) return;
    setFuture((items) => [edit, ...items]); setPast((items) => items.slice(0, -1)); onChange(previous);
  }
  function redo() {
    const next = future[0]; if (!next) return;
    setPast((items) => [...items, edit]); setFuture((items) => items.slice(1)); onChange(next);
  }
  return { change, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 };
}
