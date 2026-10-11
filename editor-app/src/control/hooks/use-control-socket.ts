import { useEffect } from 'react';
import { socket } from '@/lib/socket';
import { useControlStore } from '../store/control-store';
import type { ControlState } from '../types';

// Registra i listener socket del pannello di controllo. Da chiamare una sola
// volta da ControlApp. (Il listener di `ping:show` e gestito altrove.)
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

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('display:status', onDisplayStatus);
    socket.on('state:update', onState);
    socket.on('telegram:sendResult', onTelegram);
    // Gia connesso al mount (StrictMode/HMR): l'evento 'connect' e passato.
    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('display:status', onDisplayStatus);
      socket.off('state:update', onState);
      socket.off('telegram:sendResult', onTelegram);
      clearTimeout(feedbackTimeout);
    };
  }, []);
}
