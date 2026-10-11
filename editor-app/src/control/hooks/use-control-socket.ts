import { useEffect } from 'react';
import { socket } from '@/lib/socket';
import { pingBuffer } from '../lib/ping';
import { useControlStore } from '../store/control-store';
import { kickShaderLoop } from './use-shader-loop';
import type { ControlState } from '../types';

// Registra i listener socket del pannello di controllo. Da chiamare una sola
// volta da ControlApp.
export function useControlSocket(): void {
  useEffect(() => {
    const st = () => useControlStore.getState();
    let feedbackTimeout: ReturnType<typeof setTimeout> | undefined;

    const hello = () => socket.emit('hello', { role: 'control' });
    const onConnect = () => { st().setConnected(true); hello(); };
    const onDisconnect = () => {
      st().setConnected(false);
      // Un invio in corso non riceverà mai la sua risposta se la
      // riconnessione ottiene un nuovo socket id: senza reset il flag
      // resterebbe a true per sempre.
      st().setTelegram({ pending: false, feedback: null });
      clearTimeout(feedbackTimeout);
    };
    const onDisplayStatus = ({ connected }: { connected: boolean }) => st().setDisplayConnected(connected);
    const onState = (s: ControlState) => st().receiveState(s);
    const onTelegram = ({ imageId, ok, error }: { imageId: string; ok: boolean; error?: string }) => {
      st().setTelegram({ pending: false, feedback: { imageId, ok, error } });
      clearTimeout(feedbackTimeout);
      feedbackTimeout = setTimeout(() => st().setTelegram({ feedback: null }), 4000);
    };

    // Eco del ping (il server rilancia a tutti, mittente incluso): anche il
    // proprio ping arriva da qui, non dal gesto. Nessun filtro per
    // locationId: il broadcast non lo include, e il gesto parte solo quando
    // l'anteprima coincide con la location attiva (selectPingAvailable).
    const onPing = ({ x, y, strokeId }: { x: unknown; y: unknown; strokeId?: string }) => {
      if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return;
      pingBuffer.push({ x, y, t: performance.now(), strokeId });
      kickShaderLoop();
    };

    socket.on('connect', onConnect);
    socket.on('ping:show', onPing);
    socket.on('disconnect', onDisconnect);
    socket.on('display:status', onDisplayStatus);
    socket.on('state:update', onState);
    socket.on('telegram:sendResult', onTelegram);
    // Gia connesso al mount (StrictMode/HMR): l'evento 'connect' e passato.
    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('ping:show', onPing);
      socket.off('disconnect', onDisconnect);
      socket.off('display:status', onDisplayStatus);
      socket.off('state:update', onState);
      socket.off('telegram:sendResult', onTelegram);
      clearTimeout(feedbackTimeout);
    };
  }, []);
}
