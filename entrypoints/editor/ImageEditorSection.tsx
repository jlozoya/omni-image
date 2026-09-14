import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { decodeImageFile } from '../../lib/decode';
import { renderEdit, transformFrame, encodeEdit, drawAnnotations } from '../../lib/editor-render';
import { copyFrame } from '../../lib/clipboard';
import { downloadEncoded } from '../../lib/download';
import { OUTPUT_FORMATS, formatInfo } from '../../lib/formats';
import { basenameWithoutExtension, clamp, safeFilenamePart } from '../../lib/utils';
import type { Annotation, EditState, EditorEntry } from '../../lib/editor-model';
import type { ImageFrame, OutputFormat } from '../../lib/types';
import type { CropRect } from '../../lib/crop';

interface Props {
  entry: EditorEntry;
  onChange: (edit: EditState) => void;
  disabled: boolean;
}
type Tool = 'none' | 'crop' | Annotation['kind'];
function FrameCanvas({ frame, label }: { frame: ImageFrame | null; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (frame && ref.current) {
      ref.current.width = frame.width; ref.current.height = frame.height;
      ref.current.getContext('2d')!.putImageData(new ImageData(frame.data, frame.width, frame.height), 0, 0);
    }
  }, [frame]);
  return <canvas ref={ref} aria-label={label} className="image-canvas" />;
}
export default function ImageEditorSection({ entry, onChange, disabled }: Props) {
  const { file, edit } = entry;
  const [source, setSource] = useState<ImageFrame | null>(null);
  const [output, setOutput] = useState<ImageFrame | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [past, setPast] = useState<EditState[]>([]);
  const [future, setFuture] = useState<EditState[]>([]);
  const [ratio, setRatio] = useState(0);
  const [tool, setTool] = useState<Tool>('none');
  const [color, setColor] = useState('#e53935');
  const [text, setText] = useState('');
  const [size, setSize] = useState(.05);
  const [density, setDensity] = useState(1);
  const [ocrLanguage, setOcrLanguage] = useState('spa+eng');
  const [ocrText, setOcrText] = useState('');
  const [draftCrop, setDraftCrop] = useState<CropRect | null>(null);
  const [draftPlacement, setDraftPlacement] = useState<{ offsetX: number; offsetY: number } | null>(null);
  const [draftAnnotation, setDraftAnnotation] = useState<{ index: number; annotation: Annotation } | null>(null);
  const [selectedAnnotation, setSelectedAnnotation] = useState<number | null>(null);
  const [annotation, setAnnotation] = useState<Annotation | null>(null);
  const gesture = useRef<{ x: number; y: number; crop: CropRect; mode: string; annotation?: Annotation; index?: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const annotationCanvas = useRef<HTMLCanvasElement>(null);
  const alive = useRef(true);
  const locked = busy || disabled;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    decodeImageFile(file).then((frame) => { if (!cancelled) setSource(frame); }).catch((err) => { if (!cancelled) setError(String(err)); });
    return () => { cancelled = true; };
  }, [file]);
  const renderState = useMemo(() => {
    const next = draftPlacement ? { ...edit, ...draftPlacement } : { ...edit };
    if (draftAnnotation) next.annotations = edit.annotations.map((item, index) => index === draftAnnotation.index ? draftAnnotation.annotation : item);
    return next;
  }, [draftPlacement, draftAnnotation, edit]);
  const transformed = useMemo(() => source ? transformFrame(source, edit) : null, [source, edit.rotation, edit.flipX, edit.flipY]);
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      renderEdit(source, renderState).then((frame) => { if (!cancelled) { setOutput(frame); setError(''); } })
        .catch((err) => { if (!cancelled) setError(String(err)); });
    }, draftPlacement || draftAnnotation ? 0 : 120);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [source, renderState, draftPlacement, draftAnnotation]);
  useEffect(() => {
    if (selectedAnnotation !== null && selectedAnnotation >= edit.annotations.length) setSelectedAnnotation(null);
  }, [selectedAnnotation, edit.annotations.length]);
  useEffect(() => {
    if (!output || !annotationCanvas.current) return;
    const canvas = annotationCanvas.current;
    canvas.width = output.width; canvas.height = output.height;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (annotation) drawAnnotations(ctx, [annotation], output.width, output.height);
  }, [annotation, output]);
  function change(patch: Partial<EditState>) {
    setPast((items) => [...items.slice(-39), edit]); setFuture([]); onChange({ ...edit, ...patch });
  }
  function undo() {
    const previous = past.at(-1); if (!previous) return;
    setFuture((items) => [edit, ...items]); setPast((items) => items.slice(0, -1)); onChange(previous);
  }
  function redo() {
    const next = future[0]; if (!next) return;
    setPast((items) => [...items, edit]); setFuture((items) => items.slice(1)); onChange(next);
  }
  const fullCrop = transformed ? { x: 0, y: 0, width: transformed.width, height: transformed.height } : { x: 0, y: 0, width: 1, height: 1 };
  const crop = draftCrop ?? edit.crop ?? fullCrop;
  const info = formatInfo(edit.format);
  const exportBase = edit.crop ?? fullCrop;
  const exportWidth = Math.round(edit.width || (edit.height ? edit.height * exportBase.width / exportBase.height : exportBase.width));
  const exportHeight = Math.round(edit.height || (edit.width ? edit.width * exportBase.height / exportBase.width : exportBase.height));
  const canvasFrame = tool === 'crop' ? transformed : output;
  const canvasWidth = tool === 'crop' ? fullCrop.width : output?.width;
  const canvasHeight = tool === 'crop' ? fullCrop.height : output?.height;
  const selectedAnnotationItem = selectedAnnotation === null ? null : draftAnnotation?.index === selectedAnnotation ? draftAnnotation.annotation : edit.annotations[selectedAnnotation] ?? null;
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
    { value: 'text', label: 'Texto', icon: 'T', hint: 'Escribe una nota y haz clic para colocarla.' },
    { value: 'number', label: 'Número', icon: '#', hint: 'Haz clic para colocar marcadores numerados.' },
  ];
  function selectTool(nextTool: Tool) {
    setTool(nextTool);
    if (nextTool === 'none' && !edit.placement) change({ placement: true });
  }
  function chooseSize(percent: number) {
    const nextSize = percent / 100;
    setSize(nextSize);
    setAnnotation((current) => current ? { ...current, size: nextSize } : current);
    updateSelectedAnnotation({ size: nextSize });
  }
  function chooseDensity(percent: number) {
    const nextDensity = percent / 100;
    setDensity(nextDensity);
    setAnnotation((current) => current && current.kind !== 'redact' ? { ...current, opacity: nextDensity } : current);
    updateSelectedAnnotation({ opacity: nextDensity }, (item) => item.kind !== 'redact');
  }
  function chooseColor(nextColor: string) {
    setColor(nextColor);
    setAnnotation((current) => current && current.kind !== 'redact' ? { ...current, color: nextColor } : current);
    updateSelectedAnnotation({ color: nextColor }, (item) => item.kind !== 'redact');
  }
  function chooseText(nextText: string) {
    setText(nextText);
    setAnnotation((current) => current?.kind === 'text' ? { ...current, text: nextText } : current);
    updateSelectedAnnotation({ text: nextText }, (item) => item.kind === 'text');
  }
  function updateSelectedAnnotation(patch: Partial<Annotation>, predicate: (item: Annotation) => boolean = () => true) {
    if (selectedAnnotation === null) return;
    const current = edit.annotations[selectedAnnotation];
    if (!current || !predicate(current)) return;
    change({ annotations: edit.annotations.map((item, index) => index === selectedAnnotation ? { ...item, ...patch } : item) });
  }
  function pointFromStage(clientX: number, clientY: number, normalized = false) {
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: clamp((clientX - bounds.left) / bounds.width, 0, 1) * (normalized ? 1 : fullCrop.width),
      y: clamp((clientY - bounds.top) / bounds.height, 0, 1) * (normalized ? 1 : fullCrop.height),
    };
  }
  function point(event: PointerEvent<HTMLElement>, normalized = false) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1) * (normalized ? 1 : fullCrop.width),
      y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1) * (normalized ? 1 : fullCrop.height) };
  }
  function cropDown(event: PointerEvent<HTMLDivElement>) {
    if (locked || event.button !== 0) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { ...point(event), crop, mode: (event.target as HTMLElement).dataset.mode ?? 'select' };
  }
  function cropMove(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current; if (!g) return;
    const p = point(event), dx = p.x - g.x, dy = p.y - g.y;
    if (g.mode === 'move') {
      setDraftCrop({ ...g.crop, x: clamp(g.crop.x + dx, 0, fullCrop.width - g.crop.width), y: clamp(g.crop.y + dy, 0, fullCrop.height - g.crop.height) }); return;
    }
    if (g.mode.startsWith('resize-')) {
      setDraftCrop(resizeCropFromCorner(g.crop, g.mode.replace('resize-', ''), p, dx, dy));
      return;
    }
    const anchorX = g.x, anchorY = g.y;
    let width = Math.max(1, Math.abs(p.x - anchorX)), height = Math.max(1, Math.abs(p.y - anchorY));
    if (ratio) {
      height = width / ratio;
      const availableY = p.y < anchorY ? anchorY : fullCrop.height - anchorY;
      if (height > availableY) { height = availableY; width = height * ratio; }
    }
    setDraftCrop({ x: p.x < anchorX ? anchorX - width : anchorX, y: p.y < anchorY ? anchorY - height : anchorY, width, height });
  }
  function resizeCropFromCorner(base: CropRect, corner: string, p: { x: number; y: number }, dx: number, dy: number): CropRect {
    if (ratio) {
      const fixedX = corner.includes('w') ? base.x + base.width : base.x;
      const fixedY = corner.includes('n') ? base.y + base.height : base.y;
      const maxWidth = corner.includes('w') ? fixedX : fullCrop.width - fixedX;
      const maxHeight = corner.includes('n') ? fixedY : fullCrop.height - fixedY;
      let width = Math.min(Math.max(1, Math.abs(p.x - fixedX)), maxWidth);
      let height = Math.min(Math.max(1, Math.abs(p.y - fixedY)), maxHeight);
      if (width / ratio <= height) height = width / ratio;
      else width = height * ratio;
      if (height > maxHeight) { height = maxHeight; width = height * ratio; }
      if (width > maxWidth) { width = maxWidth; height = width / ratio; }
      return {
        x: corner.includes('w') ? fixedX - width : fixedX,
        y: corner.includes('n') ? fixedY - height : fixedY,
        width: Math.max(1, width),
        height: Math.max(1, height),
      };
    }
    let left = base.x, right = base.x + base.width, top = base.y, bottom = base.y + base.height;
    if (corner.includes('w')) left = clamp(left + dx, 0, right - 1);
    if (corner.includes('e')) right = clamp(right + dx, left + 1, fullCrop.width);
    if (corner.includes('n')) top = clamp(top + dy, 0, bottom - 1);
    if (corner.includes('s')) bottom = clamp(bottom + dy, top + 1, fullCrop.height);
    return { x: left, y: top, width: right - left, height: bottom - top };
  }
  function cropUp(event: PointerEvent<HTMLDivElement>) {
    if (gesture.current && draftCrop) change({ crop: { x: Math.round(draftCrop.x), y: Math.round(draftCrop.y), width: Math.max(1, Math.round(draftCrop.width)), height: Math.max(1, Math.round(draftCrop.height)) }, width: 0, height: 0 });
    gesture.current = null; setDraftCrop(null); event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function chooseRatio(value: number) {
    setRatio(value); if (!value) return;
    const width = Math.min(crop.width, crop.height * value), height = width / value;
    change({ crop: { x: crop.x, y: crop.y, width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) }, width: 0, height: 0 });
  }
  function annotateDown(event: PointerEvent<HTMLDivElement>) {
    if (locked || tool === 'none' || tool === 'crop' || !output || event.button !== 0) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedAnnotation(null);
    const p = point(event, true);
    const a: Annotation = { kind: tool, ...p, endX: p.x, endY: p.y, color: tool === 'redact' ? '#000000' : color, size, opacity: tool === 'redact' ? 1 : density,
      text: tool === 'number' ? String(edit.annotations.filter((item) => item.kind === 'number').length + 1) : text };
    if (tool === 'text' && !text.trim()) { setStatus('Escribe el texto antes de colocarlo.'); return; }
    setAnnotation(a);
  }
  function annotateMove(event: PointerEvent<HTMLDivElement>) {
    if (!annotation) return; const p = point(event, true); setAnnotation({ ...annotation, endX: p.x, endY: p.y });
  }
  function annotateUp() {
    if (annotation && (['text', 'number'].includes(annotation.kind) || Math.abs(annotation.endX - annotation.x) + Math.abs(annotation.endY - annotation.y) > .002)) {
      change({ annotations: [...edit.annotations, annotation] });
      setSelectedAnnotation(edit.annotations.length);
    }
    setAnnotation(null);
  }
  function annotationBounds(item: Annotation) {
    if (item.kind === 'text') {
      const lines = item.text.split('\n');
      const width = Math.min(Math.max(.035, Math.max(...lines.map((line) => line.length), 1) * item.size * .5), 1);
      const height = Math.min(Math.max(.035, lines.length * item.size * 1.2), 1);
      return { left: clamp(item.x, 0, 1 - width), top: clamp(item.y, 0, 1 - height), width, height };
    }
    if (item.kind === 'number') {
      const radius = Math.max(.02, item.size * .8);
      const size = Math.min(radius * 2, 1);
      return { left: clamp(item.x - radius, 0, 1 - size), top: clamp(item.y - radius, 0, 1 - size), width: size, height: size };
    }
    const left = Math.min(item.x, item.endX), right = Math.max(item.x, item.endX);
    const top = Math.min(item.y, item.endY), bottom = Math.max(item.y, item.endY);
    return { left, top, width: Math.max(.025, right - left), height: Math.max(.025, bottom - top) };
  }
  function moveAnnotation(item: Annotation, dx: number, dy: number) {
    const bounds = annotationBounds(item);
    const safeDx = clamp(dx, -bounds.left, 1 - bounds.left - bounds.width);
    const safeDy = clamp(dy, -bounds.top, 1 - bounds.top - bounds.height);
    return { ...item, x: item.x + safeDx, y: item.y + safeDy, endX: item.endX + safeDx, endY: item.endY + safeDy };
  }
  function resizeAnnotation(item: Annotation, mode: string, p: { x: number; y: number }, start: { x: number; y: number }) {
    if (item.kind === 'text' || item.kind === 'number') return moveAnnotation(item, p.x - start.x, p.y - start.y);
    const dx = p.x - start.x, dy = p.y - start.y;
    const corner = mode.replace('annotation-resize-', '');
    let left = Math.min(item.x, item.endX), right = Math.max(item.x, item.endX);
    let top = Math.min(item.y, item.endY), bottom = Math.max(item.y, item.endY);
    if (corner.includes('w')) left = clamp(left + dx, 0, right - .002);
    if (corner.includes('e')) right = clamp(right + dx, left + .002, 1);
    if (corner.includes('n')) top = clamp(top + dy, 0, bottom - .002);
    if (corner.includes('s')) bottom = clamp(bottom + dy, top + .002, 1);
    return { ...item, x: clamp(left, 0, 1), y: clamp(top, 0, 1), endX: clamp(right, 0, 1), endY: clamp(bottom, 0, 1) };
  }
  function editedAnnotationAt(event: PointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (!g?.annotation || g.index === undefined || !g.mode.startsWith('annotation-')) return null;
    const p = pointFromStage(event.clientX, event.clientY, true);
    if (g.mode === 'annotation-move') return { index: g.index, annotation: moveAnnotation(g.annotation, p.x - g.x, p.y - g.y) };
    return { index: g.index, annotation: resizeAnnotation(g.annotation, g.mode, p, { x: g.x, y: g.y }) };
  }
  function annotationEditDown(event: PointerEvent<HTMLElement>, mode: string) {
    if (locked || selectedAnnotation === null || !selectedAnnotationItem || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
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
      change({ annotations: edit.annotations.map((item, index) => index === next.index ? next.annotation : item) });
      setSelectedAnnotation(next.index);
    }
    setDraftAnnotation(null);
    gesture.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    try { (event.target as HTMLElement).releasePointerCapture(event.pointerId); } catch {}
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
    if (locked) return; setBusy(true); setStatus('Procesando…');
    try { await action(); } catch (err) { if (alive.current) setStatus(err instanceof Error ? err.message : String(err)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function exportImage() {
    if (!source) return;
    const result = await encodeEdit(source, edit, setStatus);
    await downloadEncoded(result.encoded, `${safeFilenamePart(basenameWithoutExtension(file.name))}-editado.${result.encoded.extension}`);
    setStatus(`Descarga iniciada: ${(result.encoded.bytes.length / 1024).toFixed(1)} KB · ${result.width} × ${result.height} px.`);
  }
  if (!source) return <section className="card"><p role="status">{error || 'Cargando imagen…'}</p></section>;
  return <section className="editor-section" onKeyDown={(event) => {
    if (locked || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName)) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
  }}>
    <div className="section-header"><h2 className="section-title">{file.name}</h2><span className="muted">{source.width} × {source.height} · {(file.size / 1024).toFixed(1)} KB</span></div>
    <fieldset disabled={locked} className="editor-fieldset">
      <div className="editor-workbench">
        <aside className="paint-sidebar" aria-label="Herramientas de edición">
          <div className="tool-group">
            <h3>Edición</h3>
            <div className="paint-tools" role="toolbar" aria-label="Herramienta">
              {modeTools.map((item) => <button key={item.value} type="button" className={tool === item.value ? 'tool-button selected' : 'tool-button'} title={`${item.label}: ${item.hint}`} aria-label={item.label} aria-pressed={tool === item.value} onClick={() => selectTool(item.value)}><span aria-hidden="true" className="tool-icon">{item.icon}</span></button>)}
            </div>
          </div>
          {tool === 'none' && <div className="tool-group active-tool-panel">
            <h3>Posición y escala</h3>
            <label className="checkbox-field"><input type="checkbox" checked={edit.placement} onChange={(event) => change({ placement: event.target.checked })} />Ajustar posición y escala</label>
            {edit.placement && <>
              <div className="numeric-grid">
                <label className="field">X<input aria-label="Desplazamiento X (px)" type="number" value={edit.offsetX} onChange={(event) => change({ offsetX: Number(event.target.value) })} /></label>
                <label className="field">Y<input aria-label="Desplazamiento Y (px)" type="number" value={edit.offsetY} onChange={(event) => change({ offsetY: Number(event.target.value) })} /></label>
              </div>
              <label className="field">Escala: {Math.round(edit.zoom * 100)}%<input type="range" min={10} max={500} value={edit.zoom * 100} onChange={(event) => change({ zoom: Number(event.target.value) / 100 })} /></label>
              <button onClick={() => change({ offsetX: 0, offsetY: 0, zoom: 1 })}>Centrar</button>
            </>}
          </div>}
          {tool === 'crop' && <div className="tool-group active-tool-panel">
            <h3>Recorte</h3>
            <label className="field">Proporción<select value={ratio} onChange={(event) => chooseRatio(Number(event.target.value))}><option value={0}>Libre</option><option value={1}>1:1</option><option value={4 / 3}>4:3</option><option value={16 / 9}>16:9</option><option value={9 / 16}>9:16</option></select></label>
            <div className="numeric-grid">{(['x', 'y', 'width', 'height'] as const).map((key) => <label className="field" key={key}>{{ x: 'X', y: 'Y', width: 'Ancho', height: 'Alto' }[key]}<input type="number" min={key === 'x' || key === 'y' ? 0 : 1} value={Math.round(crop[key])} onChange={(event) => {
              const next = { ...crop, [key]: Number(event.target.value) };
              next.x = clamp(next.x, 0, fullCrop.width - 1); next.y = clamp(next.y, 0, fullCrop.height - 1);
              next.width = clamp(next.width, 1, fullCrop.width - next.x); next.height = clamp(next.height, 1, fullCrop.height - next.y);
              if (ratio && (key === 'width' || key === 'height')) { next.width = Math.min(key === 'height' ? next.height * ratio : next.width, (fullCrop.height - next.y) * ratio, fullCrop.width - next.x); next.height = next.width / ratio; }
              change({ crop: next, width: 0, height: 0 });
            }} /></label>)}</div>
            <button onClick={() => change({ crop: null, width: 0, height: 0 })}>Restablecer recorte</button>
          </div>}
          <div className="tool-group">
            <h3>Dibujo</h3>
            <div className="paint-tools drawing-toolbox" role="toolbar" aria-label="Herramientas de dibujo">
              {drawingTools.map((item) => <button key={item.value} type="button" className={tool === item.value ? 'tool-button selected' : 'tool-button'} title={`${item.label}: ${item.hint}`} aria-label={item.label} aria-pressed={tool === item.value} onClick={() => selectTool(item.value)}><span aria-hidden="true" className="tool-icon">{item.icon}</span></button>)}
            </div>
            <label className="field color-field">Color<input type="color" value={redactionColorLocked ? '#000000' : color} disabled={redactionColorLocked} title={redactionColorLocked ? 'Ocultar siempre usa negro sólido' : 'Color'} onChange={(event) => chooseColor(event.target.value)} /></label>
            <div className="stroke-controls" aria-label="Ancho de línea y densidad">
              <label className="stroke-control" title={`Ancho de línea: ${Math.round(size * 100)}`}>
                <span className="stroke-icon line-width-icon" aria-hidden="true">≋</span>
                <input type="range" aria-label="Ancho de línea" min={1} max={24} step={1} value={Math.round(size * 100)} onChange={(event) => chooseSize(Number(event.target.value))} />
              </label>
              <label className="stroke-control" title={redactionColorLocked ? 'Ocultar siempre usa densidad completa' : `Densidad: ${Math.round(density * 100)}%`}>
                <span className="stroke-icon density-icon" aria-hidden="true">◒</span>
                <input type="range" aria-label="Densidad" min={10} max={100} step={5} value={redactionColorLocked ? 100 : Math.round(density * 100)} disabled={redactionColorLocked} onChange={(event) => chooseDensity(Number(event.target.value))} />
              </label>
            </div>
            {tool === 'text' && <label className="field">Texto<textarea value={selectedAnnotationItem?.kind === 'text' ? selectedAnnotationItem.text : text} onChange={(event) => chooseText(event.target.value)} /></label>}
            <button disabled={!edit.annotations.length} onClick={() => { setSelectedAnnotation(null); change({ annotations: [] }); }}>Quitar anotaciones</button>
          </div>
          <div className="tool-group compact-actions">
            <button className="icon-action" aria-label="Deshacer" title="Deshacer" disabled={!past.length} onClick={undo}><span aria-hidden="true">↶</span></button>
            <button className="icon-action" aria-label="Rehacer" title="Rehacer" disabled={!future.length} onClick={redo}><span aria-hidden="true">↷</span></button>
          </div>
        </aside>
        <div className="canvas-panel">
          <div className="canvas-heading">
            <h3>{tool === 'crop' ? 'Recortar imagen' : 'Resultado editado'}</h3>
            {output && <span className="muted">{output.width} × {output.height} px</span>}
          </div>
          {canvasFrame && canvasWidth && canvasHeight ? <div ref={stageRef} className="interactive-image unified-canvas" style={{ aspectRatio: `${canvasWidth}/${canvasHeight}`, cursor: tool === 'crop' ? 'crosshair' : tool === 'none' ? 'move' : 'crosshair' }}
            onPointerDown={(event) => {
              if (tool === 'crop') cropDown(event);
              else if (tool === 'none' && edit.placement && !locked && output && event.button === 0) {
                event.currentTarget.setPointerCapture(event.pointerId); gesture.current = { ...point(event, true), crop, mode: 'placement' };
              } else annotateDown(event);
            }}
            onPointerMove={(event) => { if (tool === 'crop') cropMove(event); else if (gesture.current?.mode === 'placement') placementMove(event); else annotateMove(event); }}
            onPointerUp={(event) => {
              if (tool === 'crop') cropUp(event);
              else if (!placementUp(event)) annotateUp();
            }}
            onPointerCancel={() => { setAnnotation(null); gesture.current = null; setDraftCrop(null); setDraftPlacement(null); }}>
            <FrameCanvas frame={canvasFrame} label={tool === 'crop' ? 'Imagen para recortar' : 'Resultado editado'} />
            {tool === 'crop' && <div className="crop-box" data-mode="move" style={{ left: `${crop.x / fullCrop.width * 100}%`, top: `${crop.y / fullCrop.height * 100}%`, width: `${crop.width / fullCrop.width * 100}%`, height: `${crop.height / fullCrop.height * 100}%` }}>
              {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => <span key={corner} className={`crop-handle crop-handle-${corner}`} data-mode={`resize-${corner}`} />)}
            </div>}
            {tool !== 'crop' && <canvas className="annotation-overlay" ref={annotationCanvas} />}
            {tool !== 'crop' && selectedAnnotationItem && (() => {
              const bounds = annotationBounds(selectedAnnotationItem);
              return <div className="annotation-selection" style={{ left: `${bounds.left * 100}%`, top: `${bounds.top * 100}%`, width: `${bounds.width * 100}%`, height: `${bounds.height * 100}%` }}
                onPointerDown={(event) => annotationEditDown(event, 'annotation-move')} onPointerMove={annotationEditMove} onPointerUp={annotationEditUp} onPointerCancel={(event) => { event.stopPropagation(); setDraftAnnotation(null); gesture.current = null; }}>
                {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => <span key={corner} className={`annotation-handle annotation-handle-${corner}`} onPointerDown={(event) => annotationEditDown(event, `annotation-resize-${corner}`)} />)}
              </div>;
            })()}
          </div> : <p role="status">{error || 'Actualizando resultado…'}</p>}
          <p className="muted canvas-help">{tool === 'crop' ? 'Arrastra para crear un recorte, mueve el marco o ajusta la esquina.' : 'Flechas, rectángulos y ocultar: arrastra. Texto y números: haz clic. Deshacer: Ctrl/Cmd+Z.'} {edit.placement && tool === 'none' ? 'Arrastra el resultado para mover la imagen.' : ''}</p>
        </div>
        <aside className="paint-sidebar right-sidebar" aria-label="Ajustes de edición">
          <div className="tool-group">
            <h3>Imagen</h3>
            <div className="paint-tools image-tools" role="toolbar" aria-label="Transformar imagen">
              <button className="icon-action" aria-label="Girar 90°" title="Girar 90°" onClick={() => change({ rotation: (edit.rotation + 90) % 360, crop: null, width: 0, height: 0 })}><span aria-hidden="true">⟳</span></button>
              <button className="icon-action" aria-label="Voltear horizontal" title="Voltear horizontal" onClick={() => change({ flipX: !edit.flipX })}><span aria-hidden="true">⇄</span></button>
              <button className="icon-action" aria-label="Voltear vertical" title="Voltear vertical" onClick={() => change({ flipY: !edit.flipY })}><span aria-hidden="true">⇅</span></button>
            </div>
          </div>
          <div className="tool-group">
            <h3>Exportar imagen actual</h3>
            <div className="numeric-grid">{(['width', 'height'] as const).map((key) => <label className="field" key={key}>{key === 'width' ? 'Ancho' : 'Alto'}<input aria-label={`${key === 'width' ? 'Ancho' : 'Alto'} (0 = automático)`} type="number" min={0} max={32767} value={key === 'width' ? exportWidth : exportHeight} onChange={(event) => change({ [key]: Math.max(0, Math.round(Number(event.target.value))), ...(edit.lockAspect ? { [key === 'width' ? 'height' : 'width']: 0 } : {}) })} /></label>)}</div>
            <label className="checkbox-field"><input type="checkbox" checked={edit.lockAspect} onChange={(event) => change({ lockAspect: event.target.checked, ...(event.target.checked ? { height: 0, placement: false } : {}) })} />Mantener proporción</label>
            <label className="field">Formato<select aria-label="Formato" value={edit.format} onChange={(event) => change({ format: event.target.value as OutputFormat })}>{OUTPUT_FORMATS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            {info.qualityControl && <label className="field">Calidad: {Math.round(edit.quality * 100)}%<input type="range" min={1} max={100} value={Math.round(edit.quality * 100)} onChange={(event) => change({ quality: Number(event.target.value) / 100 })} /></label>}
            {!info.alpha && <label className="field">Fondo<input type="color" value={edit.background} onChange={(event) => change({ background: event.target.value })} /></label>}
            {edit.format === 'ico' && <label className="field">Resoluciones ICO<select value={edit.icoSizes.join(',')} onChange={(event) => change({ icoSizes: event.target.value.split(',').map(Number) })}><option value="16,32,48,64,128,256">16–256 px</option><option value="16,32,48">16, 32, 48 px</option><option value="256">256 px</option>{!['16,32,48,64,128,256', '16,32,48', '256'].includes(edit.icoSizes.join(',')) && <option value={edit.icoSizes.join(',')}>{edit.icoSizes.join(', ')} px</option>}</select></label>}
            {info.notes && <p className="muted">{info.notes}</p>}
            <button onClick={() => void run(async () => { await copyFrame(await renderEdit(source, edit)); setStatus('Imagen editada copiada como PNG.'); })}>Copiar PNG actual</button>
            <button className="primary" onClick={() => void run(exportImage)}>Descargar imagen actual</button>
          </div>
          <div className="tool-group ocr-panel">
            <h3>Extraer texto · OCR local</h3>
            <label className="field">Idioma<select value={ocrLanguage} onChange={(event) => setOcrLanguage(event.target.value)}><option value="spa+eng">Español e inglés</option><option value="spa">Español</option><option value="eng">Inglés</option></select></label>
            <button onClick={() => void run(async () => { const { recognizeText } = await import('../../lib/ocr'); const result = await recognizeText(await renderEdit(source, edit), ocrLanguage, setStatus); if (alive.current) { setOcrText(result); setStatus(result.trim() ? 'Texto extraído. Puedes corregirlo antes de copiar.' : 'No se detectó texto.'); } })}>Extraer texto del resultado</button>
            <label className="field">Texto reconocido<textarea rows={9} value={ocrText} onChange={(event) => setOcrText(event.target.value)} /></label>
            <button disabled={!ocrText.trim()} onClick={() => void run(async () => { await navigator.clipboard.writeText(ocrText); setStatus('Texto copiado.'); })}>Copiar texto</button>
          </div>
        </aside>
      </div>
    </fieldset>
    {status && <p className="inline-status toast" role="status">{status}</p>}
    {error && <p role="alert" className="note error">{error}</p>}
  </section>;
}
