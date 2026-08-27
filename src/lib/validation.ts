import { z } from 'zod';

/**
 * Shared input schemas.
 *
 * Every server action and route handler parses its input with one of these
 * BEFORE touching the database. Validation lives here rather than in
 * components so a client-side check can never be the only check — the browser
 * form is a convenience, the schema is the boundary.
 */

/** Normalised to lowercase and trimmed, matching how emails are stored. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Enter an email address')
  .max(254, 'That email address is too long')
  .pipe(z.email('Enter a valid email address'));

/**
 * Password policy: length over composition rules. A 12-character passphrase
 * beats "P@ss1" and users actually remember it.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(200, 'That password is too long');

export const nameSchema = z
  .string()
  .trim()
  .min(1, 'This field is required')
  .max(100, 'That is too long');

/** Sri Lankan mobile or landline, local or +94 form. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(
    /^(?:\+94|0)(?:7\d{8}|\d{9})$/,
    'Enter a valid Sri Lankan phone number, e.g. 0771234567',
  );

export const uuidSchema = z.uuid('Invalid identifier');

export const quantitySchema = z.coerce
  .number()
  .int('Quantity must be a whole number')
  .min(1, 'Quantity must be at least 1')
  .max(99, 'Maximum 99 per item');

export const addressSchema = z.object({
  recipientName: nameSchema,
  phone: phoneSchema,
  line1: z.string().trim().min(1, 'Enter an address').max(200),
  line2: z.string().trim().max(200).optional().or(z.literal('')),
  city: z.string().trim().min(1, 'Enter a city').max(100),
  district: z.string().trim().max(100).optional().or(z.literal('')),
  postalCode: z.string().trim().max(20).optional().or(z.literal('')),
  country: z.string().trim().length(2).default('LK'),
});

export type AddressInput = z.infer<typeof addressSchema>;

export const newsletterSchema = z.object({
  email: emailSchema,
  source: z.string().max(50).default('footer'),
  // Explicit consent, required — a pre-ticked box is not consent.
  consent: z
    .union([z.literal('on'), z.literal('true'), z.boolean()])
    .transform(() => true),
});

export const registerSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  marketingOptIn: z.union([z.literal('on'), z.boolean()]).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
});

export const contactSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  // Optional, because insisting on a phone number to ask a question loses the
  // question. An empty string is normalised away rather than rejected.
  phone: z
    .union([phoneSchema, z.literal('')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  subject: z.string().trim().min(1, 'Choose a subject').max(120),
  orderReference: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  message: z
    .string()
    .trim()
    .min(10, 'Please give us a little more detail')
    .max(4000, 'That message is too long'),
});

export const reviewSchema = z.object({
  productId: uuidSchema,
  rating: z.coerce.number().int().min(1, 'Choose a rating').max(5),
  title: z.string().trim().max(120).optional().or(z.literal('')),
  body: z
    .string()
    .trim()
    .min(20, 'Please write at least a sentence or two')
    .max(4000, 'That review is too long'),
});

/**
 * A standard result shape for server actions.
 *
 * Actions never throw for expected failures — a thrown error in a server action
 * surfaces as an opaque runtime error to the client. `fieldErrors` maps
 * directly onto the `error` prop of the Field primitive.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function actionError(
  error: string,
  fieldErrors?: Record<string, string>,
): ActionResult<never> {
  return { ok: false, error, ...(fieldErrors ? { fieldErrors } : {}) };
}

export function actionOk(): ActionResult<undefined>;
export function actionOk<T>(data: T): ActionResult<T>;
export function actionOk<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

/** Flattens a ZodError into the `fieldErrors` shape used by forms. */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    out[key] ??= issue.message;
  }
  return out;
}
