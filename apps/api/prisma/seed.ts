import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

type RequiredEnvironmentVariable =
  'DATABASE_URL' | 'SEED_MEMBER_PASSWORD' | 'SEED_ADMIN_PASSWORD';

const memberPermissionCodes = [
  'tasks:create:own',
  'tasks:read:own',
  'tasks:update:own',
  'tasks:delete:own',
] as const;

const adminPermissionCodes = [
  'tasks:read:own',
  'tasks:create:any',
  'tasks:read:any',
  'tasks:update:any',
  'tasks:delete:any',
] as const;

const permissionCodes = [
  ...memberPermissionCodes,
  ...adminPermissionCodes,
] as const;

function getRequiredEnvironmentVariable(
  name: RequiredEnvironmentVariable,
): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

const adapter = new PrismaPg({
  connectionString: getRequiredEnvironmentVariable('DATABASE_URL'),
});

const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const memberPassword = getRequiredEnvironmentVariable('SEED_MEMBER_PASSWORD');
  const adminPassword = getRequiredEnvironmentVariable('SEED_ADMIN_PASSWORD');

  if (memberPassword.length < 12 || adminPassword.length < 12) {
    throw new Error('Seed passwords must contain at least 12 characters');
  }

  if (memberPassword === adminPassword) {
    throw new Error('Seed users must not share the same password');
  }

  const [memberPasswordHash, adminPasswordHash] = await Promise.all([
    argon2.hash(memberPassword, { type: argon2.argon2id }),
    argon2.hash(adminPassword, { type: argon2.argon2id }),
  ]);

  await prisma.$transaction(async (transaction) => {
    const permissions = await Promise.all(
      permissionCodes.map((code) =>
        transaction.permission.upsert({
          where: { code },
          update: {},
          create: { code },
        }),
      ),
    );

    const getPermissionId = (
      code: (typeof permissionCodes)[number],
    ): string => {
      const permission = permissions.find(
        (candidate) => candidate.code === code,
      );

      if (!permission) {
        throw new Error(`Seeded permission not found: ${code}`);
      }

      return permission.id;
    };

    const memberRole = await transaction.role.upsert({
      where: { name: 'Member' },
      update: {},
      create: { name: 'Member' },
    });

    const adminRole = await transaction.role.upsert({
      where: { name: 'Admin' },
      update: {},
      create: { name: 'Admin' },
    });

    const rolePermissionAssignments = [
      ...memberPermissionCodes.map((code) => ({
        roleId: memberRole.id,
        permissionId: getPermissionId(code),
      })),
      ...adminPermissionCodes.map((code) => ({
        roleId: adminRole.id,
        permissionId: getPermissionId(code),
      })),
    ];

    for (const { roleId, permissionId } of rolePermissionAssignments) {
      await transaction.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId,
            permissionId,
          },
        },
        update: {},
        create: {
          roleId,
          permissionId,
        },
      });
    }

    await transaction.user.upsert({
      where: { email: 'member@example.com' },
      update: {
        name: 'Member User',
        passwordHash: memberPasswordHash,
        isActive: true,
        roleId: memberRole.id,
      },
      create: {
        name: 'Member User',
        email: 'member@example.com',
        passwordHash: memberPasswordHash,
        isActive: true,
        roleId: memberRole.id,
      },
    });

    await transaction.user.upsert({
      where: { email: 'admin@example.com' },
      update: {
        name: 'Admin User',
        passwordHash: adminPasswordHash,
        isActive: true,
        roleId: adminRole.id,
      },
      create: {
        name: 'Admin User',
        email: 'admin@example.com',
        passwordHash: adminPasswordHash,
        isActive: true,
        roleId: adminRole.id,
      },
    });
  });
}

main()
  .catch((error: unknown) => {
    console.error('Failed to seed database', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
