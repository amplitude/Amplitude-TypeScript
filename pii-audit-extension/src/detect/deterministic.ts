const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SSN = /^\d{3}-\d{2}-\d{4}$/;
const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;
const PHONE = /^\+?[\d][\d\s().-]{7,}\d$/;
const CARD_LIKE = /^\d[\d\s-]{11,22}\d$/;
const CURRENCY = /^[$€£¥]\s?[\d,]+(\.\d+)?$/;
const NUMERIC = /^[\d,.\s%]+$/;
const DATE = /^(\d{1,4}[/-]\d{1,2}[/-]\d{1,4}|\d{1,2}\s\w+\s\d{2,4})$/;

export function luhn(digits: string): boolean {
  const d = digits.replace(/\D/g, '');
  if (d.length < 12) return false;
  let sum = 0,
    alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function detectStructured(value: string): { category: string } | null {
  const v = value.trim();
  if (EMAIL.test(v)) return { category: 'email' };
  if (SSN.test(v)) return { category: 'ssn' };
  if (IPV4.test(v)) return { category: 'ip' };
  if (IBAN.test(v.replace(/\s/g, ''))) return { category: 'iban' };
  if (CARD_LIKE.test(v)) return luhn(v) ? { category: 'credit-card' } : null;
  if (PHONE.test(v) && v.replace(/\D/g, '').length >= 9) return { category: 'phone' };
  return null;
}

export function isNoise(value: string): boolean {
  const v = value.trim();
  if (v.length < 3) return true;
  if (CURRENCY.test(v) || NUMERIC.test(v) || DATE.test(v)) return true;
  // short label with no whitespace-separated multi-token free text and <= 2 words
  const words = v.split(/\s+/);
  if (words.length <= 2 && v.length <= 12 && !/[@\d]/.test(v)) return true;
  return false;
}
