import { useEffect, useRef } from 'react';
import type { Camera } from '../core/camera';
import type { WhiteboardDocument } from '../core/scene';
import {
  InteractionController,
  type ControllerHooks,
} from '../interaction/controller';
import { renderScene } from '../render/renderer';

interface CanvasViewProps {
  doc: WhiteboardDocument;
  camera: Camera;
  selection: readonly string[];
  /** Bumps on every state change, including transient drag previews. */
  version: number;
  hooks: ControllerHooks;
  controllerRef: React.MutableRefObject<InteractionController | null>;
  onViewportSize: (w: number, h: number) => void;
  children?: React.ReactNode;
}

export function CanvasView(props: CanvasViewProps): React.JSX.Element {
  const { doc, camera, selection, version, hooks, controllerRef, onViewportSize } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  // Create the interaction controller once.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = new InteractionController(canvas, hooks);
    controllerRef.current = controller;
    return () => {
      cancelAnimationFrame(rafRef.current);
      controller.destroy();
      controllerRef.current = null;
    };
  }, []);

  // Redraw on any state change, coalesced to one paint per animation frame
  // so rapid pointermove bumps don't queue redundant full redraws.
  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const c = controllerRef.current;
      renderScene(ctx, w, h, {
        doc,
        camera,
        selection,
        previewShapes: c ? c.previewShapes : new Map(),
        createPreview: c ? c.createPreview : null,
        marquee: c ? c.marquee : null,
        guides: c ? c.guides : null,
      });
    });
  }, [doc, camera, selection, version, controllerRef]);

  // Track container size; canvas backing store follows devicePixelRatio.
  // Resetting canvas.width/height always clears its bitmap, so only do it
  // when the size actually changed — and schedule a redraw afterwards.
  // (On mobile the viewport height changes when the browser chrome
  // shows/hides; without the redraw the canvas stays blank until the next
  // interaction.)
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      onViewportSize(rect.width, rect.height);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        hooks.onChange();
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();
    return () => ro.disconnect();
  }, []);

  return (
    <div className="canvas-wrap" ref={containerRef}>
      <canvas ref={canvasRef} aria-label="Whiteboard canvas" />
      {props.children}
    </div>
  );
}
