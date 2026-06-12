-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('ALTA', 'MEDIA', 'BAJA');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "priority" "TicketPriority";
