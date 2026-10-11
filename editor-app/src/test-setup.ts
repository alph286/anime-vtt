import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { loadSharedGlobals } from './test-load-shared';

loadSharedGlobals();

// Senza `globals: true` RTL non registra il cleanup da solo.
afterEach(() => cleanup());
