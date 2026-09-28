DROP INDEX `idx_inventory_cultivator`;--> statement-breakpoint
ALTER TABLE `inventory` ADD `price_paid` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory` ADD `catalog_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory` ADD `equipped_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_inventory_cultivator_item` ON `inventory` (`cultivator_id`,`item_id`);