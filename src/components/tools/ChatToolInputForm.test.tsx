import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ca-data', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/ca-data')>();
  return {
    ...original,
    fetchAndProcessCAs: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('@/components/shared/CaSelectorModal', () => ({
  CaSelectorModal: ({
    isOpen,
    onCaSelected,
  }: {
    isOpen: boolean;
    onCaSelected: (ca: { id: string; name: string }) => void;
  }) => isOpen ? (
    <button onClick={() => onCaSelected({ id: 'issuer-ca', name: 'Issuer CA' })} type="button">
      Issuer CA
    </button>
  ) : null,
}));

import type { ChatToolInputRequest } from '@/lib/chat-tools';
import { ChatToolInputForm } from './ChatToolInputForm';

const request: ChatToolInputRequest = {
  missingParameters: ['ca_id'],
  fields: [
    {
      name: 'ca_id',
      type: 'string',
      control: 'certificate-authority',
      description: 'Issuer certificate authority ID.',
      required: true,
    },
    {
      name: 'common_name',
      type: 'string',
      description: 'Certificate subject common name.',
      required: true,
    },
    {
      name: 'key_mode',
      type: 'string',
      required: false,
      options: ['generate', 'reuse'],
      defaultValue: 'generate',
    },
    {
      name: 'extended_key_usages',
      type: 'array',
      required: false,
      itemOptions: ['ServerAuth', 'ClientAuth'],
    },
  ],
};

describe('ChatToolInputForm', () => {
  it('prefills known arguments, validates missing values, and submits normalized tool arguments', async () => {
    const onSubmit = vi.fn();

    render(
      <ChatToolInputForm
        initialValues={{ common_name: 'device.example.com' }}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        request={request}
        submitLabel="Review action"
      />,
    );

    expect(screen.getByLabelText(/Common name/)).toHaveValue('device.example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Review action' }));
    expect(screen.getByText('This field is required.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('combobox', { name: /CA ID/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Issuer CA' }));
    fireEvent.click(screen.getByRole('button', { name: 'Optional settings' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'ClientAuth' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review action' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      ca_id: 'issuer-ca',
      common_name: 'device.example.com',
      extended_key_usages: ['ClientAuth'],
    }));
  });

  it('lets the user cancel without submitting the form', () => {
    const onCancel = vi.fn();
    const onSubmit = vi.fn();

    render(
      <ChatToolInputForm
        initialValues={{}}
        onCancel={onCancel}
        onSubmit={onSubmit}
        request={request}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
