/** Shared transport-zone primitives (extracted for Control Bar v2 reuse). */

/** Redesign: one labeled zone panel of the transport bar (Audition-style). */
export function Zone({
  label,
  children,
}: {
  label: string;
  children: preact.ComponentChildren;
}) {
  return (
    <section class="tz" data-zone-label={label} role="group" aria-label={label}>
      <span class="tz-cap" aria-hidden="true">
        {label}
      </span>
      <div class="tz-body">{children}</div>
    </section>
  );
}

export function Svg({ d }: { d: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
