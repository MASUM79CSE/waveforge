/**
 * বাংলা ক্যাটালগ — v1: Smart RAG keys (P1.5)। অনুপস্থিত কী(key) ইংরেজিতে
 * fallback করবে (index.ts এ `...en` merge)। বাকি অনুবাদ P6.4-এ সম্পূর্ণ হবে।
 */
import type { Catalog } from './en';

/** Widen literal string types so a partial catalog can hold translations. */
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : T[K] };

export const bn: Partial<Widen<Catalog>> = {
  ragConsentTitle: 'এআই মডেল ডাউনলোড',
  ragConsentLine: 'শুধু মডেল ফাইল ডাউনলোড হয়। আপনার অডিও ও লেখা কখনো এই ডিভাইস ছাড়ে না।',
  ragConsentDownload: 'ডাউনলোড',
  ragConsentNotNow: 'এখন নয়',
  ragManageTitle: 'এআই মডেল ব্যবস্থাপনা',
  ragNoModels: 'কোনো এআই মডেল ইনস্টল করা নেই।',
  ragInstalled: 'ইনস্টল করা',
  ragDelete: 'মুছুন',
  ragClose: 'বন্ধ করুন',
  ragSizeLabel: 'আকার',
  ragLicenceLabel: 'লাইসেন্স',
};
