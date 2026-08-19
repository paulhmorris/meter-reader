-- CreateTable
CREATE TABLE "PushEndpoint" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PushEndpoint_grantId_idx" ON "PushEndpoint"("grantId");

-- CreateIndex
CREATE UNIQUE INDEX "PushEndpoint_grantId_endpoint_key" ON "PushEndpoint"("grantId", "endpoint");

-- AddForeignKey
ALTER TABLE "PushEndpoint" ADD CONSTRAINT "PushEndpoint_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "Grant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
