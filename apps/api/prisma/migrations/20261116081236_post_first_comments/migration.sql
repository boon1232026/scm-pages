/*
  Warnings:

  - You are about to drop the column `first_comment_body` on the `posts` table. All the data in the column will be lost.
  - You are about to drop the column `first_comment_media_id` on the `posts` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "posts" DROP COLUMN "first_comment_body",
DROP COLUMN "first_comment_media_id",
ADD COLUMN     "first_comments" JSONB;
