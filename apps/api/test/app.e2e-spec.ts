import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/app.setup';

describe('Health API (e2e)', () => {
  let app: INestApplication<App>;
  let corsOrigin: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    const configService = app.get(ConfigService);
    configureApp(app, configService);

    corsOrigin = configService.get<string>(
      'CORS_ORIGIN',
      'http://localhost:5173',
    );

    await app.init();
  });

  it('GET /api/health returns a stable health response', () => {
    return request(app.getHttpServer()).get('/api/health').expect(200).expect({
      status: 'ok',
    });
  });

  it('returns 404 for an unknown route', () => {
    return request(app.getHttpServer()).get('/api/not-found').expect(404);
  });

  it('allows the configured CORS origin', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', corsOrigin)
      .expect(200)
      .expect('Access-Control-Allow-Origin', corsOrigin)
      .expect('Access-Control-Allow-Credentials', 'true');
  });

  afterAll(async () => {
    await app.close();
  });
});
