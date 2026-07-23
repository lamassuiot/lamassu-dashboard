'use client';

import { useState, type ReactNode } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export interface LateralSection {
  value: string;
  label: string;
  content: ReactNode;
}

interface LateralSectionTabsProps {
  sections: LateralSection[];
  /** Controlled active section. Omit to let the component manage its own state. */
  value?: string;
  onValueChange?: (value: string) => void;
  defaultValue?: string;
  className?: string;
}

// The one shared "clickable sections, always on the left" pattern used by
// every settings tab that has more than one logical subsection (CMP's
// General/CKG/Enrollment/KUR/RR/GENM/CCR tabs, and anywhere else this shape
// fits): a sticky vertical nav on the left, content on the right.
//
// Styling deliberately mirrors the page-level horizontal tab bar (see
// pageTabsTriggerClass in ui/tabs.tsx): transparent items, muted → foreground
// text, and a single primary accent line marking the active item — the top
// tabs put that line on their bottom edge, so the vertical mirror puts it on
// the right edge, sitting on the border-r divider between nav and content.
// The `line` TabsList variant already renders exactly this indicator via its
// `after:` element (recolored to primary below); we just avoid overriding it
// with a filled-pill background. Every consumer gets the same look/behavior.
export function LateralSectionTabs({ sections, value, onValueChange, defaultValue, className }: LateralSectionTabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? sections[0]?.value);
  const activeValue = value ?? internalValue;
  const handleChange = (v: string) => {
    setInternalValue(v);
    onValueChange?.(v);
  };

  return (
    <Tabs value={activeValue} onValueChange={handleChange} orientation="vertical" className={className ?? 'w-full items-start gap-8 py-8'}>
      <TabsList
        variant="line"
        className="sticky top-4 w-52 shrink-0 self-start !h-fit !items-stretch !justify-start gap-0 border-r"
      >
        {sections.map((s) => (
          <TabsTrigger
            key={s.value}
            value={s.value}
            // Vertical mirror of pageTabsTriggerClass (ui/tabs.tsx): transparent,
            // muted→foreground text, and a primary accent line on the active item.
            // The top tabs put that line on their bottom edge via
            // data-[state=active]:[box-shadow:inset_0_-2px_0_…]; here it goes on the
            // right edge (inset_-2px_0_0) so it lands on the border-r divider. Using
            // the same data-[state=active] box-shadow the page tabs use — the
            // built-in `line` variant's after:-element indicator keys off a
            // `data-active` attribute that isn't set here, so it never rendered.
            className="w-full !justify-start !rounded-none !bg-transparent !shadow-none px-4 py-2.5 text-left text-sm font-medium text-muted-foreground transition-all hover:text-foreground data-[state=active]:[box-shadow:inset_-2px_0_0_var(--color-primary)]! data-[state=active]:!bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground"
          >
            {s.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <div className="min-w-0 flex-1">
        {sections.map((s) => (
          <TabsContent key={s.value} value={s.value} className="mt-0 space-y-6">
            {s.content}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}
