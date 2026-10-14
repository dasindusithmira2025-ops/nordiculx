/**
 * Validates the online financial-integrity checks after migration 0005 added
 * them as NOT VALID. Validation is deliberately a separate command: Drizzle
 * runs pending migrations in one transaction, and combining ADD + VALIDATE
 * would hold an ACCESS EXCLUSIVE lock while it scans the tables.
 *
 * Before running, reconcile historic provider refunds with payment accumulators
 * and correct discrepancies through approved accounting procedures.
 *
 *   npm run db:validate-financial-constraints -- --confirm-provider-reconciliation
 */
import './load-env';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

if (!process.argv.includes('--confirm-provider-reconciliation')) {
  console.error(
    'Refusing to validate: reconcile historic provider refunds first, then rerun with --confirm-provider-reconciliation.',
  );
  process.exit(1);
}

const client = postgres(url, { max: 1 });

try {
  const [invalidVariants, invalidPayments] = await Promise.all([
    client`
      SELECT id, price, sale_price
        FROM product_variants
       WHERE price <= 0
          OR (sale_price IS NOT NULL AND sale_price >= price)
       LIMIT 20
    `,
    client`
      SELECT id, amount, refunded_amount
        FROM payments
       WHERE amount <= 0
          OR refunded_amount < 0
          OR refunded_amount > amount
       LIMIT 20
    `,
  ]);

  if (invalidVariants.length > 0 || invalidPayments.length > 0) {
    console.error(
      'Refusing to validate constraints because existing rows violate them.',
    );
    if (invalidVariants.length > 0) {
      console.error(
        `Invalid product variants: ${invalidVariants.map((row) => row.id).join(', ')}`,
      );
    }
    if (invalidPayments.length > 0) {
      console.error(
        `Invalid payments: ${invalidPayments.map((row) => row.id).join(', ')}`,
      );
    }
    process.exitCode = 1;
  } else {
    await client.begin(async (tx) => {
      await tx`SET LOCAL lock_timeout = '5s'`;
      await tx`ALTER TABLE product_variants VALIDATE CONSTRAINT product_variants_price_positive`;
      await tx`ALTER TABLE product_variants VALIDATE CONSTRAINT product_variants_sale_price_lt_price`;
      await tx`ALTER TABLE payments VALIDATE CONSTRAINT payments_amount_positive`;
      await tx`ALTER TABLE payments VALIDATE CONSTRAINT payments_refunded_amount_valid`;
    });
    console.warn('Financial-integrity constraints validated.');
  }
} catch (error) {
  console.error('Financial-constraint validation failed:', error);
  process.exitCode = 1;
} finally {
  await client.end();
}
