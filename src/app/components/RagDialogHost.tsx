/**
 * RagDialogHost (P1.5/P1.9): renders nothing until a RAG surface opens,
 * then dynamic-imports the RAG chunk. Deliberately avoids preact's
 * lazy/Suspense — those would pull their implementation into the entry
 * chunk for a single use (bundle gate). A plain armed import() does the
 * same job at ~zero entry cost.
 */
import { useEffect, useState } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { manageModelsOpen, modelConsentOpen, ragPanelOpen } from '../state';

export function RagDialogHost() {
  const open = modelConsentOpen.value || manageModelsOpen.value || ragPanelOpen.value;
  const [Comp, setComp] = useState<ComponentType | null>(null);
  useEffect(() => {
    if (open) {
      void import('./RagDialogs').then((m) => setComp(() => m.RagDialogs));
    }
  }, [open]);
  if (!Comp) return null;
  return <Comp />;
}
