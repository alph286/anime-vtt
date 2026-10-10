import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Senza `globals: true` RTL non registra il cleanup da solo.
afterEach(() => cleanup());
