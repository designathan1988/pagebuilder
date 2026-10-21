// The audit's TPL-13: the shop's cart sends its orders to the WhatsApp number in data-wc-whatsapp, which its own
// Settings field and the custom attribute's row both write through element.setCustomAttribute; the command keeps the
// number's digits and refuses what is no phone number, whichever field it came from (rule G3).
import { describe, expect, it } from 'vitest';
import { documentOf, node, runHandler } from '../testing/handlers.ts';
import { setCustomAttributeCommand, whatsappNumber } from './attributes.ts';

const page = documentOf({ pages: [{ id: 'p', name: 'Home', file: 'index.html', tree: node('root', 'page', 'body', { children: [node('cart', 'div', 'div', { customAttributes: { 'data-wc': 'cart', 'data-wc-whatsapp': '' } })] }) }] });
const write = (value: string) => runHandler(setCustomAttributeCommand, page, { name: 'data-wc-whatsapp', value }, { selection: ['cart'] });

describe('the cart’s WhatsApp number (TPL-13)', () => {
  it('reads a number written with its country and area codes, keeping its digits', () => {
    expect(whatsappNumber('+55 (11) 98765-4321')).toBe('5511987654321');
    expect(whatsappNumber('1 415 555 2671')).toBe('14155552671');
    expect(whatsappNumber('  ')).toBe('');
    expect(whatsappNumber('98765-4321')).toBeNull();
    expect(whatsappNumber('5511 9876 call me')).toBeNull();
    expect(whatsappNumber('1234567890123456')).toBeNull();
  });

  it('writes the digits, and refuses what is no phone number with the rule in words', () => {
    const kept = write('+55 (11) 98765-4321');
    expect(kept.outcome.kind).toBe('change');
    expect(kept.document.pages[0]?.tree.children[0]?.customAttributes).toEqual({ 'data-wc': 'cart', 'data-wc-whatsapp': '5511987654321' });
    const refused = write('call us');
    expect(refused.outcome).toEqual({ kind: 'refused', message: { key: 'status.attribute.whatsappNumber', params: { value: 'call us', min: 10, max: 15 } } });
    // emptied: no number yet, which the Checks then report
    expect(write('').outcome.kind).toBe('change');
  });
});
