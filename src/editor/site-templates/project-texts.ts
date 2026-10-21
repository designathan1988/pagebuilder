// The texts of the ready-made projects the start screen opens (the site templates here, the example applications in
// src/editor/examples): one file per project and language (`<id>.<language>.json`, written by their generators), loaded
// when a list of them is first drawn and kept out of the editor's first bundle.
//  - The language is the interface's: a person reading the editor in English opens English projects (the audit's
//    TPL-2), any other interface language than Portuguese too.
//  - A load that fails (the network dropped, a deploy replaced the files) is forgotten and tried again while the list
//    is shown, and the list says so meanwhile: its buttons never stay disabled for the rest of the session (TPL-14).
//  - Each opening is a new project: its pages get ids of their own (the app packages' identifier is seeded by the start
//    page's id, so two people's projects never share one), and a date a template counts towards (a countdown's end,
//    written as an ISO 8601 duration such as P30D) becomes that long after now, so it never arrives already over.
import { useEffect, useMemo, useState } from 'react';
import { systemClock } from '../../core/ports/clock.ts';
import { randomIds } from '../../core/ports/ids.ts';
import type { Locale } from '../../generated/ids.ts';

export type ProjectLanguage = 'en' | 'pt-BR';
export const projectLanguageOf = (locale: Locale): ProjectLanguage => (locale === 'pt-BR' ? 'pt-BR' : 'en');

type Texts = Readonly<Record<string, string>>;
type Sources = Readonly<Record<string, () => Promise<string>>>;

// how long a failed load waits before the next attempt
const RETRY_MS = 4000;
const DAY_MS = 86_400_000;
const DAYS_AHEAD = /^P(\d+)D$/u;

interface Node {
  readonly customAttributes?: Readonly<Record<string, string>>;
  readonly children?: readonly Node[];
}

function datedFrom(node: Node, now: number): Node {
  const custom = node.customAttributes;
  const dated = custom === undefined ? undefined : Object.fromEntries(Object.entries(custom).map(([name, value]) => {
    const days = DAYS_AHEAD.exec(value)?.[1];
    return [name, days === undefined ? value : new Date(now + Number(days) * DAY_MS).toISOString()];
  }));
  return { ...node, ...(dated === undefined ? {} : { customAttributes: dated }), ...(node.children === undefined ? {} : { children: node.children.map((child) => datedFrom(child, now)) }) };
}

// a project's text as a new project: fresh page ids, its dates counted from now
export function freshProject(text: string): string {
  const document = JSON.parse(text) as { readonly pages: readonly { readonly id: string; readonly tree: Node }[] };
  const now = systemClock.now();
  return JSON.stringify({ ...document, pages: document.pages.map((page) => ({ ...page, id: randomIds.next(), tree: datedFrom(page.tree, now) })) });
}

// The loader of one family of projects (the files `./<id>.<language>.json` among the sources), remembering each
// language's load once it succeeds.
export function projectTexts(sources: Sources, ids: readonly string[]): (language: ProjectLanguage) => { readonly texts: Texts | null; readonly failed: boolean } {
  const loaded = new Map<ProjectLanguage, Promise<Texts>>();
  const load = (language: ProjectLanguage): Promise<Texts> => {
    const held = loaded.get(language);
    if (held !== undefined) return held;
    const loading = Promise.all(ids.map(async (id) => {
      const source = sources[`./${id}.${language}.json`];
      if (source === undefined) throw new Error(`the ready-made project ${id} has no ${language} file`);
      return [id, await source()] as const;
    })).then((all) => Object.fromEntries(all));
    loaded.set(language, loading);
    // a failed load is forgotten, so the next attempt fetches again; the caller hears the failure itself
    loading.catch(() => loaded.delete(language));
    return loading;
  };
  return function useProjectTexts(language) {
    const [held, setHeld] = useState<{ readonly language: ProjectLanguage; readonly texts: Texts } | null>(null);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
      let live = true;
      let retry: ReturnType<typeof setTimeout> | undefined;
      load(language).then(
        (texts) => {
          if (!live) return;
          setHeld({ language, texts });
          setFailed(false);
        },
        () => {
          if (!live) return;
          setFailed(true);
          retry = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
        },
      );
      return () => {
        live = false;
        if (retry !== undefined) clearTimeout(retry);
      };
    }, [language, attempt]);
    const texts = held?.language === language ? held.texts : null;
    const fresh = useMemo(() => (texts === null ? null : Object.fromEntries(Object.entries(texts).map(([id, text]) => [id, freshProject(text)]))), [texts]);
    return { texts: fresh, failed: failed && fresh === null };
  };
}
