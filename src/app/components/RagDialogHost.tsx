/**
 * RagDialogHost (P1.5): renders nothing until a RAG dialog opens, then
 * lazy-imports the RAG dialog chunk. The host itself is tiny — the entry
 * chunk pays only for this file.
 */
import { useEffect, useState } from 'preact/hooks';
import { lazy } from 'preact/compat';
import { Suspense } from 'preact/compat';
import { modelConsentOpen, manageModelsOpen, ragPanelOpen } from '../state';

const RagDialogs = lazy(() => import('./RagDialogs').then((m) => ({ default: m.RagDialogs })));

export function RagDialogHost() {
  const open = modelConsentOpen.value || manageModelsOpen.value || ragPanelOpen.value;
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (open) setArmed(true);
  }, [open]);
  if (!armed) return null;
  return (
    <Suspense fallback={null}>
      <RagDialogs />
    </Suspense>
  );
}
