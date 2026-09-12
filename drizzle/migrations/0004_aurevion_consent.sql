ALTER TABLE `aurevion_sessions` ADD COLUMN IF NOT EXISTS `consentVersion` varchar(64) NULL;
ALTER TABLE `aurevion_sessions` ADD COLUMN IF NOT EXISTS `consentLocale` varchar(8) NULL;
ALTER TABLE `aurevion_sessions` ADD COLUMN IF NOT EXISTS `consentAcceptedAt` timestamp NULL;
