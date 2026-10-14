'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/overlay';

/** Focus-managed mobile filter sheet; the desktop rail stays server-rendered. */
export function MobileFilterDrawer({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="lg:hidden"
        onClick={() => setOpen(true)}
      >
        Filter
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Refine products"
        side="bottom"
        className="max-h-[85dvh]"
      >
        <div className="px-5 py-2">{children}</div>
      </Drawer>
    </>
  );
}
