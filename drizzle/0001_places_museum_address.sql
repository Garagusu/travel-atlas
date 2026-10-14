ALTER TYPE "public"."place_category" ADD VALUE 'museum' BEFORE 'attraction';--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "address" text;