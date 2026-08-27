import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { AuthTokenService } from './auth-token.service';

describe('AuthGuard', () => {
  const verifyAccessToken = jest.fn();
  const getCurrentUser = jest.fn();

  const authTokenService = {
    verifyAccessToken,
  } as unknown as AuthTokenService;

  const authService = {
    getCurrentUser,
  } as unknown as AuthService;

  const guard = new AuthGuard(authTokenService, authService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createContext(authorization?: string) {
    const request: {
      headers: { authorization?: string };
      user?: unknown;
    } = {
      headers: {
        authorization,
      },
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;

    return { context, request };
  }

  it('should authenticate and attach currentUser to the request', async () => {
    const { context, request } = createContext('Bearer access-token');
    const currentUser = {
      id: 'user-id',
      email: 'member@example.com',
      name: 'Member User',
      role: 'Member',
      permissions: ['tasks:read:own'],
    };

    verifyAccessToken.mockResolvedValue({
      sub: 'user-id',
      sid: 'session-id',
      type: 'access',
    });
    getCurrentUser.mockResolvedValue(currentUser);

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(verifyAccessToken).toHaveBeenCalledWith('access-token');
    expect(getCurrentUser).toHaveBeenCalledWith('user-id', 'session-id');
    expect(request.user).toEqual(currentUser);
  });

  it('should accept a case-insensitive bearer scheme', async () => {
    const { context } = createContext('bearer access-token');
    verifyAccessToken.mockResolvedValue({
      sub: 'user-id',
      sid: 'session-id',
      type: 'access',
    });
    getCurrentUser.mockResolvedValue({ id: 'user-id' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it.each([undefined, '', 'Basic credentials', 'Bearer', 'Bearer '])(
    'should reject an invalid authorization header: %s',
    async (header) => {
      const { context } = createContext(header);

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(verifyAccessToken).not.toHaveBeenCalled();
      expect(getCurrentUser).not.toHaveBeenCalled();
    },
  );

  it('should reject a token that fails verification', async () => {
    const { context } = createContext('Bearer invalid-token');
    verifyAccessToken.mockRejectedValue(new UnauthorizedException());

    await expect(guard.canActivate(context)).rejects.toEqual(
      new UnauthorizedException('Authentication required'),
    );

    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it('should reject an inactive or invalid session', async () => {
    const { context } = createContext('Bearer access-token');
    verifyAccessToken.mockResolvedValue({
      sub: 'user-id',
      sid: 'session-id',
      type: 'access',
    });
    getCurrentUser.mockRejectedValue(
      new UnauthorizedException('Invalid session'),
    );

    await expect(guard.canActivate(context)).rejects.toEqual(
      new UnauthorizedException('Authentication required'),
    );
  });
});
