-- CreateEnum
CREATE TYPE "TicketVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "visibility" "TicketVisibility" NOT NULL DEFAULT 'PRIVATE';
