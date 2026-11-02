-- CreateTable
CREATE TABLE "password_recovery_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "password_hash_fingerprint" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "password_recovery_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_recovery_tokens_user_id_key" ON "password_recovery_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_recovery_tokens_token_hash_key" ON "password_recovery_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_recovery_tokens_expires_at_idx" ON "password_recovery_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "password_recovery_tokens" ADD CONSTRAINT "password_recovery_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
