CREATE TYPE "public"."run_status" AS ENUM('active', 'completed', 'discarded');--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" date NOT NULL,
	"target_km" double precision DEFAULT 5 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text DEFAULT 'Runner' NOT NULL,
	"weight_kg" double precision DEFAULT 70 NOT NULL,
	"stride_meters" double precision DEFAULT 0.78 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_points" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"altitude" double precision,
	"speed" double precision,
	"accuracy" double precision,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "run_status" DEFAULT 'completed' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"distance_meters" double precision DEFAULT 0 NOT NULL,
	"avg_speed_kmh" double precision DEFAULT 0 NOT NULL,
	"max_speed_kmh" double precision DEFAULT 0 NOT NULL,
	"avg_pace_sec_per_km" integer DEFAULT 0 NOT NULL,
	"calories" double precision DEFAULT 0 NOT NULL,
	"elevation_gain_meters" double precision DEFAULT 0 NOT NULL,
	"steps" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "route_points" ADD CONSTRAINT "route_points_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "route_points_run_seq_idx" ON "route_points" USING btree ("run_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "route_points_run_seq_uq" ON "route_points" USING btree ("run_id","seq");--> statement-breakpoint
CREATE INDEX "runs_started_at_idx" ON "runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "runs_status_idx" ON "runs" USING btree ("status");