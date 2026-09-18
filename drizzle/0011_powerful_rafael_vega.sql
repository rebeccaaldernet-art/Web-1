CREATE TABLE `order_classifications` (
	`site_id` text NOT NULL,
	`order_id` text NOT NULL,
	`segment` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated` integer NOT NULL,
	PRIMARY KEY(`site_id`, `order_id`)
);
--> statement-breakpoint
UPDATE access_settings SET require_approval=1 WHERE id='workspace';
