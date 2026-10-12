import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import '../src/party/party.css';
import PartyApp from '../src/party/PartyApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PartyApp />
  </StrictMode>
);
