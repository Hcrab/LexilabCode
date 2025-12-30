/**
 * Formats a date string or Date object into a human-readable string in a specific timezone.
 * @param dateInput The date to format (ISO string or Date object).
 * @param timeZone The IANA timezone name (e.g., 'Asia/Shanghai', 'America/New_York').
 * @returns A formatted date-time string, or an error message if the date is invalid.
 */
export const formatDateInTimezone = (
  dateInput: string | Date | null | undefined,
  timeZone: string = 'Asia/Shanghai'
): string => {
  if (!dateInput) {
    return 'N/A';
  }

  try {
    // The backend now provides consistent UTC strings, so direct parsing is safe.
    const date = new Date(dateInput);

    // Check for invalid date
    if (isNaN(date.getTime())) {
      // Try to handle strings that might not be directly parseable but are valid dates
      const parsedDate = new Date(String(dateInput).replace(' ', 'T') + 'Z');
      if (isNaN(parsedDate.getTime())) return 'Invalid Date';
      return formatWithIntl(parsedDate, timeZone);
    }

    return formatWithIntl(date, timeZone);
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Formatting Error';
  }
};

const formatWithIntl = (date: Date, timeZone: string): string => {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: timeZone,
    hour12: false, // Use 24-hour format
  });

  return formatter.format(date);
}
