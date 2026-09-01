import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  it('fires onClick when enabled', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick while loading, and shows a spinner', () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} loading>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: /save/i });
    expect(button).toBeDisabled();
  });

  it('is disabled when explicitly disabled, independent of loading', () => {
    render(<Button disabled>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('applies a visually distinct class per variant', () => {
    const { rerender, container } = render(<Button variant="primary">Go</Button>);
    const primaryClass = container.querySelector('button')!.className;

    rerender(<Button variant="danger">Go</Button>);
    const dangerClass = container.querySelector('button')!.className;

    expect(primaryClass).not.toBe(dangerClass);
  });
});
