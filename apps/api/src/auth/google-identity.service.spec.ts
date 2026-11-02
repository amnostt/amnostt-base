import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { GoogleIdentityService } from './google-identity.service';
import { GoogleTokenVerifier } from './google-token-verifier';

describe('GoogleIdentityService', () => {
  it('reports a disabled provider and fails closed when the public client ID is absent', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const prisma = {
      googleIdentity: { findUnique },
    } as unknown as PrismaService;
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const tokenVerifier = {} as GoogleTokenVerifier;
    const service = new GoogleIdentityService(
      prisma,
      configService,
      tokenVerifier,
    );

    await expect(service.getStatus('user-id')).resolves.toEqual({
      provider: 'google',
      enabled: false,
      clientId: null,
      linked: false,
    });
    await expect(
      service.createChallenge('user-id', 'session-id'),
    ).rejects.toEqual(
      new ServiceUnavailableException('Google linking is not configured'),
    );
    expect(findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-id' },
      select: { id: true },
    });
  });
});
