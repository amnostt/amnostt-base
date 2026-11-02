import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { isEmail } from 'class-validator';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export class MailConfigurationError extends Error {
  constructor() {
    super('Mail configuration is invalid');
    this.name = 'MailConfigurationError';
  }
}

export class MailInputError extends Error {
  constructor() {
    super('Mail message is invalid');
    this.name = 'MailInputError';
  }
}

export class MailDeliveryError extends Error {
  constructor() {
    super('Mail delivery failed');
    this.name = 'MailDeliveryError';
  }
}

interface ResendEmailResponse {
  id?: unknown;
}

const RESEND_EMAILS_URL = 'https://api.resend.com/emails';
const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT = 'amnostt-api/0.0.1';
@Injectable()
export class MailService {
  constructor(private readonly configService: ConfigService) {}

  async send(message: MailMessage): Promise<string> {
    const from = this.configService.get<string>('MAIL_FROM');
    const apiKey = this.configService.get<string>('RESEND_API_KEY');

    this.validateConfiguration(from, apiKey);
    this.validateMessage(message);

    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new MailDeliveryError());
      }, REQUEST_TIMEOUT_MS);
    });

    try {
      const response = await Promise.race([
        fetch(RESEND_EMAILS_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': USER_AGENT,
          },
          body: JSON.stringify({
            from,
            to: message.to,
            subject: message.subject,
            text: message.text,
          }),
          redirect: 'error',
          signal: controller.signal,
        }),
        timeoutPromise,
      ]);

      if (!response.ok) {
        throw new MailDeliveryError();
      }

      const payload = (await Promise.race([
        response.json() as Promise<unknown>,
        timeoutPromise,
      ])) as ResendEmailResponse;

      if (
        !payload ||
        typeof payload !== 'object' ||
        typeof payload.id !== 'string' ||
        payload.id.trim() === ''
      ) {
        throw new MailDeliveryError();
      }

      return payload.id;
    } catch {
      throw new MailDeliveryError();
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private validateConfiguration(
    from: string | undefined,
    apiKey: string | undefined,
  ): void {
    if (
      typeof from !== 'string' ||
      !from.trim() ||
      !isEmail(from, { allow_display_name: true }) ||
      typeof apiKey !== 'string' ||
      !apiKey.trim() ||
      this.hasInvalidHeaderCharacters(apiKey)
    ) {
      throw new MailConfigurationError();
    }
  }

  private hasInvalidHeaderCharacters(value: string): boolean {
    return Array.from(value).some(
      (character) =>
        /\s/u.test(character) ||
        character.charCodeAt(0) <= 0x1f ||
        character.charCodeAt(0) === 0x7f,
    );
  }

  private validateMessage(message: MailMessage): void {
    if (
      !message ||
      typeof message.to !== 'string' ||
      typeof message.subject !== 'string' ||
      typeof message.text !== 'string' ||
      !isEmail(message.to, { allow_display_name: false }) ||
      !message.subject.trim() ||
      /[\r\n]/u.test(message.subject) ||
      !message.text.trim()
    ) {
      throw new MailInputError();
    }
  }
}
