ALTER TABLE "procure_requests" ADD COLUMN "item_code" varchar(30);--> statement-breakpoint
ALTER TABLE "procure_requests" ADD COLUMN "vehicle_id" uuid;--> statement-breakpoint
ALTER TABLE "procure_requests" ADD CONSTRAINT "procure_requests_vehicle_id_fleet_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."fleet_vehicles"("id") ON DELETE set null ON UPDATE no action;