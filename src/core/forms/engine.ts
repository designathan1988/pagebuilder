import type { FieldConfig, MaskConfig, MaskResult, Preset, RuleCode, ValidationContext, Violation } from './types.ts';

/** Self-contained factory: exported scripts and editor previews execute this exact owner. */
export function createFormsEngine(now: () => number) {
  const digits = (text: string) => text.replace(/\D/g, '');
  const cleanId = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const repeated = (text: string) => /^(.)\1+$/.test(text);
  const mod11 = (text: string, weights: readonly number[]) => {
    const remainder = [...text].reduce((sum, char, index) => sum + (char.charCodeAt(0) - 48) * (weights[index] ?? 0), 0) % 11;
    return remainder < 2 ? '0' : String(11 - remainder);
  };
  function cpf(text: string): boolean {
    const value = digits(text);
    if (value.length !== 11 || repeated(value)) return false;
    const first = mod11(value.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return value.slice(9) === first + mod11(value.slice(0, 9) + first, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  }
  function cnpj(text: string): boolean {
    const value = cleanId(text);
    if (!/^[A-Z0-9]{12}\d{2}$/.test(value) || repeated(value)) return false;
    const first = mod11(value.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return value.slice(12) === first + mod11(value.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  }
  function pis(text: string): boolean {
    const value = digits(text);
    return value.length === 11 && !repeated(value) && mod11(value.slice(0, 10), [3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === value[10];
  }
  function voter(text: string): boolean {
    const value = digits(text);
    if (value.length !== 12 || repeated(value)) return false;
    const state = Number(value.slice(8, 10));
    if (state < 1 || state > 28) return false;
    const first = [...value.slice(0, 8)].reduce((sum, char, i) => sum + Number(char) * (i + 2), 0) % 11 % 10;
    const second = (Number(value[8]) * 7 + Number(value[9]) * 8 + first * 9) % 11 % 10;
    return value.slice(10) === `${first}${second}`;
  }
  function luhn(text: string): boolean {
    const value = digits(text);
    if (!/^\d{12,19}$/.test(value) || repeated(value)) return false;
    const sum = [...value].reverse().reduce((total, char, index) => {
      const number = Number(char) * (index % 2 === 0 ? 1 : 2);
      return total + (number > 9 ? number - 9 : number);
    }, 0);
    return sum % 10 === 0;
  }
  function cardBrand(text: string): string {
    const value = digits(text);
    if (/^4/.test(value)) return 'visa';
    if (/^(5[1-5]|2(?:2[2-9]|[3-6]\d|7[01]|720))/.test(value)) return 'mastercard';
    if (/^3[47]/.test(value)) return 'amex';
    if (/^(6011|65|64[4-9]|622(?:12[6-9]|1[3-9]\d|[2-8]\d\d|9[01]\d|92[0-5]))/.test(value)) return 'discover';
    if (/^35(?:2[89]|[3-8]\d)/.test(value)) return 'jcb';
    if (/^3(?:0[0-5]|[68])/.test(value)) return 'diners';
    if (/^62/.test(value)) return 'unionpay';
    return 'unknown';
  }
  type Slot = { readonly token: string; readonly optional: boolean; readonly literal: boolean };
  function slots(pattern: string, blocks: Readonly<Record<string, string>> = {}): Slot[] {
    let expanded = pattern;
    for (const [name, block] of Object.entries(blocks)) expanded = expanded.replaceAll(`<${name}>`, block);
    if (expanded.length > 2048 || /<[^>]+>/.test(expanded)) throw new Error('Invalid mask block');
    const result: Slot[] = [];
    let optional = 0;
    for (let i = 0; i < expanded.length; i++) {
      let char = expanded[i] ?? '';
      if (char === '[') {
        optional++;
        continue;
      }
      if (char === ']') {
        if (!optional) throw new Error('Unbalanced mask');
        optional--;
        continue;
      }
      const escaped = char === '\\';
      if (escaped) {
        char = expanded[++i] ?? '';
        if (!char) throw new Error('Invalid escape');
      }
      const literal = escaped || !['0', 'A', '*'].includes(char);
      const repeat = expanded.slice(i + 1).match(/^\{(\d+)(?:,(\d+))?\}/);
      const minimum = repeat ? Number(repeat[1]) : 1;
      const maximum = repeat ? Number(repeat[2] ?? repeat[1]) : 1;
      if (maximum > 256 || minimum > maximum) throw new Error('Invalid mask repetition');
      for (let count = 0; count < maximum; count++) result.push({ token: char, optional: optional > 0 || count >= minimum, literal });
      if (repeat) i += repeat[0].length;
    }
    if (optional) throw new Error('Unbalanced mask');
    return result;
  }
  function fixed(text: string, pattern: string, blocks?: Readonly<Record<string, string>>): MaskResult {
    const tokens = slots(pattern, blocks);
    let cursor = 0;
    let formatted = '';
    let raw = '';
    let pending = '';
    let complete = true;
    for (const slot of tokens) {
      if (slot.literal) {
        pending += slot.token;
        if (text[cursor] === slot.token) cursor++;
        continue;
      }
      const matcher = slot.token === '0' ? /\d/ : slot.token === 'A' ? /[A-Za-zÀ-ÿ]/ : /[A-Za-z0-9]/;
      let char = '';
      while (cursor < text.length) {
        const next = text[cursor++] ?? '';
        if (matcher.test(next)) {
          char = next;
          break;
        }
      }
      if (!char) {
        if (!slot.optional) complete = false;
        continue;
      }
      formatted += pending + char;
      pending = '';
      raw += char;
    }
    return { formatted, raw, complete, valid: complete };
  }
  function dateParts(text: string, format: string): { year: number; month: number; day: number } | null {
    const order = [...format.matchAll(/YYYY|MM|DD/g)].map((match) => match[0]);
    const numbers = text.match(/\d+/g);
    if (!numbers || numbers.length !== 3 || order.length !== 3) return null;
    const values = Object.fromEntries(order.map((part, index) => [part, Number(numbers[index])]));
    const year = values.YYYY ?? 0, month = values.MM ?? 0, day = values.DD ?? 0;
    if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year < 100 ? year + 400 : year, month, 0)).getUTCDate()) return null;
    return { year, month, day };
  }
  function isoDate(text: string, format = 'DD/MM/YYYY'): string | null {
    const parts = dateParts(text, format);
    return parts ? `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}` : null;
  }
  function calendar(text: string, config: MaskConfig): MaskResult {
    const format = config.format ?? (config.kind === 'time' ? 'HH:mm' : 'DD/MM/YYYY');
    const masked = fixed(text, format.replace(/YYYY|DD|MM|HH|mm|ss/g, (part) => '0'.repeat(part.length)));
    if (!masked.complete) return masked;
    const parts = [...format.matchAll(/YYYY|DD|MM|HH|mm|ss/g)].map((match) => match[0]);
    const values = masked.formatted.match(/\d+/g) ?? [];
    const mapped = Object.fromEntries(parts.map((part, i) => [part, Number(values[i])]));
    if (config.kind === 'time') {
      const valid = (mapped.HH ?? 0) < 24 && (mapped.mm ?? 0) < 60 && (mapped.ss ?? 0) < 60;
      if (!valid && config.autocorrect) {
        const formatted = format.replace(/HH|mm|ss/g, (part) => String(Math.min(part === 'HH' ? 23 : 59, mapped[part] ?? 0)).padStart(2, '0'));
        return { formatted, raw: formatted, complete: true, valid: true };
      }
      return { ...masked, raw: masked.formatted, valid };
    }
    let normalized = isoDate(masked.formatted, format);
    if (!normalized && config.autocorrect) {
      const year = Math.max(1, Math.min(9999, mapped.YYYY ?? 1));
      const month = Math.max(1, Math.min(12, mapped.MM ?? 1));
      const day = Math.max(1, Math.min(new Date(Date.UTC(year < 100 ? year + 400 : year, month, 0)).getUTCDate(), mapped.DD ?? 1));
      const formatted = format.replace(/YYYY|MM|DD/g, (part) => String(part === 'YYYY' ? year : part === 'MM' ? month : day).padStart(part.length, '0'));
      normalized = isoDate(formatted, format);
      return { formatted, raw: normalized ?? '', complete: true, valid: normalized !== null };
    }
    return { ...masked, raw: normalized ?? masked.raw, valid: normalized !== null };
  }
  // The marks a language writes a number with: its decimal mark, and its group mark read from a number long enough that
  // every language groups it (es and pt-PT group four digits only from five on), never the decimal mark (DATA-11).
  function marksOf(locale: string): { readonly decimal: string; readonly group: string } {
    const decimal = new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === 'decimal')?.value ?? '.';
    const group = new Intl.NumberFormat(locale, { useGrouping: true }).formatToParts(1234567).find((part) => part.type === 'group')?.value ?? '';
    return { decimal, group: group === decimal ? '' : group };
  }
  // A number as a person writes it in a language ("1.234,5" in pt-BR, "1,234.5" in en) as the digits a number reads:
  // its group marks dropped and its decimal mark a dot.
  function plainNumber(text: string, locale: string): string {
    const { decimal, group } = marksOf(locale);
    return (group === '' ? text : text.replaceAll(group, '')).replace(decimal, '.');
  }
  // The mask's language: its own, else the page's (DATA-10: an English page read "2.5" as 25 with pt-BR's marks).
  function numeric(text: string, config: MaskConfig, pageLocale?: string): MaskResult {
    const locale = config.locale ?? pageLocale ?? 'en';
    const { decimal } = marksOf(locale);
    // what the mask wrote after the number is no part of it: a unit's digits ("m2") would be read again (DATA-12)
    let source = text.trimEnd();
    if (config.suffix && source.endsWith(config.suffix)) source = source.slice(0, -config.suffix.length);
    if (config.kind === 'percent') source = source.replace(/%\s*$/, '');
    let input = plainNumber(source, locale).replace(/[^\d.-]/g, '');
    const negative = input.startsWith('-') && config.negative !== false;
    input = input.replaceAll('-', '');
    const [whole = '', fraction, ...extra] = input.split('.');
    if (!whole && !fraction) return { formatted: negative ? '-' : '', raw: negative ? '-' : '', complete: false, valid: false };
    const precision = config.precision ?? (config.kind === 'currency' ? new Intl.NumberFormat(locale, { style: 'currency', currency: config.currency ?? 'BRL' }).resolvedOptions().maximumFractionDigits : 2) ?? 2;
    const raw = `${negative ? '-' : ''}${whole || '0'}${fraction !== undefined ? `.${fraction.slice(0, precision)}` : ''}`;
    const value = Number(raw);
    const valid = Number.isFinite(value) && extra.length === 0 && (config.minimum === undefined || value >= config.minimum) && (config.maximum === undefined || value <= config.maximum);
    const options: Intl.NumberFormatOptions = { minimumFractionDigits: fraction?.length ? Math.min(fraction.length, precision) : 0, maximumFractionDigits: precision };
    if (config.kind === 'currency') {
      options.style = 'currency';
      options.currency = config.currency ?? 'BRL';
    }
    let formatted = new Intl.NumberFormat(locale, options).format(value);
    if (fraction === '' && precision > 0) formatted += decimal;
    if (config.kind === 'percent') formatted += '%';
    if (config.suffix) formatted += ` ${config.suffix}`;
    return { formatted, raw, complete: true, valid };
  }
  function checkPreset(preset: Preset, text: string, today = new Date(now()).toISOString().slice(0, 10)): boolean {
    const value = cleanId(text), number = digits(text);
    switch (preset) {
      case 'cpf': return cpf(text);
      case 'cnpj': return cnpj(text);
      case 'cpf-cnpj': return /[A-Za-z]/.test(text) || number.length > 11 ? cnpj(text) : cpf(text);
      case 'pis': return pis(text);
      case 'voter': return voter(text);
      case 'cep': return /^\d{8}$/.test(number);
      case 'phone-br': return /^[1-9]{2}(?:[2-5]\d{7}|9\d{8})$/.test(number);
      case 'phone-international': return /^\+[1-9]\d{6,14}$/.test(text.replace(/[\s()-]/g, ''));
      // RG formats vary by issuing state: no invented national check digit.
      case 'rg': return /^[A-Z0-9]{5,14}$/.test(value);
      case 'plate': return /^[A-Z]{3}(?:\d{4}|\d[A-Z]\d{2})$/.test(value);
      case 'card': return luhn(text);
      case 'expiry': { const match = text.match(/^(\d{2})\/(\d{2})$/);
          return !!match && Number(match[1]) >= 1 && Number(match[1]) <= 12 && `20${match[2]}-${match[1]}` >= today.slice(0, 7);
        }
      case 'cvv': return /^\d{3,4}$/.test(text);
      case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
      case 'url': try {
          const url = new URL(text);
          return ['http:', 'https:'].includes(url.protocol) && !!url.hostname;
        } catch {
          return false;
        }
      case 'date-br': return isoDate(text) !== null;
      case 'time': return /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(text);
      case 'currency': case 'measurement': return text !== '';
    }
  }
  function mask(text: string, config: MaskConfig = { kind: 'none' }, locale?: string): MaskResult {
    if (config.kind === 'none') return { formatted: text, raw: text, complete: true, valid: true };
    if (config.kind === 'uppercase' || config.kind === 'lowercase') {
      const value = config.kind === 'uppercase' ? text.toLocaleUpperCase(config.locale) : text.toLocaleLowerCase(config.locale);
      return { formatted: value, raw: value, complete: true, valid: true };
    }
    if (config.kind === 'fixed' || config.kind === 'custom') return fixed(text, config.pattern ?? '', config.blocks);
    if (config.kind === 'dynamic') {
      const count = cleanId(text).length;
      const choices = [...(config.alternatives ?? [])].sort((a, b) => a.maxLength - b.maxLength);
      const choice = choices.find((one) => count <= one.maxLength) ?? choices.at(-1);
      return fixed(text, choice?.pattern ?? '');
    }
    if (config.kind === 'number' || config.kind === 'currency' || config.kind === 'percent') return numeric(text, config, locale);
    if (config.kind === 'date' || config.kind === 'time') return calendar(text, config);
    if (config.kind === 'regex') {
      const valid = new RegExp(`^(?:${config.pattern ?? ''})$`, 'u').test(text);
      return { formatted: text, raw: text, complete: valid, valid };
    }
    const preset = config.preset ?? 'cpf';
    let result: MaskResult;
    const patterns: Partial<Record<Preset, string>> = { cpf: '000.000.000-00', cnpj: '**.***.***/****-00', cep: '00000-000', pis: '000.00000.00-0', voter: '0000 0000 0000', rg: '*{5,14}', expiry: '00/00', cvv: '0{3,4}' };
    if (preset === 'cpf-cnpj') return mask(text, { ...config, preset: /[A-Za-z]/.test(text) || digits(text).length > 11 ? 'cnpj' : 'cpf' }, locale);
    if (preset === 'phone-br') result = fixed(text, digits(text).length > 10 ? '(00) 00000-0000' : '(00) 0000-0000');
    else if (preset === 'phone-international') result = fixed(text, '+0{7,15}');
    else if (preset === 'plate') result = fixed(text.toUpperCase(), /[A-Za-z]/.test(cleanId(text)[4] ?? '') ? 'AAA0A00' : 'AAA-0000');
    else if (preset === 'card') {
      const brand = cardBrand(text);
      result = { ...fixed(text, brand === 'amex' ? '0000 000000 00000' : '0000 0000 0000 0{1,7}'), brand };
    }
    else if (preset === 'date-br' || preset === 'time') result = calendar(text, { ...config, kind: preset === 'time' ? 'time' : 'date' });
    else if (preset === 'currency' || preset === 'measurement') return numeric(text, { ...config, kind: preset === 'currency' ? 'currency' : 'number' }, locale);
    else if (patterns[preset]) result = fixed(text.toUpperCase(), patterns[preset]);
    else result = { formatted: text, raw: text, complete: true, valid: true };
    return { ...result, valid: result.valid && checkPreset(preset, result.formatted) };
  }
  function validate(text: string, config: FieldConfig, context: ValidationContext = {}): Violation[] {
    const rules = config.rules ?? {};
    const violations: Violation[] = [];
    const add = (code: RuleCode) => {
      const locale = context.locale ?? config.mask?.locale ?? 'en';
      const messages = config.messages?.[locale] ?? config.messages?.[locale.split('-')[0] ?? ''] ?? config.messages?.en;
      violations.push({ code, message: messages?.[code] ?? code });
    };
    if (rules.required && !text && !context.files?.length) add('required');
    if (!text && !context.files?.length) return violations;
    let result: MaskResult;
    try {
      result = mask(text, config.mask, context.locale);
    } catch {
      add('configuration');
      return violations;
    }
    if (!result.valid) add('preset');
    if (config.mask?.kind === 'preset' && config.mask.preset === 'expiry' && !checkPreset('expiry', text, context.today)) {
      if (!violations.some((one) => one.code === 'preset')) add('preset');
    }
    const raw = result.raw;
    // the number a rule compares: a numeric mask's raw value, else the text read with the page's marks ("6,50" on a
    // pt-BR page is 6.5, DATA-13); a text with no digits, or with more than a number holds, is none
    const numericMask = ['number', 'currency', 'percent'].includes(config.mask?.kind ?? 'none') || config.mask?.kind === 'preset' && ['currency', 'measurement'].includes(config.mask.preset ?? '');
    const written = numericMask || context.numeric === true ? raw.trim() : plainNumber(raw.trim(), config.mask?.locale ?? context.locale ?? 'en');
    const number = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(written) ? Number(written) : Number.NaN;
    if (rules.type === 'email' && !checkPreset('email', text) || rules.type === 'url' && !checkPreset('url', text) || rules.type === 'number' && !Number.isFinite(number)) add('type');
    if (rules.pattern) {
      try {
        if (!new RegExp(`^(?:${rules.pattern})$`, 'u').test(text)) add('pattern');
      } catch {
        add('configuration');
      }
    }
    if (rules.minLength !== undefined && text.length < rules.minLength) add('tooShort');
    if (rules.maxLength !== undefined && text.length > rules.maxLength) add('tooLong');
    if (rules.minimum !== undefined && (!Number.isFinite(number) || number < rules.minimum)) add('minimum');
    if (rules.maximum !== undefined && (!Number.isFinite(number) || number > rules.maximum)) add('maximum');
    if (rules.step !== undefined) {
      const quotient = (number - (rules.minimum ?? 0)) / rules.step;
      if (!(rules.step > 0) || !Number.isFinite(quotient) || Math.abs(quotient - Math.round(quotient)) > 1e-8) add('step');
    }
    if (rules.equalTo !== undefined && text !== context.fields?.[rules.equalTo]) add('equalTo');
    const strength = rules.password;
    if (strength && (text.length < strength.minLength || strength.uppercase && !/[A-Z]/.test(text) || strength.lowercase && !/[a-z]/.test(text) || strength.digit && !/\d/.test(text) || strength.symbol && !/[^\p{L}\p{N}\s]/u.test(text))) add('password');
    if (rules.allowed && !rules.allowed.includes(raw)) add('allowed');
    const today = context.today ?? new Date(now()).toISOString().slice(0, 10);
    const relative = (boundary: string): string => {
      const match = boundary.match(/^today(?:([+-])(\d+)d)?$/);
      if (!match) return boundary;
      const date = new Date(`${today}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() + Number(match[2] ?? 0) * (match[1] === '-' ? -1 : 1));
      return date.toISOString().slice(0, 10);
    };
    const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? isoDate(raw, 'YYYY-MM-DD') : isoDate(text, config.mask?.format);
    if (rules.dateMinimum && (!date || date < relative(rules.dateMinimum))) add('dateMinimum');
    if (rules.dateMaximum && (!date || date > relative(rules.dateMaximum))) add('dateMaximum');
    if (rules.file) {
      const files = context.files ?? [];
      if (rules.file.accept?.length && files.some((file) => !rules.file?.accept?.some((accept) => accept.startsWith('.') ? file.name.toLowerCase().endsWith(accept.toLowerCase()) : accept.endsWith('/*') ? file.type.startsWith(accept.slice(0, -1)) : file.type === accept))) add('fileType');
      if (rules.file.maxBytes !== undefined && files.some((file) => file.size > (rules.file?.maxBytes ?? Infinity)) || rules.file.maxTotalBytes !== undefined && files.reduce((sum, file) => sum + file.size, 0) > rules.file.maxTotalBytes) add('fileSize');
    }
    return violations;
  }
  return { mask, validate, cpf, cnpj, pis, voter, luhn, cardBrand, checkPreset, isoDate };
}

export type FormsEngine = ReturnType<typeof createFormsEngine>;
