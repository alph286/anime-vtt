// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tabs } from '@/components/ui/tabs';
import { TabBar } from './TabBar';

describe('TabBar', () => {
  it('le schede non mostrano contorno/anello di focus ambra (--ring) con !', () => {
    render(<Tabs value="fog"><TabBar /></Tabs>);
    for (const name of ['Fog', 'Immagini']) {
      const cls = screen.getByRole('tab', { name }).className;
      expect(cls).toContain('focus-visible:ring-0!');
      expect(cls).toContain('focus-visible:border-transparent!');
      expect(cls).toContain('focus-visible:outline-none!');
    }
  });
});
