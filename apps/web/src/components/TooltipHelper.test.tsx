import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SimpleTooltip, TooltipHelper } from './TooltipHelper';

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({
      matches,
      media: '',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe('TooltipHelper touch behavior', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens a popover for passive help triggers on touch devices', () => {
    mockMatchMedia(true);

    render(<TooltipHelper content="Tap help content" />);

    fireEvent.click(screen.getByRole('button', { name: 'Help' }));

    expect(screen.getByText('Tap help content')).toBeTruthy();
  });

  it('preserves interactive TooltipHelper triggers on touch devices', () => {
    mockMatchMedia(true);

    const handleClick = vi.fn();

    render(
      <TooltipHelper
        content="Extra help"
        icon={false}
        trigger={<button onClick={handleClick}>Open details</button>}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open details' }));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('preserves interactive SimpleTooltip children on touch devices', () => {
    mockMatchMedia(true);

    const handleClick = vi.fn();

    render(
      <SimpleTooltip content="Row note preview">
        <button onClick={handleClick}>View note</button>
      </SimpleTooltip>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'View note' }));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
