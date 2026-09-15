import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import { decodeImageFile } from '../../lib/decode';
import { renderEdit, transformFrame, encodeEdit, drawAnnotations } from '../../lib/editor/render';
import { copyFrame } from '../../lib/clipboard';
import { downloadEncoded } from '../../lib/download';
import { OUTPUT_FORMATS, formatInfo } from '../../lib/formats';
import { basenameWithoutExtension, clamp, safeFilenamePart } from '../../lib/utils';
import {
  annotationBounds,
  cropFromAnchor,
  moveAnnotation,
  resizeAnnotation,
  resizeCropFromCorner,
} from '../../lib/editor/geometry';
import { useEditHistory } from './useEditHistory';
import { useTextDraft } from './useTextDraft';
import type { Annotation, EditState, EditorEntry } from '../../lib/editor/model';
import type { ImageFrame, OutputFormat } from '../../lib/types';
import type { CropRect } from '../../lib/crop';

interface Props {
  entry: EditorEntry;
  onChange: (edit: EditState) => void;
  disabled: boolean;
}
type Tool = 'none' | 'crop' | Annotation['kind'];
function FrameCanvas({ frame, label, style }: { frame: ImageFrame | null; label: string; style?: CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (frame && ref.current) {
      ref.current.width = frame.width;
      ref.current.height = frame.height;
      ref.current.getContext('2d')!.putImageData(new ImageData(frame.data, frame.width, frame.height), 0, 0);
    }
  }, [frame]);
  return <canvas ref={ref} aria-label={label} className="image-canvas" style={style} />;
}
/** Slider paired with a typable number; the wheel nudges it without scrolling the sidebar. */
function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (next: number) => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    // React registers wheel passively on the root, so holding the page still needs a native listener.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const amount = (event.deltaY > 0 ? -1 : 1) * step * (event.shiftKey ? 10 : 1);
      onChange(clamp(Math.round((value + amount) / step) * step, min, max));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });
  return (
    <label className="field">
      {label}
      <div className="slider-row" ref={row}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <input
          className="slider-number"
          type="number"
          min={min}
          max={max}
          step={step}
          value={draft}
          aria-label={label}
          onChange={(event) => {
            setDraft(event.target.value);
            const next = Number(event.target.value);
            // Out-of-range or half-typed values wait for blur instead of snapping.
            if (event.target.value !== '' && Number.isFinite(next) && next >= min && next <= max) onChange(next);
          }}
          onBlur={() => {
            const next = Number(draft);
            onChange(clamp(draft !== '' && Number.isFinite(next) ? next : value, min, max));
          }}
        />
        {suffix && (
          <span className="slider-suffix" aria-hidden="true">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}
export default function ImageEditorSection({ entry, onChange, disabled }: Props) {
  const { file, edit } = entry;
  const [source, setSource] = useState<ImageFrame | null>(null);
  const [output, setOutput] = useState<ImageFrame | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [ratio, setRatio] = useState(0);
  const [tool, setTool] = useState<Tool>('none');
  const [color, setColor] = useState('#e53935');
  const [size, setSize] = useState(0.05);
  const [density, setDensity] = useState(1);
  const [stageWidth, setStageWidth] = useState(0);
  const [justCommitted, setJustCommitted] = useState<Annotation | null>(null);
  const [ocrLanguage, setOcrLanguage] = useState('spa+eng');
  const [ocrText, setOcrText] = useState('');
  const [draftCrop, setDraftCrop] = useState<CropRect | null>(null);
  const [draftPlacement, setDraftPlacement] = useState<{ offsetX: number; offsetY: number } | null>(null);
  const [draftAnnotation, setDraftAnnotation] = useState<{ index: number; annotation: Annotation } | null>(null);
  const [selectedAnnotation, setSelectedAnnotation] = useState<number | null>(null);
  const [annotation, setAnnotation] = useState<Annotation | null>(null);
  const { change, undo, redo, canUndo, canRedo } = useEditHistory(edit, onChange);
  const { textDraft, textDraftRef, openTextDraft, commitTextDraft, discardTextDraft } = useTextDraft({
    edit,
    change,
    setDraftAnnotation,
  });
  const gesture = useRef<{
    x: number;
    y: number;
    crop: CropRect;
    mode: string;
    annotation?: Annotation;
    index?: number;
  } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const annotationCanvas = useRef<HTMLCanvasElement>(null);
  const alive = useRef(true);
  const locked = busy || disabled;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    decodeImageFile(file)
      .then((frame) => {
        if (!cancelled) setSource(frame);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [file]);
  const renderState = useMemo(() => {
    const next = draftPlacement ? { ...edit, ...draftPlacement } : { ...edit };
    if (draftAnnotation)
      next.annotations = edit.annotations.map((item, index) =>
        index === draftAnnotation.index ? draftAnnotation.annotation : item,
      );
    return next;
  }, [draftPlacement, draftAnnotation, edit]);
  const transformed = useMemo(
    () => (source ? transformFrame(source, edit) : null),
    [source, edit.rotation, edit.flipX, edit.flipY],
  );
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    const timer = setTimeout(
      () => {
        renderEdit(source, renderState)
          .then((frame) => {
            if (!cancelled) {
              setOutput(frame);
              setError('');
            }
          })
          .catch((err) => {
            if (!cancelled) setError(String(err));
          });
      },
      draftPlacement || draftAnnotation ? 0 : 120,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [source, renderState, draftPlacement, draftAnnotation]);
  useEffect(() => {
    if (selectedAnnotation !== null && selectedAnnotation >= edit.annotations.length) setSelectedAnnotation(null);
  }, [selectedAnnotation, edit.annotations.length]);
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
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setStageWidth(entry.contentRect.width);
    });
    observer.observe(stage);
    setStageWidth(stage.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, [output, transformed]);
  useEffect(() => {
    if (!output || !annotationCanvas.current) return;
    const canvas = annotationCanvas.current;
    canvas.width = output.width;
    canvas.height = output.height;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pending = [justCommitted, annotation].filter((item): item is Annotation => !!item);
    if (pending.length) drawAnnotations(ctx, pending, output.width, output.height);
  }, [annotation, justCommitted, output]);
  useLayoutEffect(() => {
    setJustCommitted(null);
  }, [output]);
  const fullCrop = transformed
    ? { x: 0, y: 0, width: transformed.width, height: transformed.height }
    : { x: 0, y: 0, width: 1, height: 1 };
  const crop = draftCrop ?? edit.crop ?? fullCrop;
  const cropWorkspace = useMemo(() => {
    // The frame may reach outside the image, so crop mode works on a larger area.
    // Built from the committed crop, not the draft, so the view holds still mid-drag.
    const rect = edit.crop ?? fullCrop;
    const marginX = fullCrop.width * 0.15,
      marginY = fullCrop.height * 0.15;
    const x = Math.min(0, rect.x) - marginX,
      y = Math.min(0, rect.y) - marginY;
    const right = Math.max(fullCrop.width, rect.x + rect.width) + marginX;
    const bottom = Math.max(fullCrop.height, rect.y + rect.height) + marginY;
    return { x, y, width: right - x, height: bottom - y };
  }, [fullCrop.width, fullCrop.height, edit.crop]);
  const info = formatInfo(edit.format);
  const exportBase = edit.crop ?? fullCrop;
  const exportWidth = Math.round(
    edit.width || (edit.height ? (edit.height * exportBase.width) / exportBase.height : exportBase.width),
  );
  const exportHeight = Math.round(
    edit.height || (edit.width ? (edit.width * exportBase.height) / exportBase.width : exportBase.height),
  );
  const canvasFrame = tool === 'crop' ? transformed : output;
  const canvasWidth = tool === 'crop' ? cropWorkspace.width : output?.width;
  const canvasHeight = tool === 'crop' ? cropWorkspace.height : output?.height;
  // drawAnnotations sizes text off the shorter output edge; scale that to the displayed stage.
  const draftFontPx =
    output && stageWidth && textDraft
      ? Math.max(4, textDraft.size * Math.min(output.width, output.height)) * (stageWidth / output.width)
      : 16;
  const selectedAnnotationItem =
    selectedAnnotation === null
      ? null
      : draftAnnotation?.index === selectedAnnotation
        ? draftAnnotation.annotation
        : (edit.annotations[selectedAnnotation] ?? null);
  const redactionColorLocked = tool === 'redact' || selectedAnnotationItem?.kind === 'redact';
  const modeTools: { value: Tool; label: string; icon: string; hint: string }[] = [
    { value: 'none', label: 'Mover', icon: '↕', hint: 'Ver el resultado y mover la imagen cuando uses posición.' },
    { value: 'crop', label: 'Recortar', icon: '✂', hint: 'Dibuja o ajusta el recorte sobre la imagen.' },
  ];
  const drawingTools: { value: Tool; label: string; icon: string; hint: string }[] = [
    { value: 'arrow', label: 'Flecha', icon: '↗', hint: 'Arrastra para señalar un área.' },
    { value: 'line', label: 'Línea', icon: '╱', hint: 'Arrastra para dibujar una línea.' },
    { value: 'rect', label: 'Rectángulo', icon: '□', hint: 'Arrastra para remarcar una zona.' },
    { value: 'ellipse', label: 'Elipse', icon: '○', hint: 'Arrastra para dibujar un círculo u óvalo.' },
    { value: 'triangle', label: 'Triángulo', icon: '△', hint: 'Arrastra para dibujar un triángulo.' },
    { value: 'diamond', label: 'Rombo', icon: '◇', hint: 'Arrastra para dibujar un rombo.' },
    { value: 'pentagon', label: 'Pentágono', icon: '⬟', hint: 'Arrastra para dibujar un pentágono.' },
    { value: 'hexagon', label: 'Hexágono', icon: '⬡', hint: 'Arrastra para dibujar un hexágono.' },
    { value: 'star', label: 'Estrella', icon: '☆', hint: 'Arrastra para dibujar una estrella.' },
    { value: 'bubble', label: 'Globo', icon: '▱', hint: 'Arrastra para dibujar un globo de texto.' },
    { value: 'redact', label: 'Ocultar', icon: '■', hint: 'Cubre información sensible.' },
    { value: 'text', label: 'Texto', icon: 'T', hint: 'Haz clic sobre la imagen y escribe la nota ahí.' },
    { value: 'number', label: 'Número', icon: '#', hint: 'Haz clic para colocar marcadores numerados.' },
  ];
  function selectTool(nextTool: Tool) {
    setTool(nextTool);
    if (nextTool === 'none' && !edit.placement) change({ placement: true });
  }
  function chooseSize(percent: number) {
    const nextSize = percent / 100;
    setSize(nextSize);
    setAnnotation((current) => (current ? { ...current, size: nextSize } : current));
    updateSelectedAnnotation({ size: nextSize });
  }
  function chooseDensity(percent: number) {
    const nextDensity = percent / 100;
    setDensity(nextDensity);
    setAnnotation((current) => (current && current.kind !== 'redact' ? { ...current, opacity: nextDensity } : current));
    updateSelectedAnnotation({ opacity: nextDensity }, (item) => item.kind !== 'redact');
  }
  function chooseColor(nextColor: string) {
    setColor(nextColor);
    setAnnotation((current) => (current && current.kind !== 'redact' ? { ...current, color: nextColor } : current));
    updateSelectedAnnotation({ color: nextColor }, (item) => item.kind !== 'redact');
  }
  function updateSelectedAnnotation(patch: Partial<Annotation>, predicate: (item: Annotation) => boolean = () => true) {
    if (selectedAnnotation === null) return;
    const current = edit.annotations[selectedAnnotation];
    if (!current || !predicate(current)) return;
    change({
      annotations: edit.annotations.map((item, index) => (index === selectedAnnotation ? { ...item, ...patch } : item)),
    });
  }
  function pointFromStage(clientX: number, clientY: number, normalized = false) {
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: clamp((clientX - bounds.left) / bounds.width, 0, 1) * (normalized ? 1 : fullCrop.width),
      y: clamp((clientY - bounds.top) / bounds.height, 0, 1) * (normalized ? 1 : fullCrop.height),
    };
  }
  function cropPoint(event: PointerEvent<HTMLElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: cropWorkspace.x + clamp((event.clientX - bounds.left) / bounds.width, 0, 1) * cropWorkspace.width,
      y: cropWorkspace.y + clamp((event.clientY - bounds.top) / bounds.height, 0, 1) * cropWorkspace.height,
    };
  }
  function point(event: PointerEvent<HTMLElement>, normalized = false) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1) * (normalized ? 1 : fullCrop.width),
      y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1) * (normalized ? 1 : fullCrop.height),
    };
  }
  function cropDown(event: PointerEvent<HTMLDivElement>) {
    if (locked || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { ...cropPoint(event), crop, mode: (event.target as HTMLElement).dataset.mode ?? 'select' };
  }
  function cropMove(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g) return;
    const p = cropPoint(event),
      dx = p.x - g.x,
      dy = p.y - g.y;
    if (g.mode === 'move') {
      setDraftCrop({
        ...g.crop,
        x: clamp(g.crop.x + dx, cropWorkspace.x, cropWorkspace.x + cropWorkspace.width - g.crop.width),
        y: clamp(g.crop.y + dy, cropWorkspace.y, cropWorkspace.y + cropWorkspace.height - g.crop.height),
      });
      return;
    }
    if (g.mode.startsWith('resize-')) {
      setDraftCrop(resizeCropFromCorner(g.crop, g.mode.replace('resize-', ''), p, dx, dy, cropWorkspace, ratio));
      return;
    }
    setDraftCrop(cropFromAnchor({ x: g.x, y: g.y }, p, cropWorkspace, ratio));
  }
  function cropUp(event: PointerEvent<HTMLDivElement>) {
    if (gesture.current && draftCrop)
      change({
        crop: {
          x: Math.round(draftCrop.x),
          y: Math.round(draftCrop.y),
          width: Math.max(1, Math.round(draftCrop.width)),
          height: Math.max(1, Math.round(draftCrop.height)),
        },
        width: 0,
        height: 0,
      });
    gesture.current = null;
    setDraftCrop(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function changeCanvas(key: 'width' | 'height', value: number) {
    const next = clamp(Math.round(value), 1, 32767);
    change({
      width: key === 'width' ? next : exportWidth,
      height: key === 'height' ? next : exportHeight,
      lockAspect: false,
      placement: true,
    });
  }
  function chooseRatio(value: number) {
    setRatio(value);
    if (!value) return;
    const width = Math.min(crop.width, crop.height * value),
      height = width / value;
    change({
      crop: { x: crop.x, y: crop.y, width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) },
      width: 0,
      height: 0,
    });
  }
  function annotateDown(event: PointerEvent<HTMLDivElement>) {
    if (locked || tool === 'none' || tool === 'crop' || !output || event.button !== 0) return;
    if (tool === 'text') {
      event.preventDefault();
      const at = point(event, true);
      // A click closes the note being written and opens the one under the pointer, or a new one.
      setSelectedAnnotation(null);
      openTextDraft(at, { color, size, opacity: density });
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedAnnotation(null);
    const p = point(event, true);
    const a: Annotation = {
      kind: tool,
      ...p,
      endX: p.x,
      endY: p.y,
      color: tool === 'redact' ? '#000000' : color,
      size,
      opacity: tool === 'redact' ? 1 : density,
      text: tool === 'number' ? String(edit.annotations.filter((item) => item.kind === 'number').length + 1) : '',
    };
    setAnnotation(a);
  }
  function annotateMove(event: PointerEvent<HTMLDivElement>) {
    if (!annotation) return;
    const p = point(event, true);
    setAnnotation({ ...annotation, endX: p.x, endY: p.y });
  }
  function annotateUp() {
    if (
      annotation &&
      (annotation.kind === 'number' ||
        Math.abs(annotation.endX - annotation.x) + Math.abs(annotation.endY - annotation.y) > 0.002)
    ) {
      change({ annotations: [...edit.annotations, annotation] });
      setSelectedAnnotation(edit.annotations.length);
      setJustCommitted(annotation);
    }
    setAnnotation(null);
  }
  function editedAnnotationAt(event: PointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (!g?.annotation || g.index === undefined || !g.mode.startsWith('annotation-')) return null;
    const p = pointFromStage(event.clientX, event.clientY, true);
    if (g.mode === 'annotation-move')
      return { index: g.index, annotation: moveAnnotation(g.annotation, p.x - g.x, p.y - g.y) };
    return { index: g.index, annotation: resizeAnnotation(g.annotation, g.mode, p, { x: g.x, y: g.y }) };
  }
  function annotationEditDown(event: PointerEvent<HTMLElement>, mode: string) {
    if (locked || selectedAnnotation === null || !selectedAnnotationItem || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = pointFromStage(event.clientX, event.clientY, true);
    gesture.current = { ...p, crop, mode, annotation: selectedAnnotationItem, index: selectedAnnotation };
    setDraftAnnotation({ index: selectedAnnotation, annotation: selectedAnnotationItem });
  }
  function annotationEditMove(event: PointerEvent<HTMLDivElement>) {
    const next = editedAnnotationAt(event);
    if (next) setDraftAnnotation(next);
  }
  function annotationEditUp(event: PointerEvent<HTMLDivElement>) {
    const next = editedAnnotationAt(event);
    if (next) {
      change({ annotations: edit.annotations.map((item, index) => (index === next.index ? next.annotation : item)) });
      setSelectedAnnotation(next.index);
    }
    setDraftAnnotation(null);
    gesture.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
    try {
      (event.target as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {}
  }
  function placementAt(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (g?.mode !== 'placement' || !output) return null;
    const p = point(event, true);
    return {
      offsetX: Math.round(edit.offsetX + (p.x - g.x) * output.width),
      offsetY: Math.round(edit.offsetY + (p.y - g.y) * output.height),
    };
  }
  function placementMove(event: PointerEvent<HTMLDivElement>) {
    const next = placementAt(event);
    if (next) setDraftPlacement(next);
  }
  function placementUp(event: PointerEvent<HTMLDivElement>) {
    if (gesture.current?.mode !== 'placement') return false;
    const next = placementAt(event) ?? draftPlacement;
    if (next) change(next);
    setDraftPlacement(null);
    gesture.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    return true;
  }
  async function run(action: () => Promise<void>) {
    if (locked) return;
    setBusy(true);
    setStatus('Procesando…');
    try {
      await action();
    } catch (err) {
      if (alive.current) setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function exportImage() {
    if (!source) return;
    const result = await encodeEdit(source, edit, setStatus);
    await downloadEncoded(
      result.encoded,
      `${safeFilenamePart(basenameWithoutExtension(file.name))}-editado.${result.encoded.extension}`,
    );
    setStatus(
      `Descarga iniciada: ${(result.encoded.bytes.length / 1024).toFixed(1)} KB · ${result.width} × ${result.height} px.`,
    );
  }
  if (!source)
    return (
      <section className="card">
        <p role="status">{error || 'Cargando imagen…'}</p>
      </section>
    );
  return (
    <section
      className="editor-section"
      onKeyDown={(event) => {
        if (locked || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName)) return;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault();
          event.shiftKey ? redo() : undo();
        }
      }}>
      <div className="section-header">
        <h2 className="section-title">{file.name}</h2>
        <span className="muted">
          {source.width} × {source.height} · {(file.size / 1024).toFixed(1)} KB
        </span>
      </div>
      <fieldset disabled={locked} className="editor-fieldset">
        <div className="editor-workbench">
          <aside className="paint-sidebar" aria-label="Herramientas de edición">
            <div className="tool-group">
              <h3>Edición</h3>
              <div className="paint-tools" role="toolbar" aria-label="Herramienta">
                {modeTools.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={tool === item.value ? 'tool-button selected' : 'tool-button'}
                    title={`${item.label}: ${item.hint}`}
                    aria-label={item.label}
                    aria-pressed={tool === item.value}
                    onClick={() => selectTool(item.value)}>
                    <span aria-hidden="true" className="tool-icon">
                      {item.icon}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {tool === 'none' && (
              <div className="tool-group active-tool-panel">
                <h3>Tamaño del lienzo</h3>
                <div className="numeric-grid">
                  <label className="field">
                    Ancho
                    <input
                      aria-label="Ancho del lienzo"
                      type="number"
                      min={1}
                      max={32767}
                      value={exportWidth}
                      onChange={(event) => changeCanvas('width', Number(event.target.value))}
                    />
                  </label>
                  <label className="field">
                    Alto
                    <input
                      aria-label="Alto del lienzo"
                      type="number"
                      min={1}
                      max={32767}
                      value={exportHeight}
                      onChange={(event) => changeCanvas('height', Number(event.target.value))}
                    />
                  </label>
                </div>
                <button
                  onClick={() =>
                    change({
                      width: exportBase.width,
                      height: exportBase.height,
                      lockAspect: false,
                      placement: true,
                      zoom: 1,
                      offsetX: 0,
                      offsetY: 0,
                    })
                  }>
                  Ajustar lienzo a la imagen
                </button>
              </div>
            )}
            {tool === 'none' && (
              <div className="tool-group active-tool-panel">
                <h3>Posición y escala</h3>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={edit.placement}
                    onChange={(event) => change({ placement: event.target.checked })}
                  />
                  Ajustar posición y escala
                </label>
                {edit.placement && (
                  <>
                    <div className="numeric-grid">
                      <label className="field">
                        X
                        <input
                          aria-label="Desplazamiento X (px)"
                          type="number"
                          value={edit.offsetX}
                          onChange={(event) => change({ offsetX: Number(event.target.value) })}
                        />
                      </label>
                      <label className="field">
                        Y
                        <input
                          aria-label="Desplazamiento Y (px)"
                          type="number"
                          value={edit.offsetY}
                          onChange={(event) => change({ offsetY: Number(event.target.value) })}
                        />
                      </label>
                    </div>
                    <SliderField
                      label="Escala"
                      value={Math.round(edit.zoom * 100)}
                      min={10}
                      max={500}
                      suffix="%"
                      onChange={(next) => change({ zoom: next / 100 })}
                    />
                    <button onClick={() => change({ offsetX: 0, offsetY: 0, zoom: 1 })}>Centrar y encajar</button>
                  </>
                )}
              </div>
            )}
            {tool === 'crop' && (
              <div className="tool-group active-tool-panel">
                <h3>Recorte</h3>
                <label className="field">
                  Proporción
                  <select value={ratio} onChange={(event) => chooseRatio(Number(event.target.value))}>
                    <option value={0}>Libre</option>
                    <option value={1}>1:1</option>
                    <option value={4 / 3}>4:3</option>
                    <option value={16 / 9}>16:9</option>
                    <option value={9 / 16}>9:16</option>
                  </select>
                </label>
                <div className="numeric-grid">
                  {(['x', 'y', 'width', 'height'] as const).map((key) => (
                    <label className="field" key={key}>
                      {{ x: 'X', y: 'Y', width: 'Ancho', height: 'Alto' }[key]}
                      <input
                        type="number"
                        min={key === 'x' || key === 'y' ? undefined : 1}
                        value={Math.round(crop[key])}
                        onChange={(event) => {
                          const next = { ...crop, [key]: Number(event.target.value) };
                          next.x = clamp(next.x, -32767, 32767);
                          next.y = clamp(next.y, -32767, 32767);
                          next.width = clamp(next.width, 1, 32767);
                          next.height = clamp(next.height, 1, 32767);
                          if (ratio && (key === 'width' || key === 'height')) {
                            next.width = key === 'height' ? next.height * ratio : next.width;
                            next.height = next.width / ratio;
                          }
                          change({ crop: next, width: 0, height: 0 });
                        }}
                      />
                    </label>
                  ))}
                </div>
                <p className="muted">
                  El marco puede salirse de la imagen: lo que quede fuera se rellena con el color de fondo.
                </p>
                <button onClick={() => change({ crop: null, width: 0, height: 0 })}>Restablecer recorte</button>
              </div>
            )}
            <div className="tool-group">
              <h3>Dibujo</h3>
              <div className="paint-tools drawing-toolbox" role="toolbar" aria-label="Herramientas de dibujo">
                {drawingTools.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={tool === item.value ? 'tool-button selected' : 'tool-button'}
                    title={`${item.label}: ${item.hint}`}
                    aria-label={item.label}
                    aria-pressed={tool === item.value}
                    onClick={() => selectTool(item.value)}>
                    <span aria-hidden="true" className="tool-icon">
                      {item.icon}
                    </span>
                  </button>
                ))}
              </div>
              <label className="field color-field">
                Color
                <input
                  type="color"
                  value={redactionColorLocked ? '#000000' : color}
                  disabled={redactionColorLocked}
                  title={redactionColorLocked ? 'Ocultar siempre usa negro sólido' : 'Color'}
                  onChange={(event) => chooseColor(event.target.value)}
                />
              </label>
              <div className="stroke-controls" aria-label="Ancho de línea y densidad">
                <label className="stroke-control" title={`Ancho de línea: ${Math.round(size * 100)}`}>
                  <span className="stroke-icon line-width-icon" aria-hidden="true">
                    ≋
                  </span>
                  <input
                    type="range"
                    aria-label="Ancho de línea"
                    min={1}
                    max={24}
                    step={1}
                    value={Math.round(size * 100)}
                    onChange={(event) => chooseSize(Number(event.target.value))}
                  />
                </label>
                <label
                  className="stroke-control"
                  title={
                    redactionColorLocked
                      ? 'Ocultar siempre usa densidad completa'
                      : `Densidad: ${Math.round(density * 100)}%`
                  }>
                  <span className="stroke-icon density-icon" aria-hidden="true">
                    ◒
                  </span>
                  <input
                    type="range"
                    aria-label="Densidad"
                    min={10}
                    max={100}
                    step={5}
                    value={redactionColorLocked ? 100 : Math.round(density * 100)}
                    disabled={redactionColorLocked}
                    onChange={(event) => chooseDensity(Number(event.target.value))}
                  />
                </label>
              </div>
              {tool === 'text' && <p className="muted">Haz clic en la imagen y escribe la nota ahí. Esc descarta.</p>}
              <button
                disabled={!edit.annotations.length}
                onClick={() => {
                  setSelectedAnnotation(null);
                  change({ annotations: [] });
                }}>
                Quitar anotaciones
              </button>
            </div>
            <div className="tool-group compact-actions">
              <button className="icon-action" aria-label="Deshacer" title="Deshacer" disabled={!canUndo} onClick={undo}>
                <span aria-hidden="true">↶</span>
              </button>
              <button className="icon-action" aria-label="Rehacer" title="Rehacer" disabled={!canRedo} onClick={redo}>
                <span aria-hidden="true">↷</span>
              </button>
            </div>
          </aside>
          <div className="canvas-panel">
            <div className="canvas-heading">
              <h3>{tool === 'crop' ? 'Recortar imagen' : 'Resultado editado'}</h3>
              {output && (
                <span className="muted">
                  {output.width} × {output.height} px
                </span>
              )}
            </div>
            {canvasFrame && canvasWidth && canvasHeight ? (
              <div
                ref={stageRef}
                className="interactive-image unified-canvas"
                style={{
                  aspectRatio: `${canvasWidth}/${canvasHeight}`,
                  cursor:
                    tool === 'crop' ? 'crosshair' : tool === 'none' ? 'move' : tool === 'text' ? 'text' : 'crosshair',
                }}
                onPointerDown={(event) => {
                  if (tool === 'crop') cropDown(event);
                  else if (tool === 'none' && edit.placement && !locked && output && event.button === 0) {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    gesture.current = { ...point(event, true), crop, mode: 'placement' };
                  } else annotateDown(event);
                }}
                onPointerMove={(event) => {
                  if (tool === 'crop') cropMove(event);
                  else if (gesture.current?.mode === 'placement') placementMove(event);
                  else annotateMove(event);
                }}
                onPointerUp={(event) => {
                  if (tool === 'crop') cropUp(event);
                  else if (!placementUp(event)) annotateUp();
                }}
                onPointerCancel={() => {
                  setAnnotation(null);
                  gesture.current = null;
                  setDraftCrop(null);
                  setDraftPlacement(null);
                }}>
                <FrameCanvas
                  frame={canvasFrame}
                  label={tool === 'crop' ? 'Imagen para recortar' : 'Resultado editado'}
                  style={
                    tool === 'crop'
                      ? {
                          left: `${(-cropWorkspace.x / cropWorkspace.width) * 100}%`,
                          top: `${(-cropWorkspace.y / cropWorkspace.height) * 100}%`,
                          width: `${(fullCrop.width / cropWorkspace.width) * 100}%`,
                          height: `${(fullCrop.height / cropWorkspace.height) * 100}%`,
                        }
                      : undefined
                  }
                />
                {tool === 'crop' && (
                  <div
                    className="crop-box"
                    data-mode="move"
                    style={{
                      left: `${((crop.x - cropWorkspace.x) / cropWorkspace.width) * 100}%`,
                      top: `${((crop.y - cropWorkspace.y) / cropWorkspace.height) * 100}%`,
                      width: `${(crop.width / cropWorkspace.width) * 100}%`,
                      height: `${(crop.height / cropWorkspace.height) * 100}%`,
                    }}>
                    {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                      <span
                        key={corner}
                        className={`crop-handle crop-handle-${corner}`}
                        data-mode={`resize-${corner}`}
                      />
                    ))}
                  </div>
                )}
                {tool !== 'crop' && <canvas className="annotation-overlay" ref={annotationCanvas} />}
                {textDraft && output && (
                  <div
                    className="text-draft"
                    key={`${textDraft.x},${textDraft.y}`}
                    ref={textDraftRef}
                    contentEditable
                    suppressContentEditableWarning
                    role="textbox"
                    aria-label="Nota sobre la imagen"
                    spellCheck={false}
                    style={{
                      left: `${textDraft.x * 100}%`,
                      top: `${textDraft.y * 100}%`,
                      maxWidth: `${(1 - textDraft.x) * 100}%`,
                      color: textDraft.color,
                      fontSize: `${draftFontPx}px`,
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onBlur={commitTextDraft}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        discardTextDraft();
                      } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                        event.preventDefault();
                        commitTextDraft();
                      }
                    }}
                  />
                )}
                {tool !== 'crop' &&
                  selectedAnnotationItem &&
                  (() => {
                    const bounds = annotationBounds(selectedAnnotationItem);
                    return (
                      <div
                        className="annotation-selection"
                        style={{
                          left: `${bounds.left * 100}%`,
                          top: `${bounds.top * 100}%`,
                          width: `${bounds.width * 100}%`,
                          height: `${bounds.height * 100}%`,
                        }}
                        onPointerDown={(event) => annotationEditDown(event, 'annotation-move')}
                        onPointerMove={annotationEditMove}
                        onPointerUp={annotationEditUp}
                        onPointerCancel={(event) => {
                          event.stopPropagation();
                          setDraftAnnotation(null);
                          gesture.current = null;
                        }}>
                        {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                          <span
                            key={corner}
                            className={`annotation-handle annotation-handle-${corner}`}
                            onPointerDown={(event) => annotationEditDown(event, `annotation-resize-${corner}`)}
                          />
                        ))}
                      </div>
                    );
                  })()}
              </div>
            ) : (
              <p role="status">{error || 'Actualizando resultado…'}</p>
            )}
            <p className="muted canvas-help">
              {tool === 'crop'
                ? 'Arrastra para crear un recorte, mueve el marco o ajusta la esquina.'
                : 'Flechas, rectángulos y ocultar: arrastra. Números: haz clic. Texto: haz clic y escribe sobre la imagen. Deshacer: Ctrl/Cmd+Z.'}{' '}
              {edit.placement && tool === 'none' ? 'Arrastra el resultado para mover la imagen.' : ''}
            </p>
          </div>
          <aside className="paint-sidebar right-sidebar" aria-label="Ajustes de edición">
            <div className="tool-group">
              <h3>Imagen</h3>
              <div className="paint-tools image-tools" role="toolbar" aria-label="Transformar imagen">
                <button
                  className="icon-action"
                  aria-label="Girar 90°"
                  title="Girar 90°"
                  onClick={() => change({ rotation: (edit.rotation + 90) % 360, crop: null, width: 0, height: 0 })}>
                  <span aria-hidden="true">⟳</span>
                </button>
                <button
                  className="icon-action"
                  aria-label="Voltear horizontal"
                  title="Voltear horizontal"
                  onClick={() => change({ flipX: !edit.flipX })}>
                  <span aria-hidden="true">⇄</span>
                </button>
                <button
                  className="icon-action"
                  aria-label="Voltear vertical"
                  title="Voltear vertical"
                  onClick={() => change({ flipY: !edit.flipY })}>
                  <span aria-hidden="true">⇅</span>
                </button>
              </div>
            </div>
            <div className="tool-group">
              <h3>Exportar imagen actual</h3>
              <div className="numeric-grid">
                {(['width', 'height'] as const).map((key) => (
                  <label className="field" key={key}>
                    {key === 'width' ? 'Ancho' : 'Alto'}
                    <input
                      aria-label={`${key === 'width' ? 'Ancho' : 'Alto'} (0 = automático)`}
                      type="number"
                      min={0}
                      max={32767}
                      value={key === 'width' ? exportWidth : exportHeight}
                      onChange={(event) =>
                        change({
                          [key]: Math.max(0, Math.round(Number(event.target.value))),
                          ...(edit.lockAspect ? { [key === 'width' ? 'height' : 'width']: 0 } : {}),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={edit.lockAspect}
                  onChange={(event) =>
                    change({
                      lockAspect: event.target.checked,
                      ...(event.target.checked ? { height: 0, placement: false } : {}),
                    })
                  }
                />
                Mantener proporción
              </label>
              <label className="field">
                Formato de descarga
                <select
                  aria-label="Formato"
                  value={edit.format}
                  onChange={(event) => change({ format: event.target.value as OutputFormat })}>
                  {OUTPUT_FORMATS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              {info.qualityControl && (
                <label className="field">
                  Calidad: {Math.round(edit.quality * 100)}%
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={Math.round(edit.quality * 100)}
                    onChange={(event) => change({ quality: Number(event.target.value) / 100 })}
                  />
                </label>
              )}
              {!info.alpha && (
                <label className="field">
                  Fondo
                  <input
                    type="color"
                    value={edit.background}
                    onChange={(event) => change({ background: event.target.value })}
                  />
                </label>
              )}
              {edit.format === 'ico' && (
                <label className="field">
                  Resoluciones ICO
                  <select
                    value={edit.icoSizes.join(',')}
                    onChange={(event) => change({ icoSizes: event.target.value.split(',').map(Number) })}>
                    <option value="16,32,48,64,128,256">16–256 px</option>
                    <option value="16,32,48">16, 32, 48 px</option>
                    <option value="256">256 px</option>
                    {!['16,32,48,64,128,256', '16,32,48', '256'].includes(edit.icoSizes.join(',')) && (
                      <option value={edit.icoSizes.join(',')}>{edit.icoSizes.join(', ')} px</option>
                    )}
                  </select>
                </label>
              )}
              {info.notes && <p className="muted">{info.notes}</p>}
              <button
                onClick={() =>
                  void run(async () => {
                    await copyFrame(await renderEdit(source, edit));
                    setStatus('Imagen editada copiada como PNG.');
                  })
                }>
                Copiar PNG actual
              </button>
              <button className="primary" onClick={() => void run(exportImage)}>
                Descargar imagen actual
              </button>
            </div>
            <div className="tool-group ocr-panel">
              <h3>Extraer texto · OCR local</h3>
              <label className="field">
                Idioma
                <select value={ocrLanguage} onChange={(event) => setOcrLanguage(event.target.value)}>
                  <option value="spa+eng">Español e inglés</option>
                  <option value="spa">Español</option>
                  <option value="eng">Inglés</option>
                </select>
              </label>
              <button
                onClick={() =>
                  void run(async () => {
                    const { recognizeText } = await import('../../lib/ocr');
                    const result = await recognizeText(await renderEdit(source, edit), ocrLanguage, setStatus);
                    if (alive.current) {
                      setOcrText(result);
                      setStatus(
                        result.trim() ? 'Texto extraído. Puedes corregirlo antes de copiar.' : 'No se detectó texto.',
                      );
                    }
                  })
                }>
                Extraer texto del resultado
              </button>
              <label className="field">
                Texto reconocido
                <textarea rows={9} value={ocrText} onChange={(event) => setOcrText(event.target.value)} />
              </label>
              <button
                disabled={!ocrText.trim()}
                onClick={() =>
                  void run(async () => {
                    await navigator.clipboard.writeText(ocrText);
                    setStatus('Texto copiado.');
                  })
                }>
                Copiar texto
              </button>
            </div>
          </aside>
        </div>
      </fieldset>
      {status && (
        <p className="inline-status toast" role="status">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="note error">
          {error}
        </p>
      )}
    </section>
  );
}
