CREATE TABLE "gate_camera" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"snapshot_url" varchar(1000) NOT NULL,
	"cam_username" varchar(120),
	"secret_enc" text,
	"admin_hash" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gate_camera" ADD CONSTRAINT "gate_camera_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;