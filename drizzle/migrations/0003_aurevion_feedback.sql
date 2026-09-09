CREATE TABLE IF NOT EXISTS `aurevion_feedback` (
  `id` int AUTO_INCREMENT NOT NULL,
  `category` enum('support','bug','safety','feedback') NOT NULL,
  `message` text NOT NULL,
  `sessionId` varchar(128),
  `userEmail` varchar(320),
  `status` enum('new','reviewing','resolved') NOT NULL DEFAULT 'new',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `aurevion_feedback_id` PRIMARY KEY(`id`)
);
