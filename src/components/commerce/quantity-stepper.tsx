'use client';

import { useId } from 'react';
import { cn } from '@/lib/cn';
import { MinusIcon, PlusIcon } from '@/components/ui/icons';

/**
 * Quantity control.
 *
 * A real <input type="number"> with buttons either side, rather than a pair of
 * buttons around a <span>: keyboard users can type a quantity, the value is
 * announced correctly, and the control still works in a form without JS.
 */
export function QuantityStepper({
  value,
  min = 1,
  max = 99,
  onChange,
  disabled = false,
  label = 'Quantity',
  size = 'md',
  className,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const id = useId();
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  const box = size === 'sm' ? 'h-9' : 'h-11';
  const button = size === 'sm' ? 'size-9' : 'size-11';

  return (
    <div
      className={cn(
        'border-line-strong inline-flex items-center border',
        disabled && 'opacity-40',
        box,
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={disabled || value <= min}
        aria-label={`Decrease ${label.toLowerCase()}`}
        aria-controls={id}
        className={cn(
          'text-fg inline-flex items-center justify-center transition-colors',
          'hover:bg-accent-soft disabled:pointer-events-none disabled:opacity-30',
          button,
        )}
      >
        <MinusIcon width={14} height={14} />
      </button>

      <input
        id={id}
        type="number"
        inputMode="numeric"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(clamp(next));
        }}
        className="text-fg focus-visible:outline-focus h-full w-10 border-0 bg-transparent p-0 text-center text-sm tabular-nums focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
      />

      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={disabled || value >= max}
        aria-label={`Increase ${label.toLowerCase()}`}
        aria-controls={id}
        className={cn(
          'text-fg inline-flex items-center justify-center transition-colors',
          'hover:bg-accent-soft disabled:pointer-events-none disabled:opacity-30',
          button,
        )}
      >
        <PlusIcon width={14} height={14} />
      </button>
    </div>
  );
}
