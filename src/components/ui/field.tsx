'use client';

import { createContext, useContext, useId } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { AlertIcon } from './icons';

/**
 * Form field primitives.
 *
 * `Field` owns the id wiring so every control automatically gets a real
 * <label for>, an `aria-describedby` pointing at its hint and error, and
 * `aria-invalid` when it fails. Wiring accessibility at the primitive means
 * no individual form can forget it.
 *
 * Visual language: no boxes. Inputs are a baseline rule that darkens on focus,
 * which reads as a printed form rather than a web app.
 */

type FieldContext = {
  id: string;
  hintId: string;
  errorId: string;
  hasError: boolean;
  hasHint: boolean;
};

const Ctx = createContext<FieldContext | null>(null);

function useField() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error('Field primitives must be used inside <Field>');
  }
  return ctx;
}

/**
 * Attributes a control inside a Field spreads onto itself.
 *
 * Tolerant of being used outside a Field — a standalone control (the header
 * search box, for example) is labelled by its own `aria-label` and needs no
 * wiring. Inside a Field, the wiring is mandatory and automatic.
 */
export function useFieldControlProps() {
  const ctx = useContext(Ctx);
  if (!ctx) return {} as const;
  const { id, hintId, errorId, hasError, hasHint } = ctx;
  const describedBy = [hasHint ? hintId : null, hasError ? errorId : null]
    .filter(Boolean)
    .join(' ');
  return {
    id,
    'aria-invalid': hasError || undefined,
    'aria-describedby': describedBy || undefined,
  } as const;
}

export function Field({
  error,
  hint,
  className,
  children,
}: {
  error?: string | null;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <Ctx.Provider
      value={{
        id,
        hintId: `${id}-hint`,
        errorId: `${id}-error`,
        hasError: Boolean(error),
        hasHint: Boolean(hint),
      }}
    >
      <div className={cn('flex flex-col gap-2', className)}>
        {children}
        {hint ? <FieldHint>{hint}</FieldHint> : null}
        {error ? <FieldError>{error}</FieldError> : null}
      </div>
    </Ctx.Provider>
  );
}

export function FieldLabel({
  children,
  optional = false,
  className,
}: {
  children: ReactNode;
  optional?: boolean;
  className?: string;
}) {
  const { id } = useField();
  return (
    <label htmlFor={id} className={cn('eyebrow text-fg-muted', className)}>
      {children}
      {optional ? (
        <span className="text-fg-subtle ml-2 tracking-normal normal-case">
          (optional)
        </span>
      ) : null}
    </label>
  );
}

function FieldHint({ children }: { children: ReactNode }) {
  const { hintId } = useField();
  return (
    <p id={hintId} className="text-fg-subtle text-xs">
      {children}
    </p>
  );
}

function FieldError({ children }: { children: ReactNode }) {
  const { errorId } = useField();
  return (
    // `role="alert"` announces the message the moment it appears, which is
    // what a keyboard/screen-reader user needs after a failed submit.
    <p
      id={errorId}
      role="alert"
      className="text-signal-danger flex items-start gap-1.5 text-xs"
    >
      <AlertIcon width={14} height={14} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

const controlBase = [
  'w-full rounded-none bg-transparent px-0 py-2.5 text-base text-fg',
  'border-0 border-b border-line-strong',
  'placeholder:text-fg-subtle',
  'transition-[border-color] duration-standard ease-standard',
  'hover:border-fg-muted',
  'focus:border-fg focus:outline-none',
  'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus',
  'aria-invalid:border-signal-danger',
  'disabled:opacity-40 disabled:pointer-events-none',
].join(' ');

export function Input({ className, ...props }: ComponentProps<'input'>) {
  const field = useFieldControlProps();
  return <input {...field} className={cn(controlBase, className)} {...props} />;
}

export function Textarea({
  className,
  rows = 4,
  ...props
}: ComponentProps<'textarea'>) {
  const field = useFieldControlProps();
  return (
    <textarea
      {...field}
      rows={rows}
      className={cn(controlBase, 'resize-y', className)}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: ComponentProps<'select'>) {
  const field = useFieldControlProps();
  return (
    <div className="relative">
      <select
        {...field}
        className={cn(controlBase, 'appearance-none pr-8', className)}
        {...props}
      >
        {children}
      </select>
      {/* Decorative chevron; the native select still owns all behaviour. */}
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="text-fg-subtle pointer-events-none absolute top-1/2 right-1 size-4 -translate-y-1/2"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
      >
        <path d="m6 9.5 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/**
 * Checkbox and radio use a real input with a drawn control on top, so keyboard,
 * form submission and screen-reader semantics stay native.
 */
export function Checkbox({
  label,
  className,
  ...props
}: ComponentProps<'input'> & { label: ReactNode }) {
  const id = useId();
  return (
    <label
      htmlFor={props.id ?? id}
      className={cn(
        'group text-fg flex cursor-pointer items-start gap-3 py-1 text-sm',
        props.disabled && 'cursor-not-allowed opacity-40',
        className,
      )}
    >
      <span className="border-line-strong group-hover:border-fg relative mt-0.5 flex size-4 shrink-0 items-center justify-center border transition-colors">
        <input
          type="checkbox"
          id={props.id ?? id}
          className="peer absolute inset-0 z-20 size-full cursor-pointer opacity-0"
          {...props}
        />
        {/* Fill and tick are siblings *after* the input so `peer-checked`
            reaches them. Explicit z-index keeps the tick above the fill
            without relying on a negative index escaping the stacking context. */}
        <span className="bg-fg duration-micro pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity peer-checked:opacity-100" />
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="text-accent-fg duration-micro pointer-events-none relative z-10 size-3 scale-50 opacity-0 transition-[opacity,transform] peer-checked:scale-100 peer-checked:opacity-100"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m4.5 12.5 5 5 10-11" />
        </svg>
      </span>
      <span className="leading-snug">{label}</span>
    </label>
  );
}

export function Radio({
  label,
  className,
  ...props
}: ComponentProps<'input'> & { label: ReactNode }) {
  const id = useId();
  return (
    <label
      htmlFor={props.id ?? id}
      className={cn(
        'group text-fg flex cursor-pointer items-start gap-3 py-1 text-sm',
        props.disabled && 'cursor-not-allowed opacity-40',
        className,
      )}
    >
      <span className="border-line-strong group-hover:border-fg relative mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors">
        <input
          type="radio"
          id={props.id ?? id}
          className="peer absolute inset-0 size-full cursor-pointer rounded-full opacity-0"
          {...props}
        />
        <span className="bg-fg duration-micro size-2 scale-0 rounded-full transition-transform peer-checked:scale-100" />
      </span>
      <span className="leading-snug">{label}</span>
    </label>
  );
}
