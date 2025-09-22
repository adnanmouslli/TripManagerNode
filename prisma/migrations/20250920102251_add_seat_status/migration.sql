-- AlterTable
ALTER TABLE "public"."Seat" ADD COLUMN     "status" "public"."SeatStatus" NOT NULL DEFAULT 'available';
