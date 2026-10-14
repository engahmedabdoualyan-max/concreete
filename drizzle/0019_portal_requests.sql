-- Customer self-service requests coming from the magic-link portal.
-- Nothing here mutates an order: every row is a request for plant staff to
-- approve or reject, so the credit check and finance gate stay in human hands.
DO $$ BEGIN
  CREATE TYPE "public"."portal_request_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."portal_request_type" AS ENUM('NEW_ORDER', 'AMENDMENT', 'CANCELLATION');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "client_id" uuid NOT NULL,
  "share_token_id" uuid,
  "request_type" "portal_request_type" NOT NULL,
  "status" "portal_request_status" DEFAULT 'PENDING' NOT NULL,
  "order_id" uuid,
  "requested_volume_m3" numeric(8,2),
  "requested_date" timestamp,
  "delivery_site_id" uuid,
  "mix_design_id" uuid,
  "note" text,
  "handled_by_id" uuid,
  "handled_at" timestamp,
  "decision_note" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "portal_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "portal_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "portal_requests_share_token_id_share_tokens_id_fk" FOREIGN KEY ("share_token_id") REFERENCES "public"."share_tokens"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "portal_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "portal_requests_delivery_site_id_delivery_sites_id_fk" FOREIGN KEY ("delivery_site_id") REFERENCES "public"."delivery_sites"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "portal_requests_mix_design_id_mix_designs_id_fk" FOREIGN KEY ("mix_design_id") REFERENCES "public"."mix_designs"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "portal_requests_handled_by_id_users_id_fk" FOREIGN KEY ("handled_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_req_tenant" ON "portal_requests" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_req_status" ON "portal_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_req_client" ON "portal_requests" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_req_order" ON "portal_requests" USING btree ("order_id");
