import { describe, expect, it } from 'vitest';

import { getCBOMType } from './cbom-type';

describe('getCBOMType', () => {
  it('classifies cbomkit-theia output as filesystem', () => {
    expect(getCBOMType({
      bom: {
        metadata: {
          tools: {
            services: [{ name: 'cbomkit-theia' }],
          },
        },
      },
    })).toBe('filesystem');
  });

  it('classifies wrapped live-capture output as realtime', () => {
    expect(getCBOMType({
      data: {
        bom: {
          metadata: {
            tools: {
              services: [{
                name: 'LiveCapture',
                provider: { name: 'Ikerlan_LKS' },
              }],
            },
          },
        },
      },
    })).toBe('realtime');
  });

  it('classifies other CBOMs as Git repository scans', () => {
    expect(getCBOMType({ bom: { metadata: {} } })).toBe('gitrepo');
  });
});
