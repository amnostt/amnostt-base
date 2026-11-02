import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Service } from '@angular/core';

export interface GoogleIdentityCredential {
  credential: string;
}

export interface GoogleIdentityApi {
  initialize(options: {
    client_id: string;
    nonce: string;
    callback: (response: GoogleIdentityCredential) => void;
    ux_mode: 'popup';
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      theme: 'outline';
      size: 'large';
      text: 'signin_with' | 'continue_with';
      width?: number;
    },
  ): void;
}

export interface GoogleSignInRequest {
  clientId: string;
  nonce: string;
  text: 'signin_with' | 'continue_with';
}

interface GoogleWindow extends Window {
  google?: { accounts?: { id?: GoogleIdentityApi } };
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdentityApi } };
  }
}

let gisLoad: Promise<GoogleIdentityApi> | undefined;

@Service()
export class GoogleIdentityAdapter {
  private readonly document = inject(DOCUMENT);

  load(): Promise<GoogleIdentityApi> {
    const existing = (this.document.defaultView as GoogleWindow | null)?.google?.accounts?.id;
    if (existing) return Promise.resolve(existing);
    if (gisLoad) return gisLoad;

    gisLoad = new Promise<GoogleIdentityApi>((resolve, reject) => {
      const current = (this.document.defaultView as GoogleWindow | null)?.google?.accounts?.id;
      if (current) {
        resolve(current);
        return;
      }

      const script = this.document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.id = 'google-identity-services-script';
      const timeout = this.document.defaultView?.setTimeout(() => {
        reject(new Error('Google Identity Services did not load'));
      }, 8000);
      script.onload = () => {
        if (timeout) this.document.defaultView?.clearTimeout(timeout);
        const api = (this.document.defaultView as GoogleWindow | null)?.google?.accounts?.id;
        if (api) {
          resolve(api);
        } else {
          reject(new Error('Google Identity Services API is unavailable'));
        }
      };
      script.onerror = () => {
        if (timeout) this.document.defaultView?.clearTimeout(timeout);
        reject(new Error('Google Identity Services failed to load'));
      };
      this.document.head.appendChild(script);
    }).catch((error) => {
      gisLoad = undefined;
      throw error;
    });

    return gisLoad;
  }
}

@Component({
  selector: 'app-google-sign-in',
  template: `
    <div #buttonContainer data-google-button></div>
    @if (isLoading()) {
      <p role="status" class="text-muted-foreground text-sm">Preparando Google…</p>
    }
    @if (hasFailed()) {
      <p role="alert" class="text-destructive text-sm">No pudimos cargar Google.</p>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoogleSignInButton {
  private readonly adapter = inject(GoogleIdentityAdapter);
  private readonly destroyRef = inject(DestroyRef);
  private readonly buttonContainer = viewChild<ElementRef<HTMLDivElement>>('buttonContainer');
  private flowRevision = 0;

  readonly request = input<GoogleSignInRequest | null>(null);
  readonly credential = output<string>();
  readonly failed = output<void>();
  protected readonly isLoading = signal(false);
  protected readonly hasFailed = signal(false);

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.flowRevision++;
    });

    effect(() => {
      const request = this.request();
      const container = this.buttonContainer()?.nativeElement;
      if (!container) return;

      const revision = ++this.flowRevision;
      container.replaceChildren();
      this.hasFailed.set(false);
      if (!request) {
        this.isLoading.set(false);
        return;
      }

      this.isLoading.set(true);
      void this.mount(request, container, revision);
    });
  }

  private async mount(
    request: GoogleSignInRequest,
    container: HTMLDivElement,
    revision: number,
  ): Promise<void> {
    try {
      const google = await this.adapter.load();
      if (revision !== this.flowRevision || !this.request() || !container.isConnected) return;

      google.initialize({
        client_id: request.clientId,
        nonce: request.nonce,
        ux_mode: 'popup',
        callback: (response) => {
          if (revision === this.flowRevision && this.request() && response.credential) {
            this.credential.emit(response.credential);
          }
        },
      });
      google.renderButton(container, {
        theme: 'outline',
        size: 'large',
        text: request.text,
        width: 320,
      });
      this.isLoading.set(false);
    } catch {
      if (revision !== this.flowRevision || !this.request()) return;
      this.isLoading.set(false);
      this.hasFailed.set(true);
      this.failed.emit();
    }
  }
}
