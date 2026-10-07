CREATE TABLE "procure_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"mime_type" varchar(100),
	"size_bytes" integer,
	"storage_url" text NOT NULL,
	"uploaded_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "procure_attachments" ADD CONSTRAINT "procure_attachments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procure_attachments" ADD CONSTRAINT "procure_attachments_request_id_procure_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."procure_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procure_attachments" ADD CONSTRAINT "procure_attachments_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_proc_att_tenant" ON "procure_attachments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_proc_att_request" ON "procure_attachments" USING btree ("request_id");