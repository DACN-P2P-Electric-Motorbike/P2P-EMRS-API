-- CreateTable
CREATE TABLE "fcm_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fcm_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fcm_tokens_user_id_idx" ON "fcm_tokens"("user_id");

-- CreateIndex
CREATE INDEX "fcm_tokens_token_idx" ON "fcm_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "fcm_tokens_user_id_platform_key" ON "fcm_tokens"("user_id", "platform");

-- AddForeignKey
ALTER TABLE "fcm_tokens" ADD CONSTRAINT "fcm_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;