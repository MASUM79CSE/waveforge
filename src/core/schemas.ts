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

export const audioFileSchema = z.instanceof(File).superRefine((file, ctx) => {
  const type = (file.type || '').toLowerCase();
  const mimeOk = type.startsWith('audio/');
  const extOk = AUDIO_EXTENSIONS.test(file.name);
  if (!mimeOk && !extOk) {
    ctx.addIssue({ code: 'custom', message: 'Unsupported file type', path: [] });
  }
});
