import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Button } from 'react-aria-components';
import { placeFrame, resizeFrame } from '../../lib/canvas';
import { encodeFrame } from '../../lib/codec';
import { cropFrame, type CropRect } from '../../lib/crop';
import { decodeImageFile } from '../../lib/decode';
import { downloadEncoded } from '../../lib/download';
import { OUTPUT_FORMATS, formatInfo } from '../../lib/formats';
import { DEFAULT_SETTINGS } from '../../lib/settings';
import type { ImageFrame, OutputFormat } from '../../lib/types';
import { basenameWithoutExtension, clamp, safeFilenamePart } from '../../lib/utils';

const MAX_DISPLAY_WIDTH = 560;
const MAX_DISPLAY_HEIGHT = 400;
const MIN_CROP_SIZE = 8;

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se';
type DragState = { mode: DragMode; startX: number; startY: number; crop: CropRect };

interface Props {
  file: File;
  onRemove: () => void;
}

export default function ImageEditorSection({ file, onRemove }: Props) {
  const [frame, setFrame] = useState<ImageFrame | null>(null);
  const [error, setError] = useState('');
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [targetWidth, setTargetWidth] = useState(0);
  const [targetHeight, setTargetHeight] = useState(0);
  const [lockAspect, setLockAspect] = useState(true);
  const [fitAndFill, setFitAndFill] = useState(false);
  const [manualOffsetX, setManualOffsetX] = useState(0);
  const [manualOffsetY, setManualOffsetY] = useState(0);
  const [manualScale, setManualScale] = useState(1);
  const [format, setFormat] = useState<OutputFormat>('png');
  const [quality, setQuality] = useState(90);
  const [background, setBackground] = useState('#ffffff');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameImageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragState = useRef<DragState | null>(null);
  const frameDragState = useRef<{ startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void decodeImageFile(file)
      .then((decoded) => {
        if (cancelled) return;
        setFrame(decoded);
        setCrop({ x: 0, y: 0, width: decoded.width, height: decoded.height });
        setTargetWidth(decoded.width);
        setTargetHeight(decoded.height);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo abrir la imagen.');
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  const scale = useMemo(() => {
    if (!frame) return 1;
    return Math.min(1, MAX_DISPLAY_WIDTH / frame.width, MAX_DISPLAY_HEIGHT / frame.height);
  }, [frame]);

  const displayWidth = frame ? Math.round(frame.width * scale) : 0;
  const displayHeight = frame ? Math.round(frame.height * scale) : 0;

  useEffect(() => {
    if (!frame || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = frame.width;
    canvas.height = frame.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(new ImageData(frame.data, frame.width, frame.height), 0, 0);
  }, [frame]);

  useEffect(() => {
    if (!crop) return;
    setTargetWidth(Math.round(crop.width));
    setTargetHeight(Math.round(crop.height));
    // Only re-sync target dimensions when the crop's size changes (not on move).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crop?.width, crop?.height]);

  useEffect(() => {
    if (!frame) return;
    function onPointerMove(event: PointerEvent) {
      const drag = dragState.current;
      if (!drag || !frame) return;
      const dxImage = (event.clientX - drag.startX) / scale;
      const dyImage = (event.clientY - drag.startY) / scale;
      setCrop(resolveDrag(drag, dxImage, dyImage, frame.width, frame.height));
    }
    function onPointerUp() {
      dragState.current = null;
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [frame, scale]);

  function beginDrag(mode: DragMode, event: ReactPointerEvent) {
    if (!crop) return;
    event.preventDefault();
    dragState.current = { mode, startX: event.clientX, startY: event.clientY, crop };
  }

  const showManualPlacement = !lockAspect && fitAndFill;

  const containScale = useMemo(() => {
    if (!crop || crop.width <= 0 || crop.height <= 0 || !targetWidth || !targetHeight) return 1;
    return Math.min(targetWidth / crop.width, targetHeight / crop.height);
  }, [crop?.width, crop?.height, targetWidth, targetHeight]);

  const frameScale = useMemo(() => {
    if (!targetWidth || !targetHeight) return 1;
    return Math.min(1, MAX_DISPLAY_WIDTH / targetWidth, MAX_DISPLAY_HEIGHT / targetHeight);
  }, [targetWidth, targetHeight]);

  const frameDisplayWidth = Math.round(targetWidth * frameScale);
  const frameDisplayHeight = Math.round(targetHeight * frameScale);

  useEffect(() => {
    if (!showManualPlacement || !frame || !crop || !frameImageCanvasRef.current) return;
    const cropped = cropFrame(frame, crop);
    const canvas = frameImageCanvasRef.current;
    canvas.width = cropped.width;
    canvas.height = cropped.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(new ImageData(cropped.data, cropped.width, cropped.height), 0, 0);
  }, [showManualPlacement, frame, crop]);

  function resetManualPlacement() {
    if (!crop) return;
    setManualScale(containScale);
    setManualOffsetX((targetWidth - crop.width * containScale) / 2);
    setManualOffsetY((targetHeight - crop.height * containScale) / 2);
  }

  useEffect(() => {
    if (!fitAndFill || !crop) return;
    resetManualPlacement();
    // Re-center whenever manual mode is entered, or the crop/target size changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitAndFill, crop?.width, crop?.height, targetWidth, targetHeight]);

  useEffect(() => {
    if (!showManualPlacement) return;
    function onPointerMove(event: PointerEvent) {
      const drag = frameDragState.current;
      if (!drag) return;
      const dx = (event.clientX - drag.startX) / frameScale;
      const dy = (event.clientY - drag.startY) / frameScale;
      setManualOffsetX(drag.offsetX + dx);
      setManualOffsetY(drag.offsetY + dy);
    }
    function onPointerUp() {
      frameDragState.current = null;
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [showManualPlacement, frameScale]);

  function beginFrameDrag(event: ReactPointerEvent) {
    event.preventDefault();
    frameDragState.current = { startX: event.clientX, startY: event.clientY, offsetX: manualOffsetX, offsetY: manualOffsetY };
  }

  function updateManualZoom(percent: number) {
    if (!crop || !Number.isFinite(percent) || containScale <= 0) return;
    const newScale = clamp((containScale * percent) / 100, containScale * 0.1, containScale * 5);
    const dw = crop.width * manualScale - crop.width * newScale;
    const dh = crop.height * manualScale - crop.height * newScale;
    setManualOffsetX((x) => x + dw / 2);
    setManualOffsetY((y) => y + dh / 2);
    setManualScale(newScale);
  }

  function updateTargetWidth(value: number) {
    if (!crop || !Number.isFinite(value)) return;
    const width = Math.max(1, Math.round(value));
    setTargetWidth(width);
    if (lockAspect && crop.width > 0) {
      setTargetHeight(Math.max(1, Math.round((width * crop.height) / crop.width)));
    }
  }

  function updateTargetHeight(value: number) {
    if (!crop || !Number.isFinite(value)) return;
    const height = Math.max(1, Math.round(value));
    setTargetHeight(height);
    if (lockAspect && crop.height > 0) {
      setTargetWidth(Math.max(1, Math.round((height * crop.width) / crop.height)));
    }
  }

  function resetCrop() {
    if (!frame) return;
    setCrop({ x: 0, y: 0, width: frame.width, height: frame.height });
  }

  const selectedInfo = useMemo(() => formatInfo(format), [format]);

  async function applyAndDownload() {
    if (!frame || !crop || busy) return;
    setBusy(true);
    setStatus('Procesando…');
    try {
      const cropped = cropFrame(frame, crop);
      const needsResize = targetWidth !== cropped.width || targetHeight !== cropped.height;
      let finalFrame = cropped;
      if (needsResize) {
        finalFrame = showManualPlacement
          ? await placeFrame(cropped, targetWidth, targetHeight, manualOffsetX, manualOffsetY, manualScale, background, selectedInfo.alpha)
          : await resizeFrame(cropped, targetWidth, targetHeight);
      }
      const encoded = await encodeFrame(finalFrame, {
        format,
        quality: quality / 100,
        background,
        icoSizes: DEFAULT_SETTINGS.icoSizes,
      });
      const filename = `${safeFilenamePart(basenameWithoutExtension(file.name))}-editado.${encoded.extension}`;
      await downloadEncoded(encoded, filename);
      setStatus('Imagen descargada.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Falló la edición.');
    } finally {
      setBusy(false);
    }
  }

  const cropDisplay = crop
    ? {
        left: crop.x * scale,
        top: crop.y * scale,
        width: crop.width * scale,
        height: crop.height * scale,
      }
    : null;

  return (
    <section className="editor-section">
      <div className="section-header">
        <h2 className="section-title">{file.name}</h2>
        <Button className="section-remove" onPress={onRemove} aria-label={`Quitar ${file.name}`}>
          ✕
        </Button>
      </div>

      {error && (
        <div className="card">
          <p className="note error">{error}</p>
        </div>
      )}

      {!frame && !error && (
        <div className="card">
          <p className="note">Cargando imagen…</p>
        </div>
      )}

      {frame && crop && cropDisplay && (
        <div className="editor-layout">
          <div className="card stage-card">
            <div className="crop-stage" style={{ width: displayWidth, height: displayHeight }}>
              <canvas ref={canvasRef} style={{ width: displayWidth, height: displayHeight }} />
              <div className="crop-shade" style={{ left: 0, top: 0, right: 0, height: cropDisplay.top }} />
              <div className="crop-shade" style={{ left: 0, top: cropDisplay.top + cropDisplay.height, right: 0, bottom: 0 }} />
              <div className="crop-shade" style={{ left: 0, top: cropDisplay.top, width: cropDisplay.left, height: cropDisplay.height }} />
              <div className="crop-shade" style={{ left: cropDisplay.left + cropDisplay.width, top: cropDisplay.top, right: 0, height: cropDisplay.height }} />
              <div
                className="crop-box"
                style={{ left: cropDisplay.left, top: cropDisplay.top, width: cropDisplay.width, height: cropDisplay.height }}
                onPointerDown={(e) => beginDrag('move', e)}
              >
                {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                  <span
                    key={corner}
                    className={`crop-handle crop-handle-${corner}`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      beginDrag(corner, e);
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="crop-info">
              <span>Recorte: {Math.round(crop.width)} × {Math.round(crop.height)} px</span>
              <Button className="link-button" onPress={resetCrop}>Restablecer recorte</Button>
            </div>
          </div>

          <div className="card controls-card">
            <div className="form-grid">
              <label className="field">
                <span>Ancho final (px)</span>
                <input type="number" min={1} value={targetWidth} onChange={(e) => updateTargetWidth(Number(e.target.value))} />
              </label>
              <label className="field">
                <span>Alto final (px)</span>
                <input type="number" min={1} value={targetHeight} onChange={(e) => updateTargetHeight(Number(e.target.value))} />
              </label>

              <label className="checkbox-field">
                <input type="checkbox" checked={lockAspect} onChange={(e) => setLockAspect(e.target.checked)} />
                <span>Mantener proporción</span>
              </label>

              {!lockAspect && (
                <label className="checkbox-field">
                  <input type="checkbox" checked={fitAndFill} onChange={(e) => setFitAndFill(e.target.checked)} />
                  <span>Ajustar manualmente</span>
                </label>
              )}

              <label className="field">
                <span>Formato de salida</span>
                <select value={format} onChange={(e) => setFormat(e.target.value as OutputFormat)}>
                  {OUTPUT_FORMATS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>

              {selectedInfo.qualityControl && (
                <label className="field">
                  <span>Calidad: {quality}%</span>
                  <input type="range" min="1" max="100" value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
                </label>
              )}

              {!selectedInfo.alpha && (
                <label className="field">
                  <span>Fondo para transparencia</span>
                  <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} />
                </label>
              )}
            </div>

            {selectedInfo.notes && <p className="muted">{selectedInfo.notes}</p>}

            <Button className="primary" isDisabled={busy} onPress={applyAndDownload}>
              {busy ? 'Procesando…' : 'Aplicar y descargar'}
            </Button>
          </div>
        </div>
      )}

      {showManualPlacement && frame && crop && (
        <div className="card placement-card">
          <div className="section-heading-row">
            <h3>Posición en el nuevo tamaño</h3>
            <Button className="link-button" onPress={resetManualPlacement}>Centrar</Button>
          </div>
          <p className="muted">Arrastra la imagen para posicionarla dentro del recuadro de {targetWidth} × {targetHeight} px.</p>
          <div
            className="crop-stage"
            style={{
              width: frameDisplayWidth,
              height: frameDisplayHeight,
              ...(selectedInfo.alpha ? {} : { backgroundImage: 'none', backgroundColor: background }),
            }}
          >
            <canvas
              ref={frameImageCanvasRef}
              className="frame-image"
              style={{
                left: manualOffsetX * frameScale,
                top: manualOffsetY * frameScale,
                width: crop.width * manualScale * frameScale,
                height: crop.height * manualScale * frameScale,
              }}
              onPointerDown={beginFrameDrag}
            />
          </div>
          <label className="field">
            <span>Zoom: {containScale > 0 ? Math.round((manualScale / containScale) * 100) : 100}%</span>
            <input
              type="range"
              min="10"
              max="500"
              value={containScale > 0 ? Math.round((manualScale / containScale) * 100) : 100}
              onChange={(e) => updateManualZoom(Number(e.target.value))}
            />
          </label>
        </div>
      )}

      {status && <div className="toast" role="status">{status}</div>}
    </section>
  );
}

function resolveDrag(drag: DragState, dxImage: number, dyImage: number, frameWidth: number, frameHeight: number): CropRect {
  const { mode, crop } = drag;

  if (mode === 'move') {
    const x = clamp(crop.x + dxImage, 0, frameWidth - crop.width);
    const y = clamp(crop.y + dyImage, 0, frameHeight - crop.height);
    return { x, y, width: crop.width, height: crop.height };
  }

  if (mode === 'nw') {
    const newX = clamp(crop.x + dxImage, 0, crop.x + crop.width - MIN_CROP_SIZE);
    const newY = clamp(crop.y + dyImage, 0, crop.y + crop.height - MIN_CROP_SIZE);
    return { x: newX, y: newY, width: crop.x + crop.width - newX, height: crop.y + crop.height - newY };
  }

  if (mode === 'ne') {
    const newY = clamp(crop.y + dyImage, 0, crop.y + crop.height - MIN_CROP_SIZE);
    const newWidth = clamp(crop.width + dxImage, MIN_CROP_SIZE, frameWidth - crop.x);
    return { x: crop.x, y: newY, width: newWidth, height: crop.y + crop.height - newY };
  }

  if (mode === 'sw') {
    const newX = clamp(crop.x + dxImage, 0, crop.x + crop.width - MIN_CROP_SIZE);
    const newHeight = clamp(crop.height + dyImage, MIN_CROP_SIZE, frameHeight - crop.y);
    return { x: newX, y: crop.y, width: crop.x + crop.width - newX, height: newHeight };
  }

  const newWidth = clamp(crop.width + dxImage, MIN_CROP_SIZE, frameWidth - crop.x);
  const newHeight = clamp(crop.height + dyImage, MIN_CROP_SIZE, frameHeight - crop.y);
  return { x: crop.x, y: crop.y, width: newWidth, height: newHeight };
}
