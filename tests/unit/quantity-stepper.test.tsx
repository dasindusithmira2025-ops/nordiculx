// @vitest-environment jsdom
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { QuantityStepper } from '@/components/commerce/quantity-stepper';

function QuantityHarness() {
  const [quantity, setQuantity] = useState(1);
  return (
    <QuantityStepper value={quantity} min={1} max={10} onChange={setQuantity} />
  );
}

describe('QuantityStepper', () => {
  it('lets keyboard users replace the default quantity with a multi-digit value', async () => {
    const user = userEvent.setup();
    render(<QuantityHarness />);

    const input = screen.getByRole('spinbutton', { name: 'Quantity' });
    await user.clear(input);
    await user.type(input, '10');
    expect((input as HTMLInputElement).value).toBe('10');
  });

  it('restores the minimum when an empty input loses focus', async () => {
    const user = userEvent.setup();
    render(<QuantityHarness />);

    const input = screen.getByRole('spinbutton', { name: 'Quantity' });
    await user.clear(input);
    await user.tab();
    expect((input as HTMLInputElement).value).toBe('1');
  });
});
