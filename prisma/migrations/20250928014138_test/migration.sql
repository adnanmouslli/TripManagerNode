/*
  Warnings:

  - You are about to drop the column `gender` on the `SecurityLog` table. All the data in the column will be lost.
  - You are about to drop the column `scanMethod` on the `SecurityLog` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."SecurityLog" DROP COLUMN "gender",
DROP COLUMN "scanMethod";
