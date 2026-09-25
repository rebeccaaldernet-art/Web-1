CREATE TABLE `email_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`campaign` text DEFAULT '' NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_email_audit_created` ON `email_audit` (`created`);--> statement-breakpoint
CREATE TABLE `email_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`subject` text NOT NULL,
	`html` text NOT NULL,
	`text` text NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`tested_revision` integer DEFAULT 0 NOT NULL,
	`link_origin` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL,
	`owner` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_email_campaigns_created` ON `email_campaigns` (`created`);--> statement-breakpoint
CREATE TABLE `email_recipients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign` text NOT NULL,
	`email` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`lease` text,
	`leased` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`provider_id` text,
	`error` text,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_email_recipients_campaign_email` ON `email_recipients` (`campaign`,`email`);--> statement-breakpoint
CREATE INDEX `idx_email_recipients_campaign_status` ON `email_recipients` (`campaign`,`status`,`id`);--> statement-breakpoint
CREATE INDEX `idx_email_recipients_lease` ON `email_recipients` (`lease`);--> statement-breakpoint
CREATE INDEX `idx_email_recipients_provider` ON `email_recipients` (`provider_id`);--> statement-breakpoint
CREATE INDEX `idx_email_recipients_email` ON `email_recipients` (`email`);--> statement-breakpoint
CREATE TABLE `email_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`from_name` text NOT NULL,
	`from_email` text NOT NULL,
	`reply_to` text DEFAULT '' NOT NULL,
	`postal_address` text NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `email_suppressions` (
	`email` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`created` integer NOT NULL
);
