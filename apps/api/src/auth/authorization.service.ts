import { ForbiddenException, Injectable } from '@nestjs/common';
import { CurrentUser } from './auth.types';

export interface OwnedResource {
  ownerId: string;
}

@Injectable()
export class AuthorizationService {
  hasPermission(
    currentUser: CurrentUser,
    requiredPermission: string,
    resource?: OwnedResource,
  ): boolean {
    const permissionParts = requiredPermission.split(':');
    const [resourceName, action, scope] = permissionParts;

    if (
      permissionParts.length !== 3 ||
      !resourceName ||
      !action ||
      (scope !== 'own' && scope !== 'any')
    ) {
      return false;
    }

    const anyPermission = `${resourceName}:${action}:any`;
    if (currentUser.permissions.includes(anyPermission)) {
      return true;
    }

    return (
      scope === 'own' &&
      resource?.ownerId === currentUser.id &&
      currentUser.permissions.includes(requiredPermission)
    );
  }

  assertPermission(
    currentUser: CurrentUser,
    requiredPermission: string,
    resource?: OwnedResource,
  ): void {
    if (!this.hasPermission(currentUser, requiredPermission, resource)) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }
}
