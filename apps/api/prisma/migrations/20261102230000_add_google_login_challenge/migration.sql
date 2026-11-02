-- CreateTable
CREATE TABLE "google_login_challenges" (
    "id" UUID NOT NULL,
    "nonce_hash" TEXT NOT NULL,
    "browser_proof_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_login_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_login_challenges_nonce_hash_key" ON "google_login_challenges"("nonce_hash");

-- CreateIndex
CREATE UNIQUE INDEX "google_login_challenges_browser_proof_hash_key" ON "google_login_challenges"("browser_proof_hash");

-- CreateIndex
CREATE INDEX "google_login_challenges_expires_at_idx" ON "google_login_challenges"("expires_at");
