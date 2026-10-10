// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NumberField } from './NumberField';

describe('NumberField', () => {
  it('limita al massimo e normalizza il testo al blur', () => {
    const onCommit = vi.fn();
    render(<NumberField aria-label="n" value={50} min={0} max={100} onCommit={onCommit} />);
    const input = screen.getByLabelText('n') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '150' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(100);
    expect(input.value).toBe('100');
  });

  it('valore non valido: ripristina senza chiamare onCommit', () => {
    const onCommit = vi.fn();
    render(<NumberField aria-label="n" value={50} min={0} max={100} onCommit={onCommit} />);
    const input = screen.getByLabelText('n') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('50');
  });

  it('con live applica durante la digitazione', () => {
    const onCommit = vi.fn();
    render(<NumberField aria-label="n" live value={100} min={25} max={1000} onCommit={onCommit} />);
    const input = screen.getByLabelText('n');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '200' } });
    expect(onCommit).toHaveBeenCalledWith(200);
  });

  it('senza modifiche non emette al blur', () => {
    const onCommit = vi.fn();
    render(<NumberField aria-label="n" value={50} min={0} max={100} onCommit={onCommit} />);
    const input = screen.getByLabelText('n');
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
  });
});
