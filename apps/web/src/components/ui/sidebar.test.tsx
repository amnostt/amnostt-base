import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sidebar, SidebarProvider, SidebarTrigger } from './sidebar';

function setMobileViewport(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.cookie = 'sidebar_state=; Max-Age=0; path=/';
});

describe('Sidebar', () => {
  it('toggles the desktop sidebar and persists its state', async () => {
    setMobileViewport(false);
    render(
      <SidebarProvider>
        <Sidebar>
          <span>Navigation</span>
        </Sidebar>
        <SidebarTrigger />
      </SidebarProvider>,
    );

    const sidebar = screen.getByRole('complementary', {
      name: 'Sidebar',
      hidden: true,
    });
    expect(sidebar).toHaveAttribute('data-state', 'expanded');

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Toggle sidebar' }));

    expect(sidebar).toHaveAttribute('data-state', 'collapsed');
    expect(document.cookie).toContain('sidebar_state=false');
  });

  it('restores a persisted collapsed state on the next provider mount', () => {
    setMobileViewport(false);
    document.cookie = 'sidebar_state=false; path=/';

    render(
      <SidebarProvider>
        <Sidebar>
          <span>Navigation</span>
        </Sidebar>
      </SidebarProvider>,
    );

    expect(
      screen.getByRole('complementary', { name: 'Sidebar' }),
    ).toHaveAttribute('data-state', 'collapsed');
  });

  it('uses a mobile drawer state when the viewport is narrow', async () => {
    setMobileViewport(true);
    render(
      <SidebarProvider>
        <Sidebar>
          <span>Navigation</span>
        </Sidebar>
        <SidebarTrigger />
      </SidebarProvider>,
    );

    const sidebar = screen.getByRole('complementary', { hidden: true });
    expect(sidebar).toHaveAttribute('data-mobile', 'true');
    expect(sidebar).toHaveAttribute('aria-hidden', 'true');

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Toggle sidebar' }));

    expect(sidebar).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByText('Navigation')).toBeVisible();
  });
});
