CREATE TABLE IF NOT EXISTS `wallets` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sessionKey` varchar(128) NOT NULL,
  `balance` decimal(12,2) NOT NULL DEFAULT 0.00,
  `currency` varchar(3) NOT NULL DEFAULT 'SAR',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `wallets_id` PRIMARY KEY(`id`),
  CONSTRAINT `wallets_sessionKey_unique` UNIQUE(`sessionKey`)
);
CREATE TABLE IF NOT EXISTS `wallet_ledger` (
  `id` int AUTO_INCREMENT NOT NULL,
  `walletId` int NOT NULL,
  `reference` varchar(128) NOT NULL,
  `type` enum('credit','debit','refund','hold','release') NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `description` varchar(255),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `wallet_ledger_id` PRIMARY KEY(`id`),
  CONSTRAINT `wallet_ledger_reference_unique` UNIQUE(`reference`)
);
CREATE TABLE IF NOT EXISTS `payments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sessionKey` varchar(128) NOT NULL,
  `cartId` varchar(64) NOT NULL,
  `tranRef` varchar(128),
  `amount` decimal(12,2) NOT NULL,
  `currency` varchar(3) NOT NULL,
  `status` enum('pending','paid','failed','cancelled') NOT NULL DEFAULT 'pending',
  `redirectUrl` text,
  `rawResponse` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `payments_id` PRIMARY KEY(`id`),
  CONSTRAINT `payments_cartId_unique` UNIQUE(`cartId`)
);
CREATE TABLE IF NOT EXISTS `ai_usage` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sessionKey` varchar(128) NOT NULL,
  `operation` varchar(32) NOT NULL,
  `provider` varchar(64) NOT NULL,
  `model` varchar(128),
  `amount` decimal(12,2) NOT NULL,
  `requestId` varchar(128),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `ai_usage_id` PRIMARY KEY(`id`),
  CONSTRAINT `ai_usage_requestId_unique` UNIQUE(`requestId`)
);
CREATE TABLE IF NOT EXISTS `pricing` (
  `id` int AUTO_INCREMENT NOT NULL,
  `operation` varchar(32) NOT NULL,
  `price` decimal(12,2) NOT NULL,
  `currency` varchar(3) NOT NULL DEFAULT 'SAR',
  `active` int NOT NULL DEFAULT 1,
  CONSTRAINT `pricing_id` PRIMARY KEY(`id`),
  CONSTRAINT `pricing_operation_unique` UNIQUE(`operation`)
);
