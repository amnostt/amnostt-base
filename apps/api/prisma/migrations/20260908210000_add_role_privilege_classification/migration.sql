-- AlterTable
ALTER TABLE "roles"
ADD COLUMN "is_privileged" BOOLEAN NOT NULL DEFAULT true;
