import { TestBed } from '@angular/core/testing';
import type {
  GoogleLinkChallenge,
  GoogleLinkResult,
  GoogleLinkStatus,
} from '../../auth/domain/auth-models';
import { AuthenticatedApiClient } from '../../auth/../../core/http/authenticated-api-client';
import { AccountApi } from './account-api';

describe('AccountApi', () => {
  let service: AccountApi;
  let client: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };

  const status: GoogleLinkStatus = {
    provider: 'google',
    enabled: true,
    clientId: 'google-client-id',
    linked: false,
  };
  const challenge: GoogleLinkChallenge = {
    challengeId: 'challenge-id',
    nonce: 'nonce-value',
    expiresAt: '2030-01-01T00:00:00.000Z',
  };
  const result: GoogleLinkResult = { provider: 'google', linked: true };

  beforeEach(() => {
    client = { get: vi.fn(), post: vi.fn() };
    TestBed.configureTestingModule({
      providers: [AccountApi, { provide: AuthenticatedApiClient, useValue: client }],
    });
    service = TestBed.inject(AccountApi);
  });

  it('loads status through the authenticated client without changing the response contract', async () => {
    client.get.mockResolvedValue({ data: status });

    await expect(service.googleStatus()).resolves.toEqual(status);
    expect(client.get).toHaveBeenCalledWith('/auth/google/status');
  });

  it('creates a protected challenge without a request body', async () => {
    client.post.mockResolvedValue({ data: challenge });

    await expect(service.createGoogleLinkChallenge()).resolves.toEqual(challenge);
    expect(client.post).toHaveBeenCalledWith('/auth/google/link/challenge', null);
  });

  it('completes linking through the authenticated client', async () => {
    client.post.mockResolvedValue({ data: result });

    await expect(
      service.linkGoogle({ challengeId: 'challenge-id', credential: 'credential-value' }),
    ).resolves.toEqual(result);
    expect(client.post).toHaveBeenCalledWith('/auth/google/link', {
      challengeId: 'challenge-id',
      credential: 'credential-value',
    });
  });
});
