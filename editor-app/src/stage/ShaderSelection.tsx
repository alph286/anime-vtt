import { CORNERS, rectCorners, type Corner } from '@/lib/shader-math';
import { selectActiveLocation, useEditorStore } from '@/store/editor-store';
import { startShaderResize } from './actions';

export function ShaderSelection() {
  const location = useEditorStore(selectActiveLocation);
  const selectedId = useEditorStore((s) => s.selectedShaderId);
  const rect = useEditorStore((s) => s.geometry.imageRect);
  const naturalW = useEditorStore((s) => s.geometry.naturalW);
  const naturalH = useEditorStore((s) => s.geometry.naturalH);
  const deco = location && selectedId ? location.map.shaders.find((d) => d.id === selectedId) : undefined;
  if (!location || !deco || !rect || !naturalW || !naturalH) return null;

  const r = shaderDecorationRectPercent(deco, location.map.grid, naturalW, naturalH);
  const left = (r.leftPct / 100) * rect.width;
  const top = (r.topPct / 100) * rect.height;
  const width = (r.widthPct / 100) * rect.width;
  const height = (r.heightPct / 100) * rect.height;
  // rectCorners lavora su qualsiasi quadrupla left/top/width/height: qui in pixel.
  const corners = rectCorners({ leftPct: left, topPct: top, widthPct: width, heightPct: height });

  return (
    <>
      <div className="shader-box" style={{ left, top, width, height }} />
      {CORNERS.map((c: Corner) => (
        <div
          key={c}
          className={`shader-handle shader-handle-${c}`}
          style={{ left: corners[c][0], top: corners[c][1] }}
          onPointerDown={(e) => { e.stopPropagation(); if (e.button !== 0) return; startShaderResize(c); }}
        />
      ))}
    </>
  );
}
