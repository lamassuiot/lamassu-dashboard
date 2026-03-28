import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MerkleTreeExplorer } from './MerkleTreeExplorer';
import {
  fetchCheckpoint,
  fetchEvents,
  fetchInclusionProof,
} from '@/lib/audit-logs-api';
import { useIsMobile } from '@/hooks/use-mobile';

vi.mock('@/lib/audit-logs-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/audit-logs-api')>();
  return {
    ...actual,
    fetchCheckpoint: vi.fn(),
    fetchEvents: vi.fn(),
    fetchInclusionProof: vi.fn(),
  };
});

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(),
}));

vi.mock('@xyflow/react', async () => {
  const ReactModule = await import('react');
  const reactFlowSpy = vi.fn();

  return {
    Background: () => null,
    BackgroundVariant: { Dots: 'dots' },
    Handle: () => null,
    Position: { Bottom: 'bottom', Top: 'top' },
    ReactFlow: (props: any) => {
      reactFlowSpy(props);
      const { children, nodeTypes, nodes } = props;
      return (
        <div data-testid="react-flow">
          {nodes.map((node: any) => {
            const Component = nodeTypes?.[node.type];
            if (!Component) return null;
            return (
              <div key={node.id} data-testid={`node-${node.id}`}>
                <Component
                  id={node.id}
                  data={node.data}
                  dragging={false}
                  isConnectable={false}
                  selected={false}
                  type={node.type}
                  xPos={node.position?.x ?? 0}
                  yPos={node.position?.y ?? 0}
                  zIndex={0}
                />
              </div>
            );
          })}
          {children}
        </div>
      );
    },
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useReactFlow: () => ({ fitView: vi.fn() }),
    __reactFlowSpy: reactFlowSpy,
  };
});

const reactFlowModule = (await import('@xyflow/react')) as unknown as { __reactFlowSpy: ReturnType<typeof vi.fn> };
const reactFlowSpy = reactFlowModule.__reactFlowSpy;

function createLeaves(start: number, count: number) {
  return Array.from({ length: count }, (_, offset) => {
    const index = start + offset;
    return {
      index,
      leaf_hash: `leaf-hash-${index}`,
      event: {
        specversion: '1.0',
        id: `event-${index}`,
        source: `source://lamassu.io/test/${index}`,
        type: `audit.event.${index}`,
        datacontenttype: 'application/json',
        time: '2026-03-27T10:00:00Z',
        data: {
          has_error: false,
          input: {
            CAID: `ca-${index}`,
          },
        },
        traceid: `trace-${index}`,
        spanid: `span-${index}`,
      },
    };
  });
}

describe('MerkleTreeExplorer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useIsMobile).mockReturnValue(false);
  });

  it('loads the checkpoint and last 100 leaves on mount', async () => {
    vi.mocked(fetchCheckpoint).mockResolvedValue({
      root_hash: 'root-hash-abcdef',
      signed_checkpoint: 'signed',
      tree_size: 120,
    });
    vi.mocked(fetchEvents).mockResolvedValue({
      count: 100,
      events: createLeaves(20, 100),
      from: 20,
      root_hash: 'root-hash-abcdef',
      tree_size: 120,
    });

    render(<MerkleTreeExplorer />);

    await screen.findByText(/leaf 20/i);

    expect(fetchCheckpoint).toHaveBeenCalledTimes(1);
    expect(fetchEvents).toHaveBeenCalledWith(20, 100);
    expect(screen.getByText(/leaf 20/i)).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('120 entries')).toBeInTheDocument();
    expect(vi.mocked(reactFlowSpy).mock.calls.at(-1)?.[0].onNodeClick).toBeTypeOf('function');
    expect(
      vi.mocked(reactFlowSpy).mock.calls.at(-1)?.[0].nodes.some((node: any) => node.type === 'collapsed'),
    ).toBe(true);
  });

  it('expands the collapsed range in 100-leaf batches', async () => {
    vi.mocked(fetchCheckpoint).mockResolvedValue({
      root_hash: 'root-hash-abcdef',
      signed_checkpoint: 'signed',
      tree_size: 260,
    });
    vi.mocked(fetchEvents)
      .mockResolvedValueOnce({
        count: 100,
        events: createLeaves(160, 100),
        from: 160,
        root_hash: 'root-hash-abcdef',
        tree_size: 260,
      })
      .mockResolvedValueOnce({
        count: 100,
        events: createLeaves(0, 100),
        from: 0,
        root_hash: 'root-hash-abcdef',
        tree_size: 260,
      });

    render(<MerkleTreeExplorer />);

    const expandButtons = await screen.findAllByRole('button', { name: 'Expand' });
    fireEvent.click(expandButtons[0]);

    await waitFor(() => {
      expect(fetchEvents).toHaveBeenNthCalledWith(2, 0, 100);
    });

    expect(await screen.findByText(/leaf 0/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Load next 100' }).length).toBeGreaterThan(0);
    expect(screen.getByText(/leaf 0/i)).toBeInTheDocument();
  });

  it('loads a proof and marks a leaf as tampered when verification fails', async () => {
    vi.mocked(fetchCheckpoint).mockResolvedValue({
      root_hash: 'root-hash-abcdef',
      signed_checkpoint: 'signed',
      tree_size: 5,
    });
    vi.mocked(fetchEvents).mockResolvedValue({
      count: 5,
      events: createLeaves(0, 5),
      from: 0,
      root_hash: 'root-hash-abcdef',
      tree_size: 5,
    });
    vi.mocked(fetchInclusionProof).mockResolvedValue({
      leaf_hash: 'leaf-hash-3',
      leaf_index: 3,
      merkle_path: [
        { level: 0, sibling_hash: 'sibling-leaf-2' },
        { level: 1, sibling_hash: 'sibling-subtree-0-2' },
        { level: 2, sibling_hash: 'sibling-leaf-4' },
      ],
      root_hash: 'root-hash-abcdef',
      tree_size: 5,
      verified: false,
    });

    render(<MerkleTreeExplorer />);

    const proofButtons = await screen.findAllByRole('button', { name: 'Proof' });
    fireEvent.click(proofButtons[3]);

    await waitFor(() => {
      expect(fetchInclusionProof).toHaveBeenCalledWith(3);
    });

    expect(await screen.findByText('Tamper')).toBeInTheDocument();
    expect(
      vi.mocked(reactFlowSpy).mock.calls.at(-1)?.[0].nodes.some((node: any) => node.data?.proofHash === 'sibling-subtree-0-2'),
    ).toBe(true);
  });

  it('shows a retry banner when the log service returns HTTP 500', async () => {
    vi.mocked(fetchCheckpoint)
      .mockRejectedValueOnce(new Error('Fetch checkpoint: HTTP 500'))
      .mockResolvedValueOnce({
        root_hash: 'root-hash-abcdef',
        signed_checkpoint: 'signed',
        tree_size: 0,
      });

    render(<MerkleTreeExplorer />);

    expect(await screen.findByText('Log unavailable')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(fetchCheckpoint).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText('No events yet')).toBeInTheDocument();
  });

  it('defaults to the mobile list with a show tree toggle', async () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    vi.mocked(fetchCheckpoint).mockResolvedValue({
      root_hash: 'root-hash-abcdef',
      signed_checkpoint: 'signed',
      tree_size: 3,
    });
    vi.mocked(fetchEvents).mockResolvedValue({
      count: 3,
      events: createLeaves(0, 3),
      from: 0,
      root_hash: 'root-hash-abcdef',
      tree_size: 3,
    });

    render(<MerkleTreeExplorer />);

    expect(await screen.findByRole('button', { name: 'Show tree' })).toBeInTheDocument();
    expect(screen.queryByTestId('react-flow')).not.toBeInTheDocument();
    expect(screen.getByText(/leaf 0/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show tree' }));

    expect(await screen.findByTestId('react-flow')).toBeInTheDocument();
  });
});
