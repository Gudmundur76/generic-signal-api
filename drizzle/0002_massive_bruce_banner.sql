CREATE TABLE `deliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`candidateId` varchar(64) NOT NULL,
	`partnerId` int NOT NULL,
	`gene` varchar(32) NOT NULL,
	`therapeuticArea` varchar(64) NOT NULL,
	`noveltyScore` int NOT NULL,
	`compositeScore` int NOT NULL,
	`fto` enum('CLEAR','RISK','BLOCKED') NOT NULL,
	`status` enum('sent','opened','validated_positive','validated_negative','no_response','partnership_initiated','bounced') NOT NULL DEFAULT 'sent',
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`followUpDueAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `deliveries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `milestones` (
	`id` int AUTO_INCREMENT NOT NULL,
	`partnerId` int NOT NULL,
	`candidateId` varchar(64) NOT NULL,
	`milestoneType` varchar(64) NOT NULL,
	`paymentAmount` int,
	`expectedDate` timestamp,
	`achievedDate` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `milestones_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `partners` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`institution` varchar(255) NOT NULL,
	`therapeuticAreas` text NOT NULL,
	`tier` enum('explorer','developer','accelerator') NOT NULL DEFAULT 'explorer',
	`agreementAccepted` int NOT NULL DEFAULT 0,
	`agreementAcceptedAt` timestamp,
	`candidatesDelivered` int NOT NULL DEFAULT 0,
	`positiveValidations` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `partners_id` PRIMARY KEY(`id`),
	CONSTRAINT `partners_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `royaltyEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`partnerId` int NOT NULL,
	`candidateId` varchar(64) NOT NULL,
	`netSales` int NOT NULL,
	`royaltyRate` int NOT NULL,
	`royaltyAmount` int NOT NULL,
	`currency` enum('USD','EUR','GBP') NOT NULL DEFAULT 'USD',
	`periodStart` timestamp NOT NULL,
	`periodEnd` timestamp NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `royaltyEvents_id` PRIMARY KEY(`id`)
);
