-- AlterEnum: Add PENDIENTE_APROBACION to TicketStatus enum
-- This will only add the value if it doesn't exist (safe for production)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PENDIENTE_APROBACION' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'TicketStatus')) THEN
    ALTER TYPE "TicketStatus" ADD VALUE 'PENDIENTE_APROBACION';
  END IF;
END $$;

-- Add autoDeleteAt column to Ticket table (safe for production)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Ticket' AND column_name = 'autoDeleteAt') THEN
    ALTER TABLE "Ticket" ADD COLUMN "autoDeleteAt" TIMESTAMP(3);
  END IF;
END $$;
