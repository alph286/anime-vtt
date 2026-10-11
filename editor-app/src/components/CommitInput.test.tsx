// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommitInput } from './CommitInput';

describe('CommitInput', () => {
  it('commit su blur solo se il testo è cambiato', () => {
    const onCommit = vi.fn();
    render(<CommitInput value="Taverna" onCommit={onCommit} placeholder="nome" />);
    const input = screen.getByPlaceholderText('nome');
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Locanda' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('Locanda');
  });

  it('blur senza modifiche non committa nemmeno se il prop è cambiato mentre era a fuoco', () => {
    const onCommit = vi.fn();
    const { rerender } = render(<CommitInput value="Taverna" onCommit={onCommit} placeholder="nome" />);
    const input = screen.getByPlaceholderText('nome') as HTMLInputElement;
    fireEvent.focus(input);
    rerender(<CommitInput value="Rinominata" onCommit={onCommit} placeholder="nome" />);
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('Rinominata');
  });

  it('Invio fa blur e conferma', () => {
    const onCommit = vi.fn();
    render(<CommitInput value="A" onCommit={onCommit} placeholder="n" />);
    const input = screen.getByPlaceholderText('n') as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: 'B' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('B');
  });

  it('conserva i caratteri speciali senza alterarli', () => {
    const onCommit = vi.fn();
    render(<CommitInput value="x" onCommit={onCommit} placeholder="n" />);
    const input = screen.getByPlaceholderText('n');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '<b>"A" & B</b>' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('<b>"A" & B</b>');
  });
});
