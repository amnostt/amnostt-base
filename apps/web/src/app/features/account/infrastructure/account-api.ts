import { inject, Service } from '@angular/core';
import { AuthenticatedApiClient } from '@/core/http/authenticated-api-client';
import type {
  GoogleLinkChallenge,
  GoogleLinkResult,
  GoogleLinkStatus,
} from '@/features/auth/domain/auth-models';

@Service()
export class AccountApi {
  private readonly client = inject(AuthenticatedApiClient);

  async googleStatus(): Promise<GoogleLinkStatus> {
    const response = await this.client.get<{ data: GoogleLinkStatus }>('/auth/google/status');
    return response.data;
  }

  async createGoogleLinkChallenge(): Promise<GoogleLinkChallenge> {
    const response = await this.client.post<{ data: GoogleLinkChallenge }>(
      '/auth/google/link/challenge',
      null,
    );
    return response.data;
  }

  async linkGoogle(input: { challengeId: string; credential: string }): Promise<GoogleLinkResult> {
    const response = await this.client.post<{ data: GoogleLinkResult }>('/auth/google/link', input);
    return response.data;
  }
}
