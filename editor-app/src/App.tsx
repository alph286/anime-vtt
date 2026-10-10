import { useEffect, useRef } from 'react';
import { socket } from '@/lib/socket';
import { useEditorStore } from '@/store/editor-store';
import { Header } from '@/toolbar/Header';
import { OptionsBar } from '@/toolbar/OptionsBar';
import { Sidebar } from '@/sidebar/Sidebar';
import { MapStage, type MapMedia } from '@/stage/MapStage';
import { CompassHandle } from '@/stage/CompassHandle';
import { MenuBar } from '@/menus/MenuBar';
import type { VttState } from '@/types';

export default function App() {
  const mediaRef = useRef<MapMedia | null>(null);
  useEffect(() => {
    const onConnect = () => socket.emit('hello', { role: 'editor' });
    const onState = (s: VttState) => useEditorStore.getState().receiveState(s);
    socket.on('connect', onConnect);
    socket.on('state:update', onState);
    if (socket.connected) onConnect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('state:update', onState);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      if (e.target instanceof Element && e.target.matches('input, textarea')) return;
      e.preventDefault();
      if (key === 'z') useEditorStore.getState().undoAction();
      else useEditorStore.getState().redoAction();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-dvh flex-col">
      <Header menus={<MenuBar />} />
      <OptionsBar />
      <main className="flex min-h-0 flex-1">
        <MapStage mediaRef={mediaRef} wrapChildren={<CompassHandle />} />
        <Sidebar panels={{}} />
      </main>
    </div>
  );
}
