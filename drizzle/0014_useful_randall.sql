CREATE TABLE `member_presence` (
	`member_id` text NOT NULL,
	`session_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`active` integer NOT NULL,
	`seen` integer NOT NULL,
	PRIMARY KEY(`member_id`, `session_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_member_presence_seen` ON `member_presence` (`seen`);