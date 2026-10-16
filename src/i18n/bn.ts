/**
 * Bengali catalog (UX-5.2, F-6) — core UI strings; untranslated keys fall
 * back to English via the merge in `index.ts` (honest partial-catalog
 * policy: no empty strings, no machine-flavored stubs in the visible UI).
 * Extending this file is additive; the Catalog type guards every new key.
 */
import type { Catalog } from './en';

/** String-valued keys only — function keys (and the error record) keep the base catalog. */
export type StringKeys<T> = { [K in keyof T as T[K] extends string ? K : never]?: string };

export const bnPartial: StringKeys<Catalog> = {
  appName: 'ওয়েভফোর্জ',
  appTagline: 'ফ্রি · প্রাইভেট · সম্পূর্ণ আপনার ব্রাউজারে চলে',

  // menus
  menuFile: 'ফাইল',
  menuEdit: 'সম্পাদনা',
  menuEffects: 'ইফেক্ট',
  menuAnalyze: 'বিশ্লেষণ',
  menuView: 'ভিউ',
  menuHelp: 'সহায়তা',
  menuGroupImport: 'ইমপোর্ট',
  menuGroupRecord: 'রেকর্ড',
  menuGroupExport: 'এক্সপোর্ট',
  menuGroupDrafts: 'ড্রাফট',
  menuGroupZoom: 'জুম',
  menuGroupCursor: 'কার্সর ও অক্ষ',
  menuGroupAppearance: 'চেহারা',

  // transport
  play: 'প্লে',
  pause: 'বিরতি',
  stop: 'স্টপ',
  recordStart: 'রেকর্ড',
  toggleLoop: 'লুপ টগল',
  volume: 'ভলিউম',
  monitorTitle: 'ইনপুট মনিটরিং (M)',
  punchIn: 'নির্বাচনের ওপর পাঞ্চ ইন/আউট (P)',

  // edit
  editUndo: 'আনডু',
  editRedo: 'রিডু',
  editCut: 'কাট',
  editCopy: 'কপি',
  editPaste: 'পেস্ট',
  editDelete: 'নির্বাচন মুছুন',
  editTrim: 'নির্বাচনে ট্রিম',
  trackAdd: 'ট্র্যাক যোগ করুন',
  channelLeft: 'বাম',
  channelRight: 'ডান',
  channelSwap: 'চ্যানেল অদলবদল',

  // frame2 toolbars + reset
  viewToolbars: 'টুলবার',
  viewLayoutReset: 'লেআউট রিসেট',
  tbTransport: 'ট্রান্সপোর্ট টুলবার',
  tbEdit: 'সম্পাদনা টুলবার',
  tbTools: 'টুলস টুলবার',
  tbTimenap: 'সময় ও স্ন্যাপ টুলবার',
  tbMeters: 'মিটার ও মিক্সার টুলবার',

  // frame2 selection fields + summary
  selGroupLabel: 'নির্বাচনের ঘর',
  selStart: 'শুরু:',
  selEnd: 'শেষ:',
  selDuration: 'দৈর্ঘ্য:',
  selFormat: 'সময়ের ফরম্যাট',
  selSamples: 'স্যাম্পল',
  selInvalid: 'অবৈধ সময় — নির্বাচিত ফরম্যাট ব্যবহার করুন (যেমন ১:২৩.৪৫৬)',
  selOrder: 'শেষ হবে শুরুর পরে',
  summarySelection: 'নির্বাচন',
  summaryNoSelection: 'নির্বাচন নেই',
  summaryCursor: 'কার্সর',

  // misc visible chrome
  noAudio: 'কোনো অডিও লোড হয়নি',
  dropHint: 'এখানে অডিও ফাইল টেনে আনুন',
  quickOpen: 'ফাইল খুলুন',
  quickSample: 'নমুনা লোড',
};
