import data from '../data/news.json';
import type { Locale } from './site';

export interface NewsContent { title: string; summary: string; bodyHtml: string; cover: string }
export interface NewsEntry { id: string; publishedAt: string; sourceUrl: string; locales: Partial<Record<Locale, NewsContent>> }
export const news = (data as NewsEntry[]).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
export const pageSize = 5;
export const totalPages = Math.max(1, Math.ceil(news.length / pageSize));
export function newsContent(entry: NewsEntry, locale: Locale) {
  const actualLocale: Locale = entry.locales[locale] ? locale : locale === 'zh' ? 'en' : 'zh';
  return { content: entry.locales[actualLocale]!, actualLocale, isFallback: actualLocale !== locale };
}
