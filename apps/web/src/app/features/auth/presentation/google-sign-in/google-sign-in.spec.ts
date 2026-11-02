import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import {
  GoogleIdentityAdapter,
  GoogleIdentityApi,
  GoogleSignInButton,
  GoogleSignInRequest,
} from './google-sign-in';

describe('GoogleSignInButton', () => {
  let fixture: ComponentFixture<GoogleSignInButton>;
  let adapter: { load: ReturnType<typeof vi.fn> };
  let google: GoogleIdentityApi;
  const request: GoogleSignInRequest = {
    clientId: 'google-client-id',
    nonce: 'nonce-value',
    text: 'continue_with',
  };

  beforeEach(async () => {
    google = {
      initialize: vi.fn(),
      renderButton: vi.fn(),
    };
    adapter = { load: vi.fn().mockResolvedValue(google) };
    await TestBed.configureTestingModule({
      imports: [GoogleSignInButton],
      providers: [{ provide: GoogleIdentityAdapter, useValue: adapter }],
    }).compileComponents();
    fixture = TestBed.createComponent(GoogleSignInButton);
  });

  it('loads GIS once for a request and renders the official popup button with the nonce', async () => {
    fixture.componentRef.setInput('request', request);
    await fixture.whenStable();

    expect(adapter.load).toHaveBeenCalledOnce();
    expect(google.initialize).toHaveBeenCalledWith({
      client_id: request.clientId,
      nonce: request.nonce,
      ux_mode: 'popup',
      callback: expect.any(Function),
    });
    expect(google.renderButton).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ text: 'continue_with' }),
    );
  });

  it('emits only a current credential and ignores a stale callback after reset', async () => {
    const credential = vi.fn();
    fixture.componentInstance.credential.subscribe(credential);
    fixture.componentRef.setInput('request', request);
    await fixture.whenStable();

    const callback = vi.mocked(google.initialize).mock.calls[0][0].callback;
    callback({ credential: 'credential-value' });
    expect(credential).toHaveBeenCalledWith('credential-value');

    fixture.componentRef.setInput('request', null);
    await fixture.whenStable();
    callback({ credential: 'stale-credential' });
    expect(credential).toHaveBeenCalledTimes(1);
  });

  it('reports a bounded SDK failure without exposing provider details', async () => {
    adapter.load.mockRejectedValue(new Error('private provider script detail'));
    const failure = vi.fn();
    fixture.componentInstance.failed.subscribe(failure);
    fixture.componentRef.setInput('request', request);
    await fixture.whenStable();

    expect(failure).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.textContent).toContain('No pudimos cargar Google.');
    expect(fixture.nativeElement.textContent).not.toContain('private provider script detail');
  });
});
