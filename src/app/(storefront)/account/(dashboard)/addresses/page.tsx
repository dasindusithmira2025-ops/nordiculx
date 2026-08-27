import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { getAddressesForUser } from '@/lib/account';
import { AddressManager } from '@/components/account/address-manager';

export const metadata: Metadata = {
  title: 'Your addresses — Nordic Lux',
  robots: { index: false, follow: false },
};

export default async function AddressesPage() {
  const user = await requireUser('/account/addresses');
  const addresses = await getAddressesForUser(user.id);

  return (
    <div>
      <header className="border-line border-b pb-8">
        <p className="eyebrow text-fg-subtle">Account</p>
        <h1 className="font-display text-display-md text-fg mt-4">Addresses</h1>
        <p className="text-fg-muted mt-3 max-w-prose text-sm">
          Your default address is preselected at checkout. Editing an address
          here never changes where a past order was sent — orders keep their own
          copy.
        </p>
      </header>

      <div className="mt-12">
        <AddressManager addresses={addresses} />
      </div>
    </div>
  );
}
