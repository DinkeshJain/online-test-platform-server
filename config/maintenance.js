/**
 * Maintenance Configuration
 * 
 * This file contains configuration options for automated maintenance tasks
 */

module.exports = {
  // Data consistency checking configuration
  dataConsistency: {
    // Enable/disable automatic data consistency checks
    enabled: true,
    
    // Enable/disable automatic cleanup of orphaned records
    autoCleanup: true,
    
    // Interval for consistency checks (in minutes)
    // This should match the cron schedule in server/index.js
    checkInterval: 5,
    
    // Log level for consistency checks
    // 'silent' - only log when issues found
    // 'verbose' - log all checks including successful ones
    logLevel: 'verbose'
  },

  // Test expiration checking configuration
  testExpiration: {
    // Enable/disable automatic test expiration checks
    enabled: true,
    
    // Interval for expiration checks (in minutes)
    // This should match the cron schedule in server/index.js
    checkInterval: 5
  }
};
