-- CreateTable
CREATE TABLE "Meter" (
    "id" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Meter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reading" (
    "id" BIGSERIAL NOT NULL,
    "meterId" BIGINT NOT NULL,
    "consumption" DECIMAL(12,1) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reading_meterId_receivedAt_idx" ON "Reading"("meterId", "receivedAt");

-- AddForeignKey
ALTER TABLE "Reading" ADD CONSTRAINT "Reading_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "Meter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
