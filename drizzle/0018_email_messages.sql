CREATE TABLE `email_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`sender` text NOT NULL,
	`from_address` text NOT NULL,
	`to_list` text NOT NULL,
	`cc_list` text DEFAULT '[]' NOT NULL,
	`bcc_list` text DEFAULT '[]' NOT NULL,
	`recipient_count` integer NOT NULL,
	`subject` text NOT NULL,
	`html` text NOT NULL,
	`text` text NOT NULL,
	`status` text DEFAULT 'sending' NOT NULL,
	`provider_id` text,
	`error` text,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_email_messages_created` ON `email_messages` (`created`);--> statement-breakpoint
CREATE INDEX `idx_email_messages_provider` ON `email_messages` (`provider_id`);