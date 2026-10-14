ALTER TABLE "photos" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "lon" double precision;--> statement-breakpoint
-- photos that already exist haven't had their original read for GPS yet
ALTER TABLE "photos" ADD COLUMN "gps_checked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "photos" ALTER COLUMN "gps_checked" SET DEFAULT true;
