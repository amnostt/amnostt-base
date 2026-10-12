import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Hello, web-angular');
  });

  it('renders the Zard default button as one native button', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const buttons = fixture.nativeElement.querySelectorAll('button');
    expect(buttons).toHaveLength(1);

    const button = buttons[0] as HTMLButtonElement;
    expect(button.type).toBe('button');
    expect(button.textContent?.trim()).toBe('Test Zard UI');
    expect(button.getAttribute('data-slot')).toBe('button');
    expect(button.getAttribute('data-variant')).toBe('default');
  });
});
