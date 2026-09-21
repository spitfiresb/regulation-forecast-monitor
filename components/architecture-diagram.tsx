"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize, Minus, Plus } from "lucide-react";

export type DiagramNode = {
  id: string;
  title: string;
  description: string;
  x: number;
  y: number;
  tone?: "source" | "storage" | "optional";
  keys?: string;
};
export type DiagramEdge = {
  path: string;
  label?: string;
  x?: number;
  y?: number;
};
type View = { x: number; y: number; scale: number };
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2.5;

export function ArchitectureDiagram({
  title,
  description,
  nodes,
  edges,
  width,
  height,
  nodeWidth = 240,
  nodeHeight = 140,
  database = false,
}: {
  title: string;
  description: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  width: number;
  height: number;
  nodeWidth?: number;
  nodeHeight?: number;
  database?: boolean;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; view: View } | null>(
    null,
  );
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [ready, setReady] = useState(false);
  const [dragging, setDragging] = useState(false);

  const fit = useCallback(() => {
    const element = canvas.current;
    if (!element) return;
    const scale = Math.max(
      MIN_ZOOM,
      Math.min(
        1,
        (element.clientWidth - 48) / width,
        (element.clientHeight - 48) / height,
      ),
    );
    setView({
      scale,
      x: (element.clientWidth - width * scale) / 2,
      y: (element.clientHeight - height * scale) / 2,
    });
    setReady(true);
  }, [width, height]);

  const zoom = useCallback(
    (factor: number, point?: { x: number; y: number }) => {
      const element = canvas.current;
      if (!element) return;
      const anchor = point ?? {
        x: element.clientWidth / 2,
        y: element.clientHeight / 2,
      };
      setView((current) => {
        const scale = Math.max(
          MIN_ZOOM,
          Math.min(MAX_ZOOM, current.scale * factor),
        );
        const ratio = scale / current.scale;
        return {
          scale,
          x: anchor.x - (anchor.x - current.x) * ratio,
          y: anchor.y - (anchor.y - current.y) * ratio,
        };
      });
    },
    [],
  );

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = element.getBoundingClientRect();
      zoom(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.008), {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      observer.disconnect();
      element.removeEventListener("wheel", onWheel);
    };
  }, [fit, zoom]);

  function focusNode(node: DiagramNode) {
    const element = canvas.current;
    if (!element) return;
    const scale = Math.min(
      1.5,
      (element.clientWidth - 64) / nodeWidth,
      (element.clientHeight - 64) / nodeHeight,
    );
    setView({
      scale,
      x: element.clientWidth / 2 - (node.x + nodeWidth / 2) * scale,
      y: element.clientHeight / 2 - (node.y + nodeHeight / 2) * scale,
    });
  }

  return (
    <div className="diagram-page">
      <div className="diagram-toolbar">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="zoom-controls" aria-label="Diagram zoom controls">
          <button
            type="button"
            aria-label="Zoom out"
            title="Zoom out (−)"
            disabled={view.scale <= MIN_ZOOM}
            onClick={() => zoom(1 / 1.25)}
          >
            <Minus size={17} />
          </button>
          <output aria-live="polite" aria-label="Zoom level">
            {Math.round(view.scale * 100)}%
          </output>
          <button
            type="button"
            aria-label="Zoom in"
            title="Zoom in (+)"
            disabled={view.scale >= MAX_ZOOM}
            onClick={() => zoom(1.25)}
          >
            <Plus size={17} />
          </button>
          <button
            type="button"
            className="fit-button"
            onClick={fit}
            title="Fit entire diagram (0)"
          >
            <Maximize size={16} /> Fit
          </button>
        </div>
      </div>
      <div
        ref={canvas}
        className={`diagram-viewport${dragging ? " is-dragging" : ""}`}
        role="region"
        aria-label={`${title} canvas`}
        aria-describedby="canvas-help"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (
            [
              "+",
              "=",
              "-",
              "0",
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
            ].includes(event.key)
          )
            event.preventDefault();
          if (event.key === "+" || event.key === "=") zoom(1.25);
          else if (event.key === "-") zoom(1 / 1.25);
          else if (event.key === "0") fit();
          else if (event.key.startsWith("Arrow"))
            setView((current) => ({
              ...current,
              x:
                current.x +
                (event.key === "ArrowLeft"
                  ? 60
                  : event.key === "ArrowRight"
                    ? -60
                    : 0),
              y:
                current.y +
                (event.key === "ArrowUp"
                  ? 60
                  : event.key === "ArrowDown"
                    ? -60
                    : 0),
            }));
        }}
        onPointerDown={(event) => {
          if (
            event.button !== 0 ||
            (event.target as HTMLElement).closest("button")
          )
            return;
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            view,
          };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start || start.id !== event.pointerId) return;
          setView({
            ...start.view,
            x: start.view.x + event.clientX - start.x,
            y: start.view.y + event.clientY - start.y,
          });
        }}
        onPointerUp={(event) => {
          if (drag.current?.id === event.pointerId) {
            drag.current = null;
            setDragging(false);
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
        onLostPointerCapture={() => {
          drag.current = null;
          setDragging(false);
        }}
      >
        <div
          className="diagram-world"
          style={{
            width,
            height,
            visibility: ready ? "visible" : "hidden",
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}
        >
          {database && (
            <div className="diagram-host">
              <strong>Supabase</strong>
              <span>PostgreSQL · public schema</span>
            </div>
          )}
          <svg
            className="diagram-edges"
            width={width}
            height={height}
            aria-hidden="true"
          >
            <defs>
              <marker
                id="edge-arrow"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path
                  d="M 0 0 L 8 4 L 0 8"
                  fill="none"
                  stroke="#8495a7"
                  strokeWidth="1.4"
                />
              </marker>
            </defs>
            {edges.map((edge, index) => (
              <g key={index}>
                <path
                  d={edge.path}
                  fill="none"
                  stroke="#8495a7"
                  strokeWidth="1.5"
                  markerEnd="url(#edge-arrow)"
                />
                {edge.label && (
                  <text
                    x={edge.x}
                    y={edge.y}
                    textAnchor="middle"
                    className="diagram-edge-label"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            ))}
          </svg>
          {nodes.map((node) => (
            <button
              type="button"
              key={node.id}
              className={`diagram-node diagram-node-${node.tone ?? "default"}`}
              style={{
                left: node.x,
                top: node.y,
                width: nodeWidth,
                height: nodeHeight,
              }}
              onClick={() => focusNode(node)}
              aria-label={`Focus ${node.title}: ${node.description}`}
            >
              <h2>{node.title}</h2>
              <p>{node.description}</p>
              {node.keys && <span className="diagram-keys">{node.keys}</span>}
            </button>
          ))}
        </div>
      </div>
      <ol className="diagram-mobile" aria-label={`${title} details`}>
        {nodes.map((node) => (
          <li key={node.id}>
            <h2>{node.title}</h2>
            <p>{node.description}</p>
            {node.keys && <span className="diagram-keys">{node.keys}</span>}
          </li>
        ))}
      </ol>
      <p className="canvas-help" id="canvas-help">
        Drag to pan · Scroll or + / − to zoom · Select a card to focus · Fit to
        reset
      </p>
    </div>
  );
}
