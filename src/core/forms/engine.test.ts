import { describe, expect, it } from 'vitest';
import { createFormsEngine } from './engine.ts';
import { fieldConfigSchema, formConfigSchema, maskSchema, readFieldConfig } from './config.ts';

const engine = createFormsEngine(() => Date.UTC(2026, 9, 1));
describe('forms masks and document validators', () => {
  it.each([
    ['cpf', '52998224725', '529.982.247-25', true], ['cpf', '52998224726', '529.982.247-26', false],
    ['cnpj', '11222333000181', '11.222.333/0001-81', true], ['cnpj', '11222333000182', '11.222.333/0001-82', false],
    ['cep', '01310100', '01310-100', true], ['phone-br', '1133334444', '(11) 3333-4444', true],
    ['phone-br', '11988887777', '(11) 98888-7777', true], ['phone-international', '+14155552671', '+14155552671', true],
    ['rg', '12345678X', '12345678X', true], ['pis', '12044567891', '120.44567.89-1', true],
    ['plate', 'abc1234', 'ABC-1234', true], ['plate', 'abc1d23', 'ABC1D23', true],
    ['card', '4111111111111111', '4111 1111 1111 1111', true], ['card', '4111111111111112', '4111 1111 1111 1112', false],
    ['cvv', '123', '123', true], ['cvv', '1234', '1234', true], ['cvv', '12', '12', false],
    ['email', 'a@example.org', 'a@example.org', true], ['email', 'a@', 'a@', false],
    ['url', 'https://example.org/path', 'https://example.org/path', true], ['url', 'javascript:alert(1)', 'javascript:alert(1)', false],
    ['date-br', '29022024', '29/02/2024', true], ['date-br', '29022023', '29/02/2023', false],
    ['time', '2359', '23:59', true], ['time', '2561', '25:61', false],
  ] as const)('%s masks %s and verifies validity', (preset, value, formatted, valid) => {
    expect(engine.mask(value, { kind: 'preset', preset })).toMatchObject({ formatted, valid });
  });
  it('validates numeric and new alphanumeric CNPJ with the same ASCII-48 checksum', () => {
    expect(engine.cnpj('12.ABC.345/01DE-35')).toBe(true);
    expect(engine.cnpj('12.ABC.345/01DE-36')).toBe(false);
    expect(engine.cnpj('00.000.000/0000-00')).toBe(false);
    expect(engine.cpf('111.111.111-11')).toBe(false);
  });
  it('verifies voter identifiers including state and check digits', () => {
    expect(engine.mask('012345670191', { kind: 'preset', preset: 'voter' })).toMatchObject({ formatted: '0123 4567 0191', valid: true });
    expect(engine.voter('012345670190')).toBe(false);
    expect(engine.voter('012345679991')).toBe(false);
  });
  it('switches telephone and CPF/CNPJ masks without dropping digits', () => {
    expect(engine.mask('11.222.333/0001-81', { kind: 'preset', preset: 'cpf-cnpj' })).toMatchObject({ raw: '11222333000181', valid: true });
    expect(engine.mask('52998224725', { kind: 'preset', preset: 'cpf-cnpj' })).toMatchObject({ formatted: '529.982.247-25', valid: true });
    expect(engine.mask('12345', { kind: 'dynamic', alternatives: [{ pattern: '00-00', maxLength: 4 }, { pattern: '000-000', maxLength: 6 }] }).formatted).toBe('123-45');
  });
  it('handles blocks, nested optional parts, repeated slots, and literals', () => {
    expect(engine.mask('AB1234', { kind: 'custom', pattern: '<prefix>-0{2,4}[ AA]', blocks: { prefix: 'AA' } })).toMatchObject({ formatted: 'AB-1234', raw: 'AB1234', complete: true });
    expect(engine.mask('123', { kind: 'fixed', pattern: '\\A000' }).formatted).toBe('A123');
    expect(() => engine.mask('1', { kind: 'custom', pattern: '[00' })).toThrow();
    expect(() => engine.mask('1', { kind: 'custom', pattern: '0{999}' })).toThrow();
  });
  it('formats localized decimals, negatives, currencies, percent and measures', () => {
    expect(engine.mask('-1.234,56', { kind: 'number', locale: 'pt-BR' })).toMatchObject({ raw: '-1234.56', formatted: '-1.234,56', valid: true });
    expect(engine.mask('1,234.56', { kind: 'currency', locale: 'en-US', currency: 'USD' })).toMatchObject({ raw: '1234.56', formatted: '$1,234.56' });
    expect(engine.mask('12,5', { kind: 'percent', locale: 'pt-BR', maximum: 100 })).toMatchObject({ raw: '12.5', formatted: '12,5%' });
    expect(engine.mask('101', { kind: 'percent', maximum: 100 }).valid).toBe(false);
    expect(engine.mask('12,5', { kind: 'preset', preset: 'measurement', suffix: 'kg' }, 'pt-BR').formatted).toBe('12,5 kg');
    // a mask with no locale reads in the page's language, never pt-BR's marks on an English page (DATA-10)
    expect(engine.mask('2.5', { kind: 'number' }, 'en')).toMatchObject({ formatted: '2.5', raw: '2.5' });
    // a language that groups four digits only from five on keeps its decimal comma (DATA-11)
    expect(engine.mask('12,50', { kind: 'currency', locale: 'es', currency: 'EUR' })).toMatchObject({ raw: '12.50', formatted: expect.stringMatching(/^12,50\s€$/u) });
    // a unit with a digit is no part of the number (DATA-12)
    expect(engine.mask('12,5 m2', { kind: 'preset', preset: 'measurement', suffix: 'm2' }, 'pt-BR')).toMatchObject({ raw: '12.5', formatted: '12,5 m2' });
    // a number rule reads a text field in the page's marks, an input of type number as HTML writes it (DATA-13)
    expect(engine.validate('6,50', { rules: { type: 'number', minimum: 1 } }, { locale: 'pt-BR' })).toEqual([]);
    expect(engine.validate('6.5', { rules: { type: 'number', minimum: 6, maximum: 7 } }, { locale: 'pt-BR', numeric: true })).toEqual([]);
    expect(engine.mask('12.5', { kind: 'currency', locale: 'en-US', currency: 'EUR' }).formatted).toBe('€12.5');
    expect(engine.mask('-', { kind: 'number' }).complete).toBe(false);
  });
  it('supports date formats, leap years and explicit calendar correction', () => {
    expect(engine.mask('20240229', { kind: 'date', format: 'YYYY-MM-DD' })).toMatchObject({ raw: '2024-02-29', valid: true });
    expect(engine.mask('31022024', { kind: 'date', autocorrect: true })).toMatchObject({ formatted: '29/02/2024', valid: true });
    expect(engine.mask('259988', { kind: 'time', format: 'HH:mm:ss', autocorrect: true })).toMatchObject({ formatted: '23:59:59', valid: true });
    expect(engine.checkPreset('expiry', '02/24', '2024-02-29')).toBe(true);
    expect(engine.checkPreset('expiry', '01/24', '2024-02-01')).toBe(false);
  });
  it('supports regular expressions and locale-aware case conversion', () => {
    expect(engine.mask('AB123', { kind: 'regex', pattern: '[A-Z]{2}\\d{3}' }).valid).toBe(true);
    expect(engine.mask('AB12', { kind: 'regex', pattern: '[A-Z]{2}\\d{3}' }).valid).toBe(false);
    expect(engine.mask('ação', { kind: 'uppercase', locale: 'pt-BR' }).raw).toBe('AÇÃO');
    expect(engine.mask('AÇÃO', { kind: 'lowercase', locale: 'pt-BR' }).raw).toBe('ação');
  });
  it('detects card brands and distinguishes checksum from issuer detection', () => {
    expect(engine.mask('378282246310005', { kind: 'preset', preset: 'card' })).toMatchObject({ formatted: '3782 822463 10005', brand: 'amex', valid: true });
    expect(engine.cardBrand('5555555555554444')).toBe('mastercard');
    expect(engine.cardBrand('6011111111111117')).toBe('discover');
    expect(engine.luhn('0000000000000000')).toBe(false);
  });
  it('validates native constraints, optional empty fields and localized messages', () => {
    expect(engine.validate('', { rules: { minLength: 5 } })).toEqual([]);
    expect(engine.validate('', { rules: { required: true }, messages: { 'pt-BR': { required: 'Obrigatório' } } }, { locale: 'pt-BR' })).toEqual([{ code: 'required', message: 'Obrigatório' }]);
    expect(engine.validate('3', { rules: { minimum: 4, minLength: 2, step: 2 } }).map((one) => one.code)).toEqual(['tooShort', 'minimum', 'step']);
    expect(engine.validate('5', { rules: { maximum: 4, pattern: '[A-Z]+' } }).map((one) => one.code)).toEqual(['pattern', 'maximum']);
    expect(engine.validate('0.3', { rules: { type: 'number', step: 0.1 } })).toEqual([]);
  });
  it('validates cross-field equality, password strength and permitted values', () => {
    expect(engine.validate('other', { rules: { equalTo: 'password' } }, { fields: { password: 'secret' } })[0]?.code).toBe('equalTo');
    expect(engine.validate('Aa123456!', { rules: { password: { minLength: 8, uppercase: true, lowercase: true, digit: true, symbol: true } } })).toEqual([]);
    expect(engine.validate('aaaaaaaa', { rules: { password: { minLength: 8, uppercase: true } } })[0]?.code).toBe('password');
    expect(engine.validate('no', { rules: { allowed: ['yes'] } })[0]?.code).toBe('allowed');
  });
  it('validates relative calendar boundaries with an injected date', () => {
    const config = { mask: { kind: 'date' as const }, rules: { dateMinimum: 'today-1d', dateMaximum: 'today+1d' } };
    expect(engine.validate('29/02/2024', config, { today: '2024-03-01' })).toEqual([]);
    expect(engine.validate('28/02/2024', config, { today: '2024-03-01' })[0]?.code).toBe('dateMinimum');
    expect(engine.validate('03/03/2024', config, { today: '2024-03-01' })[0]?.code).toBe('dateMaximum');
  });
  it('checks every uploaded file MIME/extension and individual/total size', () => {
    const config = { rules: { required: true, file: { accept: ['image/*', '.pdf'], maxBytes: 100, maxTotalBytes: 150 } } };
    expect(engine.validate('', config, { files: [{ name: 'A.PDF', type: '', size: 90 }] })).toEqual([]);
    expect(engine.validate('', config, { files: [{ name: 'x.exe', type: 'application/octet-stream', size: 101 }] }).map((one) => one.code)).toEqual(['fileType', 'fileSize']);
    expect(engine.validate('', config, { files: [{ name: 'a.png', type: 'image/png', size: 90 }, { name: 'b.png', type: 'image/png', size: 90 }] })[0]?.code).toBe('fileSize');
  });
  it('refuses malformed persisted configurations before patches', () => {
    expect(readFieldConfig('{')).toBeNull();
    expect(maskSchema.safeParse({ kind: 'custom', pattern: '[0' }).success).toBe(false);
    expect(maskSchema.safeParse({ kind: 'number', minimum: 5, maximum: 2 }).success).toBe(false);
    expect(fieldConfigSchema.safeParse({ rules: { pattern: '[' } }).success).toBe(false);
    expect(formConfigSchema.safeParse({ destination: 'webhook', endpoint: 'javascript:alert(1)' }).success).toBe(false);
    expect(formConfigSchema.safeParse({ destination: 'email-service' }).success).toBe(false);
    expect(formConfigSchema.safeParse({ destination: 'endpoint', endpoint: 'https://example.org/contact', encoding: 'form' }).success).toBe(true);
  });
});
