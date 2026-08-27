'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { CloseIcon } from './icons';
import { IconButton } from './button';

/**
 * Modal and drawer primitives.
 *
 * Both are a native <dialog> opened with `showModal()`. The platform gives us
 * the focus trap, Escape-to-close, background inertness, top-layer stacking
 * and the ::backdrop — none of which we have to write or keep correct. We add
 * only what the platform omits: click-outside-to-dismiss, body scroll lock,
 * and enter/exit transitions (declared in globals.css with @starting-style).
 */

function useNativeDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // Body scroll lock. Safari still scrolls the page behind an open modal.
  useEffect(() => {
    if (!open) return;
    document.documentElement.classList.add('scroll-locked');
    return () => document.documentElement.classList.remove('scroll-locked');
  }, [open]);

  // `close` fires for Escape and for programmatic close alike, so this is the
  // single place state gets synced back to the caller.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handle = () => onClose();
    el.addEventListener('close', handle);
    return () => el.removeEventListener('close', handle);
  }, [onClose]);

  return ref;
}

/** Dismiss when the press starts and ends on the backdrop itself. */
function useBackdropDismiss(onClose: () => void) {
  const downOnBackdrop = useRef(false);
  return {
    onMouseDown: (e: React.MouseEvent<HTMLDialogElement>) => {
      downOnBackdrop.current = e.target === e.currentTarget;
    },
    onClick: (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === e.currentTarget && downOnBackdrop.current) onClose();
      downOnBackdrop.current = false;
    },
  };
}

type OverlayProps = {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog. Required. */
  title: string;
  /** Hide the visible title but keep it for assistive technology. */
  hideTitle?: boolean;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function Modal({
  open,
  onClose,
  title,
  hideTitle = false,
  description,
  children,
  footer,
  className,
}: OverlayProps) {
  const ref = useNativeDialog(open, onClose);
  const backdrop = useBackdropDismiss(onClose);
  const titleId = useId();

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={cn(
        'nl-dialog nl-dialog--center',
        'bg-surface-raised text-fg shadow-overlay w-[min(34rem,calc(100vw-2rem))]',
        'border-line border p-0',
        className,
      )}
      {...backdrop}
    >
      <div className="border-line flex items-start justify-between gap-6 border-b px-6 py-5">
        <div className="min-w-0">
          <h2
            id={titleId}
            className={cn(
              'font-display text-display-sm',
              hideTitle && 'sr-only',
            )}
          >
            {title}
          </h2>
          {description ? (
            <p className="text-fg-muted mt-1 text-sm">{description}</p>
          ) : null}
        </div>
        <IconButton
          label="Close"
          onClick={onClose}
          className="-mt-1 -mr-2 shrink-0"
        >
          <CloseIcon />
        </IconButton>
      </div>
      <div className="max-h-[70dvh] overflow-y-auto px-6 py-6">{children}</div>
      {footer ? (
        <div className="border-line border-t px-6 py-4">{footer}</div>
      ) : null}
    </dialog>
  );
}

/**
 * Side drawer — the mini cart, mobile navigation and mobile filters all use it.
 * On small screens the `bottom` side gives a sheet, which is a far better
 * reach target than a full-height side panel.
 */
export function Drawer({
  open,
  onClose,
  title,
  hideTitle = false,
  description,
  children,
  footer,
  side = 'right',
  className,
}: OverlayProps & { side?: 'right' | 'left' | 'bottom' }) {
  const ref = useNativeDialog(open, onClose);
  const backdrop = useBackdropDismiss(onClose);
  const titleId = useId();

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={cn(
        'nl-dialog',
        side === 'right' && 'nl-dialog--right h-dvh w-[min(30rem,100vw)]',
        side === 'left' && 'nl-dialog--left h-dvh w-[min(26rem,88vw)]',
        side === 'bottom' && 'nl-dialog--bottom max-h-[88dvh] w-full',
        // `open:flex`, never a bare `flex`: an author `display` declaration
        // beats the UA's `dialog:not([open]) { display: none }`, which would
        // leave this drawer laid out at full size while closed — invisible,
        // but still swallowing every click underneath it.
        'bg-surface text-fg shadow-drawer flex-col open:flex',
        'border-line p-0',
        className,
      )}
      {...backdrop}
    >
      <header className="border-line flex shrink-0 items-center justify-between gap-4 border-b px-5 py-4">
        <h2
          id={titleId}
          className={cn('eyebrow text-fg-muted', hideTitle && 'sr-only')}
        >
          {title}
        </h2>
        <IconButton label="Close" onClick={onClose} className="-mr-2">
          <CloseIcon />
        </IconButton>
      </header>
      {description ? (
        <p className="text-fg-muted shrink-0 px-5 pt-4 text-sm">
          {description}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {children}
      </div>
      {footer ? (
        <footer className="border-line bg-surface-raised shrink-0 border-t px-5 py-5">
          {footer}
        </footer>
      ) : null}
    </dialog>
  );
}
