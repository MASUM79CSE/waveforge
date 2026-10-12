/**
 * বাংলা ক্যাটালগ — v1: Smart RAG keys (P1.5)। অনুপস্থিত কী(key) ইংরেজিতে
 * fallback করবে (index.ts এ `...en` merge)। বাকি অনুবাদ P6.4-এ সম্পূর্ণ হবে।
 */
import type { Catalog } from './en';

/** Widen literal string types so a partial catalog can hold translations. */
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : T[K] };

export const bn: Partial<Widen<Catalog>> = {  ragExportSrt: 'ট্রান্সক্রিপ্ট এক্সপোর্ট (SRT)',
  ragExportVtt: 'ট্রান্সক্রিপ্ট এক্সপোর্ট (VTT)',
  ragExportTxt: 'ট্রান্সক্রিপ্ট এক্সপোর্ট (TXT)',
  ragExportNone: 'এখনও কোনো ট্রান্সক্রিপ্ট নেই — আগে ট্রান্সক্রাইব চালান।',
  ragExportDone: 'ট্রান্সক্রিপ্ট এক্সপোর্ট হয়েছে',
};
