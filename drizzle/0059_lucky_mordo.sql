--> statement-breakpoint
CREATE TABLE "report_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
	"kind" varchar(10) NOT NULL,
	"ref" varchar(80) NOT NULL,
	"file_name" varchar(160) NOT NULL,
	"pdf_base64" text NOT NULL,
	"token" varchar(64) NOT NULL UNIQUE,
	"expires_at" timestamptz NOT NULL DEFAULT now() + interval '90 days',
	"view_count" integer NOT NULL DEFAULT 0,
	"created_at" timestamptz NOT NULL DEFAULT now(),
	UNIQUE ("tenant_id", "kind", "ref")
);
--> statement-breakpoint
CREATE INDEX "idx_report_file_token" ON "report_files" USING btree ("token");
--> statement-breakpoint
CREATE INDEX "idx_report_file_tenant" ON "report_files" USING btree ("tenant_id");
