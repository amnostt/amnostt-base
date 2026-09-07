import 'reflect-metadata';
import { AuthModule } from '../auth/auth.module';
import { TasksModule } from './tasks.module';

describe('TasksModule', () => {
  it('imports AuthModule for its guarded task controller', () => {
    const imports = Reflect.getMetadata('imports', TasksModule) as unknown[];

    expect(imports).toContain(AuthModule);
  });
});
