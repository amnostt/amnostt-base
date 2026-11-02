-- CreateTable
CREATE TABLE "google_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "google_sub" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_link_challenges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "nonce_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_link_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_identities_user_id_key" ON "google_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "google_identities_google_sub_key" ON "google_identities"("google_sub");

-- CreateIndex
CREATE UNIQUE INDEX "google_link_challenges_nonce_hash_key" ON "google_link_challenges"("nonce_hash");

-- CreateIndex
CREATE INDEX "google_link_challenges_user_id_session_id_idx" ON "google_link_challenges"("user_id", "session_id");

-- CreateIndex
CREATE INDEX "google_link_challenges_expires_at_idx" ON "google_link_challenges"("expires_at");

-- AddForeignKey
ALTER TABLE "google_identities" ADD CONSTRAINT "google_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_link_challenges" ADD CONSTRAINT "google_link_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_link_challenges" ADD CONSTRAINT "google_link_challenges_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
