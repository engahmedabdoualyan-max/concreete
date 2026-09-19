import { useLang } from '../context/LangContext';
import type { Lang } from '../context/translations';

export type PageDictValue = { [K in Lang]: string };
export type PageDict = Record<string, PageDictValue>;

export function usePageDict<D extends PageDict>(dict: D) {
  const { lang } = useLang();
  return (key: keyof D): string => {
    const v = dict[key as string];
    if (!v) return String(key);
    return v[lang] || v.en || String(key);
  };
}

export function dictOf(values: PageDict): PageDict {
  return values;
}