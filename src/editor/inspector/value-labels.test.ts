// The keyword buttons' names in both languages (the final use's USE-10): every value a keyword-buttons property offers
// has its name in the catalogues (value.<property>.<value>), which the buttons' tooltips and accessible names say,
// so the Portuguese inspector never names Text align's buttons "start", "center" or "justify".
import { describe, expect, it } from 'vitest';
import { GENERATED_VALUES } from '../../generated/value-lists.ts';
import type { StyleTargetId } from '../../generated/ids.ts';
import { hasText } from '../../i18n/index.ts';
import { manifest } from '../../manifest/runtime.ts';

const keywordButtons = manifest.properties.properties.filter((p) => p.control === 'keyword-buttons');

describe('the keyword buttons', () => {
  it('name every value they offer in English and in Portuguese', () => {
    const missing: string[] = [];
    for (const property of keywordButtons) {
      const values = new Set([
        ...(GENERATED_VALUES[property.id as StyleTargetId]?.keywords ?? []),
        ...property.subsets.flatMap((subset) => subset.values ?? []),
        ...Object.keys(property.icons),
      ]);
      for (const value of values) {
        for (const locale of ['en', 'pt-BR'] as const) if (!hasText(locale, `value.${property.id}.${value}`)) missing.push(`${locale} value.${property.id}.${value}`);
      }
    }
    expect(keywordButtons.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });
});
