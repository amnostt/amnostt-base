import { ConfigService } from '@nestjs/config';
import { OAuth2Client, type LoginTicket } from 'google-auth-library';
import { GoogleTokenVerifier } from './google-token-verifier';

type GooglePayload = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  nonce?: string;
};

describe('GoogleTokenVerifier', () => {
  const configService = {
    get: jest.fn().mockReturnValue('google-client-id'),
  } as unknown as ConfigService;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('delegates the credential and configured audience to OAuth2Client', async () => {
    const payload = {
      sub: 'google-sub',
      email: 'member@example.com',
      email_verified: true,
      nonce: 'challenge-nonce',
    } satisfies Required<GooglePayload>;
    const ticket = {
      getPayload: () => payload,
    } as unknown as LoginTicket;
    const verifyIdToken = jest
      .spyOn(OAuth2Client.prototype, 'verifyIdToken')
      .mockResolvedValue(ticket);
    const verifier = new GoogleTokenVerifier(configService);

    await expect(verifier.verify('google-id-token')).resolves.toEqual({
      sub: 'google-sub',
      email: 'member@example.com',
      emailVerified: true,
      nonce: 'challenge-nonce',
    });
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'google-id-token',
      audience: 'google-client-id',
    });
  });

  it.each([
    undefined,
    {},
    { email: 'member@example.com', email_verified: true, nonce: 'nonce' },
    {
      sub: '',
      email: 'member@example.com',
      email_verified: true,
      nonce: 'nonce',
    },
    { sub: 'sub', email: '', email_verified: true, nonce: 'nonce' },
    { sub: 'sub', email: 'member@example.com', nonce: 'nonce' },
    { sub: 'sub', email: 'member@example.com', email_verified: true },
    {
      sub: 'sub',
      email: 'member@example.com',
      email_verified: true,
      nonce: '',
    },
  ] as Array<GooglePayload | undefined>)(
    'rejects missing or malformed claims: %p',
    async (payload) => {
      const ticket = {
        getPayload: () => payload,
      } as unknown as LoginTicket;
      jest
        .spyOn(OAuth2Client.prototype, 'verifyIdToken')
        .mockResolvedValue(ticket);
      const verifier = new GoogleTokenVerifier(configService);

      await expect(verifier.verify('google-id-token')).rejects.toThrow(
        'Google credential is missing required claims',
      );
    },
  );
});
