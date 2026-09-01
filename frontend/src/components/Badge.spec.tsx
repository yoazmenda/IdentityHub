import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SeverityBadge, StatusBadge } from './Badge';

describe('SeverityBadge', () => {
  it.each([
    ['critical', 'text-red-700'],
    ['high', 'text-orange-700'],
    ['medium', 'text-amber-800'],
    ['low', 'text-blue-700'],
  ] as const)('renders %s with a distinct color (%s)', (severity, expectedClass) => {
    render(<SeverityBadge severity={severity} />);
    const badge = screen.getByText(severity);
    expect(badge).toHaveClass(expectedClass);
  });

  it('renders every severity with a different color class from the others', () => {
    const classes = (['critical', 'high', 'medium', 'low'] as const).map((severity) => {
      const { container, unmount } = render(<SeverityBadge severity={severity} />);
      const cls = container.querySelector('span')!.className;
      unmount();
      return cls;
    });
    expect(new Set(classes).size).toBe(4);
  });
});

describe('StatusBadge', () => {
  it('renders open and resolved with different colors', () => {
    const { container: openContainer } = render(<StatusBadge status="open" />);
    const { container: resolvedContainer } = render(<StatusBadge status="resolved" />);
    expect(openContainer.querySelector('span')!.className).not.toBe(
      resolvedContainer.querySelector('span')!.className,
    );
  });
});
