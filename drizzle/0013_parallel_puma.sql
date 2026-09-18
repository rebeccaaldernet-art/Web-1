CREATE TABLE `inventory_references` (
	`id` text NOT NULL,
	`site_id` text NOT NULL,
	`product_id` text NOT NULL,
	`object_key` text NOT NULL,
	`signature` text NOT NULL,
	`updated` integer NOT NULL,
	PRIMARY KEY(`site_id`, `product_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_references_id_unique` ON `inventory_references` (`id`);