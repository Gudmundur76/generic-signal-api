CREATE TABLE `patentAlerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patentNumber` varchar(32) NOT NULL,
	`title` varchar(512) NOT NULL,
	`assignee` varchar(255) NOT NULL,
	`status` enum('EXPIRING','ABANDONED','RE_EXAM_NARROWED') NOT NULL,
	`expiryDate` varchar(16),
	`distressScore` int NOT NULL DEFAULT 0,
	`niche` varchar(64),
	`claims` text,
	`verificationStatus` varchar(32) NOT NULL DEFAULT 'Pending',
	`patentUrl` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `patentAlerts_id` PRIMARY KEY(`id`),
	CONSTRAINT `patentAlerts_patentNumber_unique` UNIQUE(`patentNumber`)
);
