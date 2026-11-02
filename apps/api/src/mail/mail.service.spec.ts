import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailModule } from './mail.module';
import { MailService } from './mail.service';

const MAIL_DELIVERY_ERROR = 'Mail delivery failed';

describe('MailService', () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch');
  const configValues = new Map<string, string | undefined>();
  const configService = {
    get: jest.fn((key: string) => configValues.get(key)),
  } as unknown as ConfigService;
  let module: TestingModule;
  let service: MailService;

  beforeEach(async () => {
    jest.clearAllMocks();
    configValues.clear();
    configValues.set('MAIL_FROM', 'Amnostt <no-reply@example.com>');
    configValues.set('RESEND_API_KEY', 're_valid-api-key');
    fetchMock.mockReset();

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          skipProcessEnv: true,
        }),
        MailModule,
      ],
    })
      .overrideProvider(ConfigService)
      .useValue(configService)
      .compile();
    service = module.get(MailService);
  });

  afterAll(() => {
    fetchMock.mockRestore();
  });

  it('resolves through Nest module DI without mail configuration', async () => {
    const moduleWithoutConfiguration = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          skipProcessEnv: true,
        }),
        MailModule,
      ],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: jest.fn(() => undefined),
      })
      .compile();

    expect(moduleWithoutConfiguration.get(MailService)).toBeInstanceOf(
      MailService,
    );
  });

  it('sends one plain-text message and returns the Resend id', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 'resend-message-id' }), {
        status: 200,
      }),
    );

    await expect(
      service.send({
        to: 'recipient@example.com',
        subject: 'Welcome',
        text: 'Hello from Amnostt.',
      }),
    ).resolves.toBe('resend-message-id');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(request).toEqual(
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: {
          Authorization: 'Bearer re_valid-api-key',
          'Content-Type': 'application/json',
          'User-Agent': 'amnostt-api/0.0.1',
        },
      }),
    );
    expect(request?.body).toBe(
      JSON.stringify({
        from: 'Amnostt <no-reply@example.com>',
        to: 'recipient@example.com',
        subject: 'Welcome',
        text: 'Hello from Amnostt.',
      }),
    );
  });

  it.each([
    ['missing sender', 'MAIL_FROM', undefined],
    ['blank sender', 'MAIL_FROM', '   '],
    ['malformed sender', 'MAIL_FROM', 'not-an-email'],
    ['missing API key', 'RESEND_API_KEY', undefined],
    ['blank API key', 'RESEND_API_KEY', '   '],
    ['API key with whitespace', 'RESEND_API_KEY', 're_key with-space'],
    ['API key with a control character', 'RESEND_API_KEY', 're_key\nvalue'],
  ])('rejects %s before network access', async (_description, key, value) => {
    configValues.set(key, value);

    await expect(
      service.send({
        to: 'recipient@example.com',
        subject: 'Subject',
        text: 'Text',
      }),
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      'an invalid recipient',
      { to: 'not-an-email', subject: 'Subject', text: 'Text' },
    ],
    [
      'a blank subject',
      { to: 'recipient@example.com', subject: '   ', text: 'Text' },
    ],
    [
      'a blank text body',
      { to: 'recipient@example.com', subject: 'Subject', text: '\t' },
    ],
    [
      'a subject containing CRLF',
      {
        to: 'recipient@example.com',
        subject: 'Subject\r\nInjected',
        text: 'Text',
      },
    ],
  ])('rejects %s before network access', async (_description, message) => {
    await expect(service.send(message)).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      description: 'a non-2xx response',
      response: new Response('provider secret body', { status: 429 }),
      rejection: undefined,
      leaked: 'provider secret body',
    },
    {
      description: 'a malformed provider body',
      response: new Response(JSON.stringify({ error: 'provider secret' }), {
        status: 200,
      }),
      rejection: undefined,
      leaked: 'provider secret',
    },
    {
      description: 'a network failure',
      response: undefined,
      rejection: new Error('network detail for recipient@example.com'),
      leaked: 'network detail for recipient@example.com',
    },
  ])(
    'sanitizes $description and does not retry',
    async ({ response, rejection, leaked }) => {
      if (rejection) {
        fetchMock.mockRejectedValue(rejection);
      } else {
        fetchMock.mockResolvedValue(response);
      }

      const result = service.send({
        to: 'recipient@example.com',
        subject: 'Subject',
        text: 'Private message body',
      });

      await expect(result).rejects.toThrow(MAIL_DELIVERY_ERROR);
      await expect(result).rejects.not.toThrow(leaked);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('sanitizes a response-body timeout without waiting ten seconds or retrying', async () => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => new Promise<unknown>(() => {}),
    } as unknown as Response);

    const result = service.send({
      to: 'recipient@example.com',
      subject: 'Subject',
      text: 'Private message body',
    });

    const rejection = expect(result).rejects.toThrow(MAIL_DELIVERY_ERROR);
    await jest.advanceTimersByTimeAsync(10_000);
    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
