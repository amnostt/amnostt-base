import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('should return a healthy status', () => {
    const controller = new HealthController();

    expect(controller.getHealth()).toEqual({
      status: 'ok',
    });
  });
});
