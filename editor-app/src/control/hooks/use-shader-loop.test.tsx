// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mapRefs } from '../map/map-refs';
import { useControlStore } from '../store/control-store';
import { useShaderLoop } from './use-shader-loop';

// Layer finti: registrano le chiamate a render(). I veri vivono in
// public/shared/shader-effects.js (script classico, non importabile).
const shaderRender = vi.fn();
const aoeRender = vi.fn();
const pingRender = vi.fn();

describe('useShaderLoop: niente da disegnare', () => {
  const g = globalThis as Record<string, unknown>;

  beforeEach(() => {
    shaderRender.mockClear(); aoeRender.mockClear(); pingRender.mockClear();
    g.ShaderLayer = class { render = shaderRender; };
    g.AoeShaderLayer = class { render = aoeRender; };
    g.PingLayer = class { render = pingRender; };
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const fit = document.createElement('div');
    for (const id of ['map-shader-canvas', 'map-aoe-shader-canvas', 'map-ping-canvas']) {
      const c = document.createElement('canvas');
      c.id = id;
      fit.appendChild(c);
    }
    mapRefs.fitBox = fit;
    useControlStore.setState({ server: null, previewLocationId: null });
  });

  afterEach(() => {
    delete g.ShaderLayer; delete g.AoeShaderLayer; delete g.PingLayer;
    vi.unstubAllGlobals();
    mapRefs.fitBox = null;
  });

  it('chiama render([]) sui layer shader e aoe invece di pulire il canvas a mano', () => {
    const { unmount } = renderHook(() => useShaderLoop());
    expect(shaderRender).toHaveBeenCalledTimes(1);
    expect(shaderRender.mock.calls[0][0]).toEqual([]);
    expect(aoeRender).toHaveBeenCalledTimes(1);
    expect(aoeRender.mock.calls[0][0]).toEqual([]);
    unmount();
  });
});
