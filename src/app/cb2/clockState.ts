/**
 * Switchable clock state (CB-2.2): format choice persisted through the
 * single settings boundary (storage/settings.ts). Bars+beats renders only
 * when a tempo is known — CB-D10: the menu HIDES the option instead of
 * disabling it, because there is nothing the user could enable from there.
 */
import { signal } from '@preact/signals';
import { readSetting, writeSetting } from '../../storage/settings';
import type { Catalog } from '../../i18n/en';

export type ClockFormat = 'time' | 'samples' | 'bars';

const FORMAT_KEY = 'cb2.clockFormat';

function isClockFormat(v: unknown): v is ClockFormat {
  return v === 'time' || v === 'samples' || v === 'bars';
}

export const clockFormat = signal<ClockFormat>(
  (() => {
    const stored: unknown = readSetting<unknown>(FORMAT_KEY, 'time');
    return isClockFormat(stored) ? stored : 'time';
  })(),
);

export function setClockFormat(format: ClockFormat): void {
  clockFormat.value = format;
  writeSetting(FORMAT_KEY, format);
}

/** Menu models for the three formats (labels via catalog; bars is dynamic). */
export function clockMenuItems(hasTempo: boolean): Array<{
  id: ClockFormat;
  labelKey: keyof Catalog;
  show: boolean;
}> {
  return [
    { id: 'time', labelKey: 'clockTime', show: true },
    { id: 'samples', labelKey: 'clockSamples', show: true },
    { id: 'bars', labelKey: 'clockBars', show: hasTempo },
  ];
}
