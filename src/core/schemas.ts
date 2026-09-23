/**
 * Zod boundary schemas (ECC TS rule: validate all external input).
 * Extended per milestone: draft records (M6), worker messages (M1+).
 */
import { z } from 'zod';
import { DEFAULT_MAX_FILE_BYTES } from './constants';

const AUDIO_EXTENSIONS = /\.(aac|aif|aiff|flac|m4a|mp3|oga|ogg|opus|wav|wave|webm)$/i;

export const fileMetaSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().positive().max(DEFAULT_MAX_FILE_BYTES),
  type: z.string().optional(),
});

export type FileMeta = z.infer<typeof fileMetaSchema>;

/** Loopback / private-range hosts are never fetched (SSRF-style guard). */
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === '::1' || h === '[::1]' || h === '0.0.0.0') return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }
  return h.includes(':'); // conservative: treat non-matching IPv6 as private
}

export const urlInputSchema = z
  .object({ url: z.string().trim().min(1).max(2048) })
  .superRefine((value, ctx) => {
    let parsed: URL;
    try {
      parsed = new URL(value.url);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Not a valid URL', path: ['url'] });
      return;
    }
    if (parsed.protocol !== 'https:') {
      ctx.addIssue({ code: 'custom', message: 'Only https URLs are allowed', path: ['url'] });
      return;
    }
    if (isPrivateHost(parsed.hostname)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Private and loopback hosts are not allowed',
        path: ['url'],
      });
    }
  });

export const audioFileSchema = z.instanceof(File).superRefine((file, ctx) => {
  const type = (file.type || '').toLowerCase();
  const mimeOk = type.startsWith('audio/');
  const extOk = AUDIO_EXTENSIONS.test(file.name);
  if (!mimeOk && !extOk) {
    ctx.addIssue({ code: 'custom', message: 'Unsupported file type', path: [] });
  }
});
