CREATE TABLE "run_splits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"distance_meters" double precision DEFAULT 1000 NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"pace_sec_per_km" integer DEFAULT 0 NOT NULL,
	"elevation_gain_meters" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "run_splits" ADD CONSTRAINT "run_splits_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_splits_run_idx" ON "run_splits" USING btree ("run_id","index");