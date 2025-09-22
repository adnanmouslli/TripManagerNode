-- DropIndex
DROP INDEX "public"."Seat_busTypeId_row_col_key";

-- AlterTable
ALTER TABLE "public"."Seat" ALTER COLUMN "number" DROP DEFAULT;
