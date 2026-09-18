PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_members` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`email` text,
	`name` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_members`("id", "user_id", "email", "name", "role", "status", "created") SELECT "id", "user_id", "email", "name", "role", "status", "created" FROM `members`;--> statement-breakpoint
DROP TABLE `members`;--> statement-breakpoint
ALTER TABLE `__new_members` RENAME TO `members`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `members_user_id_unique` ON `members` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `members_email_unique` ON `members` (`email`);--> statement-breakpoint
INSERT INTO members (id,user_id,email,name,role,status,created)
SELECT 'existing-' || m.user_id, m.user_id, NULL,
(SELECT recent.author FROM messages recent WHERE recent.user_id=m.user_id ORDER BY recent.created DESC,recent.id DESC LIMIT 1),
'member','active',MIN(m.created)
FROM messages m
WHERE m.user_id<>'' AND NOT EXISTS (SELECT 1 FROM members existing WHERE existing.user_id=m.user_id)
GROUP BY m.user_id;
