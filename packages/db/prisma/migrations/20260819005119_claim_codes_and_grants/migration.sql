-- CreateTable
CREATE TABLE "ClaimCode" (
    "code" TEXT NOT NULL,
    "meterId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMP(3),

    CONSTRAINT "ClaimCode_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Grant" (
    "id" TEXT NOT NULL,
    "meterId" BIGINT NOT NULL,
    "claimCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Grant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClaimCode_meterId_idx" ON "ClaimCode"("meterId");

-- CreateIndex
CREATE INDEX "Grant_meterId_idx" ON "Grant"("meterId");

-- AddForeignKey
ALTER TABLE "ClaimCode" ADD CONSTRAINT "ClaimCode_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "Meter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grant" ADD CONSTRAINT "Grant_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "Meter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grant" ADD CONSTRAINT "Grant_claimCode_fkey" FOREIGN KEY ("claimCode") REFERENCES "ClaimCode"("code") ON DELETE SET NULL ON UPDATE CASCADE;
