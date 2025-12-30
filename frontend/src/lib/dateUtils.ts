import { DateTime } from 'luxon';

export function formatToBeijingTime(date: string | Date): string {
    if (!date) {
        return 'Invalid Date';
    }

    // Luxon's fromISO can handle the string directly.
    // We assume the incoming string is UTC, which it is from our backend.
    const dt = (typeof date === 'string' ? DateTime.fromISO(date, { zone: 'utc' }) : DateTime.fromJSDate(date));

    if (!dt.isValid) {
        return 'Invalid Date';
    }

    // Set the zone to 'Asia/Shanghai' (which is the IANA name for Beijing time)
    // and format it to the desired string format.
    return dt.setZone('Asia/Shanghai').toFormat('yyyy-MM-dd HH:mm:ss');
}

export function formatToUTCTime(date: string | Date): string {
    if (!date) {
        return 'Invalid Date';
    }

    const dt = (typeof date === 'string' ? DateTime.fromISO(date, { zone: 'utc' }) : DateTime.fromJSDate(date));

    if (!dt.isValid) {
        return 'Invalid Date';
    }

    return dt.toFormat('yyyy-MM-dd HH:mm:ss');
}
