import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import ControlApp from '../src/control/ControlApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ControlApp />
  </StrictMode>
);
