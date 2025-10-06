-- AlterTable
ALTER TABLE "public"."Job" ADD COLUMN     "feedbackScore" INTEGER,
ADD COLUMN     "feedbackStrengths" TEXT,
ADD COLUMN     "feedbackSummary" TEXT,
ADD COLUMN     "feedbackWeaknesses" TEXT;
