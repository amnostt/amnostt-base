import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export interface VerifiedGoogleCredential {
  sub: string;
  email: string;
  emailVerified: boolean;
  nonce: string;
}

@Injectable()
export class GoogleTokenVerifier {
  private readonly client = new OAuth2Client();

  constructor(private readonly configService: ConfigService) {}

  async verify(credential: string): Promise<VerifiedGoogleCredential> {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID')?.trim();
    if (!clientId) {
      throw new Error('Google provider is not configured');
    }

    const ticket = await this.client.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    const payload = ticket.getPayload();

    if (
      !payload ||
      typeof payload.sub !== 'string' ||
      !payload.sub.trim() ||
      typeof payload.email !== 'string' ||
      !payload.email.trim() ||
      typeof payload.email_verified !== 'boolean' ||
      typeof payload.nonce !== 'string' ||
      !payload.nonce.trim()
    ) {
      throw new Error('Google credential is missing required claims');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified,
      nonce: payload.nonce,
    };
  }
}
