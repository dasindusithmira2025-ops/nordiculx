'use client';

import { useId, useState } from 'react';
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
  const [draft, setDraft] = useState({ forValue: value, raw: String(value) });
  const inputValue = draft.forValue === value ? draft.raw : String(value);
  const clamp = (quantity: number) => Math.min(max, Math.max(min, quantity));

  const commit = (raw: string) => {
    const next = Number(raw);
    if (!Number.isInteger(next)) return;
    const quantity = clamp(next);
    setDraft({ forValue: quantity, raw: String(quantity) });
    onChange(quantity);
  };

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
        onClick={() => {
          const quantity = clamp(value - 1);
          setDraft({ forValue: quantity, raw: String(quantity) });
          onChange(quantity);
        }}
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
        value={inputValue}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(event) => {
          const raw = event.target.value;
          setDraft({ forValue: value, raw });
          if (raw !== '') commit(raw);
        }}
        onBlur={() => {
          if (inputValue === '') {
            setDraft({ forValue: min, raw: String(min) });
            onChange(min);
            return;
          }
          if (!Number.isInteger(Number(inputValue))) {
            setDraft({ forValue: value, raw: String(value) });
            return;
          }
          commit(inputValue);
        }}
        className="text-fg focus-visible:outline-focus h-full w-10 border-0 bg-transparent p-0 text-center text-sm tabular-nums focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
      />

      <button
        type="button"
        onClick={() => {
          const quantity = clamp(value + 1);
          setDraft({ forValue: quantity, raw: String(quantity) });
          onChange(quantity);
        }}
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
