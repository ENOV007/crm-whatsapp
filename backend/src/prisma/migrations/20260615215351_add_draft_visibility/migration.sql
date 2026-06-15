-- AlterEnum
ALTER TYPE "TicketVisibility" ADD VALUE 'DRAFT';

-- AlterTable
ALTER TABLE "Ticket" ALTER COLUMN "visibility" SET DEFAULT 'DRAFT';
