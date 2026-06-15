-- AlterEnum
ALTER TYPE "TicketVisibility" ADD VALUE 'USER_SPECIFIC';

-- CreateTable
CREATE TABLE "TicketViewer" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketViewer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketViewer_ticketId_userId_key" ON "TicketViewer"("ticketId", "userId");

-- AddForeignKey
ALTER TABLE "TicketViewer" ADD CONSTRAINT "TicketViewer_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketViewer" ADD CONSTRAINT "TicketViewer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
