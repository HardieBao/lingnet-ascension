ALTER TABLE `missions` ADD `required_realm` text DEFAULT 'mortal' NOT NULL;--> statement-breakpoint
ALTER TABLE `missions` ADD `required_merit` integer DEFAULT 0 NOT NULL;
