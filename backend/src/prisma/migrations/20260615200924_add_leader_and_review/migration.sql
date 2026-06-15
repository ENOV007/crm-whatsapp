-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED_BY_LEADER', 'REJECTED_BY_LEADER', 'SENT_TO_PASTORA');

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "reviewStatus" "ReviewStatus",
ADD COLUMN     "reviewedById" TEXT;

-- AlterTable
ALTER TABLE "UserGroup" ADD COLUMN     "isLeader" BOOLEAN NOT NULL DEFAULT false;
