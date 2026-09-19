-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "rejectReason" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "slipAt" TIMESTAMP(3),
ADD COLUMN     "stockDeducted" BOOLEAN NOT NULL DEFAULT false;
