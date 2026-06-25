CREATE TABLE `approvalRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gene` varchar(32) NOT NULL,
	`patentNumber` varchar(32),
	`reason` varchar(255) NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`confidence` int NOT NULL,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `approvalRequests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `distributionEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`signalSource` varchar(64) NOT NULL,
	`gene` varchar(32) NOT NULL,
	`patentNumber` varchar(32),
	`sequence` text NOT NULL,
	`compositeScore` int NOT NULL,
	`partnerId` int NOT NULL,
	`status` enum('delivered','failed','held') NOT NULL DEFAULT 'delivered',
	`deliveredAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `distributionEvents_id` PRIMARY KEY(`id`)
);
