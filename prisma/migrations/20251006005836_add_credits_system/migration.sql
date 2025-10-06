-- CreateEnum
CREATE TYPE "public"."TransactionType" AS ENUM ('PURCHASE', 'CONSUMPTION', 'REFUND', 'BONUS');

-- CreateEnum
CREATE TYPE "public"."TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "credits" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "public"."CreditPackage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "credits" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CreditPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CreditTransaction" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "type" "public"."TransactionType" NOT NULL,
    "status" "public"."TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "amount" INTEGER NOT NULL,
    "price" DECIMAL(10,2),
    "userId" TEXT NOT NULL,
    "packageId" TEXT,
    "jobId" TEXT,
    "paymentId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditPackage_isActive_idx" ON "public"."CreditPackage"("isActive");

-- CreateIndex
CREATE INDEX "CreditTransaction_userId_createdAt_idx" ON "public"."CreditTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditTransaction_status_idx" ON "public"."CreditTransaction"("status");

-- CreateIndex
CREATE INDEX "CreditTransaction_type_idx" ON "public"."CreditTransaction"("type");

-- AddForeignKey
ALTER TABLE "public"."CreditTransaction" ADD CONSTRAINT "CreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CreditTransaction" ADD CONSTRAINT "CreditTransaction_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "public"."CreditPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CreditTransaction" ADD CONSTRAINT "CreditTransaction_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
