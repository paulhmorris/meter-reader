-- CreateEnum
CREATE TYPE "MeterEventFlag" AS ENUM ('activeLeak', 'backflow', 'noUse');

-- CreateTable
CREATE TABLE "MeterEvent" (
    "id" BIGSERIAL NOT NULL,
    "meterId" BIGINT NOT NULL,
    "flag" "MeterEventFlag" NOT NULL,
    "from" SMALLINT NOT NULL,
    "to" SMALLINT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeterEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeterEvent_meterId_occurredAt_idx" ON "MeterEvent"("meterId", "occurredAt");

-- AddForeignKey
ALTER TABLE "MeterEvent" ADD CONSTRAINT "MeterEvent_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "Meter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
