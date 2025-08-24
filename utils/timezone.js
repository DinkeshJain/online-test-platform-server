// utils/timezone.js
const moment = require('moment-timezone');

class TimezoneUtils {
  static IST_TIMEZONE = 'Asia/Kolkata';
  
  /**
   * Convert UTC date to IST for display
   * @param {Date|string} utcDate - UTC date
   * @returns {string} - Formatted IST date string
   */
  static toIST(utcDate) {
    if (!utcDate) return null;
    return moment(utcDate).tz(TimezoneUtils.IST_TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
  }
  
  /**
   * Convert IST datetime-local input to UTC for storage
   * @param {string} istDateTimeLocal - IST datetime-local string (YYYY-MM-DDTHH:mm)
   * @returns {Date} - UTC Date object
   */
  static fromISTToUTC(istDateTimeLocal) {
    if (!istDateTimeLocal) return null;
    // Parse as IST and convert to UTC
    return moment.tz(istDateTimeLocal, 'YYYY-MM-DDTHH:mm', TimezoneUtils.IST_TIMEZONE).utc().toDate();
  }
  
  /**
   * Convert UTC date to IST datetime-local format for frontend
   * @param {Date|string} utcDate - UTC date
   * @returns {string} - IST datetime-local string (YYYY-MM-DDTHH:mm)
   */
  static toISTDateTimeLocal(utcDate) {
    if (!utcDate) return '';
    return moment(utcDate).tz(TimezoneUtils.IST_TIMEZONE).format('YYYY-MM-DDTHH:mm');
  }
  
  /**
   * Get current IST date
   * @returns {Date} - Current date in IST
   */
  static nowIST() {
    return moment().tz(TimezoneUtils.IST_TIMEZONE).toDate();
  }
  
  /**
   * Format date for display with IST label
   * @param {Date|string} date - Date to format
   * @returns {string} - Formatted date with IST label
   */
  static formatForDisplay(date) {
    if (!date) return 'N/A';
    return moment(date).tz(TimezoneUtils.IST_TIMEZONE).format('DD MMM YYYY, hh:mm A [IST]');
  }
}

module.exports = TimezoneUtils;