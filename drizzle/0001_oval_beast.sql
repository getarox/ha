CREATE TABLE `aurevion_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionKey` varchar(128) NOT NULL,
	`plan` enum('free','pro') NOT NULL DEFAULT 'free',
	`messagesUsed` int NOT NULL DEFAULT 0,
	`imagesUsed` int NOT NULL DEFAULT 0,
	`windowStartedAt` timestamp NOT NULL DEFAULT (now()),
	`lastRequestAt` timestamp,
	`contextJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `aurevion_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `aurevion_sessions_sessionKey_unique` UNIQUE(`sessionKey`)
);
