import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BreakpointObserver, MediaMatcher } from '@angular/cdk/layout';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { provideZard } from '@/shared/zard/core/provider/providezard';
import { ZardDarkMode } from '@/shared/zard/services/dark-mode';
import { AppShell } from './app-shell';

describe('AppShell', () => {
  let component: AppShell;
  let fixture: ComponentFixture<AppShell>;
  let storedTheme: string | null;
  let originalHtmlClass: string;
  let originalDataTheme: string | null;

  beforeEach(async () => {
    storedTheme = localStorage.getItem('theme');
    originalHtmlClass = document.documentElement.className;
    originalDataTheme = document.documentElement.getAttribute('data-theme');
    localStorage.setItem('theme', 'light');

    await TestBed.configureTestingModule({
      imports: [AppShell],
      providers: [
        provideRouter([]),
        provideZard(),
        {
          provide: MediaMatcher,
          useValue: {
            matchMedia: () => ({
              matches: false,
              addEventListener: vi.fn(),
              removeEventListener: vi.fn(),
            }),
          },
        },
        {
          provide: BreakpointObserver,
          useValue: { observe: () => of({ matches: false, breakpoints: {} }) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppShell);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture?.destroy();
    if (storedTheme === null) {
      localStorage.removeItem('theme');
    } else {
      localStorage.setItem('theme', storedTheme);
    }
    document.documentElement.className = originalHtmlClass;
    if (originalDataTheme === null) {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', originalDataTheme);
    }
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the theme icons and switches between light and dark modes', async () => {
    const button = fixture.nativeElement.querySelector(
      'header button[z-button]',
    ) as HTMLButtonElement;
    const expectTheme = (theme: 'light' | 'dark', icon: string, label: string) => {
      expect(TestBed.inject(ZardDarkMode).themeMode()).toBe(theme);
      expect(document.documentElement.classList.contains('dark')).toBe(theme === 'dark');
      expect(localStorage.getItem('theme')).toBe(theme);
      expect(button.getAttribute('aria-label')).toBe(label);
      const renderedIcon = button.querySelector('ng-icon');
      expect(renderedIcon?.getAttribute('name')).toBe(icon);
      expect(renderedIcon?.querySelector('svg path, svg circle')).not.toBeNull();
    };

    expectTheme('light', 'lucideMoon', 'Activar modo oscuro');
    button.click();
    await fixture.whenStable();
    expectTheme('dark', 'lucideSun', 'Activar modo claro');
    button.click();
    await fixture.whenStable();
    expectTheme('light', 'lucideMoon', 'Activar modo oscuro');
  });

  it('uses an icon button with balanced header spacing and no diagnostic border', () => {
    const header = fixture.nativeElement.querySelector('header') as HTMLElement;
    const button = header.querySelector('button[z-button]') as HTMLButtonElement;
    expect(header.classList.contains('px-4')).toBe(true);
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('data-size')).toBe('icon');
    expect(header.querySelector('.border-red-400')).toBeNull();
  });

  it('preserves the sidebar trigger, breadcrumb link, and page title', () => {
    const header = fixture.nativeElement.querySelector('header') as HTMLElement;
    expect(header.querySelector('[z-sidebar-trigger]')?.getAttribute('aria-label')).toBe(
      'Alternar barra lateral',
    );
    const link = header.querySelector('a[z-breadcrumb-link]');
    expect(link?.getAttribute('href')).toBe('/');
    expect(link?.textContent).toContain('Amnostt Base');
    expect(header.querySelector('[z-breadcrumb-page]')?.textContent).toBe(document.title);
  });
});
