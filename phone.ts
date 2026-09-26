/**
 * Phone number normalization and validation utilities for WhatsApp numbers.
 * Conforms to E.164 standard formatting to prevent duplicates caused by formatting differences.
 */

export function normalizePhoneNumber(input: string): string {
  if (!input) return '';
  let cleaned = input.trim().replace(/[\s\-\(\)\.]+/g, '');

  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2);
  }

  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1).replace(/\D/g, '');
    return digits ? `+${digits}` : '';
  }

  const digits = cleaned.replace(/\D/g, '');
  if (!digits) return '';

  // 10-digit Indian standard mobile number without country code
  if (digits.length === 10) {
    return `+91${digits}`;
  }

  // 12-digit Indian number with country code without plus (e.g. 919876543210)
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }

  // Fallback: prefix '+' to digit string
  return `+${digits}`;
}

export function isValidPhoneNumber(input: string): boolean {
  const normalized = normalizePhoneNumber(input);
  if (!normalized.startsWith('+')) return false;
  const digits = normalized.slice(1);
  // E.164 requires 7 to 15 digits
  return /^\d{7,15}$/.test(digits);
}

export function formatPhoneDisplay(phone: string): string {
  if (!phone) return '';
  const normalized = normalizePhoneNumber(phone);
  // Format +91 XXXXX XXXXX if 10-digit Indian number
  if (normalized.startsWith('+91') && normalized.length === 13) {
    return `+91 ${normalized.slice(3, 8)} ${normalized.slice(8)}`;
  }
  return normalized;
}
