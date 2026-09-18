CREATE TABLE `website_orders` (
	`site_id` text NOT NULL,
	`order_id` text NOT NULL,
	`order_number` text NOT NULL,
	`created` integer NOT NULL,
	`customer` text NOT NULL,
	`email` text NOT NULL,
	`currency` text NOT NULL,
	`total` text NOT NULL,
	`payment` text NOT NULL,
	`fulfillment` text NOT NULL,
	`status` text NOT NULL,
	`items` text NOT NULL,
	`shipping` text NOT NULL,
	`note` text NOT NULL,
	`received` integer NOT NULL,
	PRIMARY KEY(`site_id`, `order_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_website_orders_created` ON `website_orders` (`created`);