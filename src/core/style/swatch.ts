// The colour a swatch of the editor wears for a value that names variables (var(--brand)): each var() is the
// variable's value in the project, its aliases followed, else its fallback, else transparent (the checkerboard). The
// swatch lives in the editor's document, where the project's variables are not defined (only the canvas's :root has
// them): var(--brand) there made the swatch's whole background invalid, and it drew neither the colour nor its
// checkerboard (the shell audit's UI-4). A value that names none is itself. Pure: it reads the text and the project's
// variables only, so every swatch (a colour field, the colour picker, the Variables panel) reads it alike.
const VARIABLE_REFERENCE = /var\(\s*--([^\s,()]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g;
const ALIAS_DEPTH = 8;

export function swatchColour(text: string, tokens: readonly { readonly name: string; readonly value: string }[]): string {
  let out = text;
  for (let depth = 0; depth < ALIAS_DEPTH && out.includes('var('); depth += 1) {
    out = out.replace(VARIABLE_REFERENCE, (_whole, name: string, fallback: string | undefined) => tokens.find((token) => token.name === name)?.value ?? fallback?.trim() ?? 'transparent');
  }
  return out.includes('var(') ? 'transparent' : out;
}

// The same reading for a reader that must not guess (the Checks panel's contrast rule): each var() is the variable's
// value, its aliases followed, else its fallback; a variable the project does not define and that names no fallback,
// or an alias chain deeper than the swatch follows, makes the whole value unknown (null) instead of transparent.
export function resolvedVariables(text: string, tokens: readonly { readonly name: string; readonly value: string }[]): string | null {
  const valueOf = (name: string, fallback: string | undefined): string | undefined => tokens.find((token) => token.name === name)?.value ?? fallback?.trim();
  let out = text;
  for (let depth = 0; depth < ALIAS_DEPTH && out.includes('var('); depth += 1) {
    if ([...out.matchAll(VARIABLE_REFERENCE)].some(([, name = '', fallback]) => valueOf(name, fallback) === undefined)) return null;
    out = out.replace(VARIABLE_REFERENCE, (whole, name: string, fallback: string | undefined) => valueOf(name, fallback) ?? whole);
  }
  return out.includes('var(') ? null : out;
}
