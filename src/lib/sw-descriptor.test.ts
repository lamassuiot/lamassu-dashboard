import { describe, expect, it } from 'vitest';

import { checkDescriptorFiles, extractDescriptorFiles } from './sw-descriptor';

// The rule this enforces: an SWU build only includes what its sw-description names, so a descriptor
// declaring a file nobody uploaded produces an image that fails ON THE DEVICE — swupdate looks for
// the file, does not find it, and the install fails long after the build reported success.
//
// Both descriptor dialects are covered because both are in use, and the basename/case handling is
// covered because that is what made a correct set-up report as broken.

describe('extractDescriptorFiles', () => {
  it('reads swupdate libconfig descriptors', () => {
    const content = `
      software = {
        version = "1.0.0";
        ecs = {
          hardware-compatibility: [ "1.0" ];
          files: (
            { filename = "rootfs.ext4"; type = "raw"; device = "/dev/mmcblk0p2"; },
            { filename = "app.tar.gz"; type = "archive"; path = "/opt"; }
          );
        };
      }`;
    expect(extractDescriptorFiles(content)).toEqual(['rootfs.ext4', 'app.tar.gz']);
  });

  it('reads the JSON layouts a generator may emit', () => {
    expect(extractDescriptorFiles('{"files":["a.bin","b.bin"]}')).toEqual(['a.bin', 'b.bin']);
    expect(extractDescriptorFiles('{"files":[{"filename":"a.bin"}]}')).toEqual(['a.bin']);
    expect(extractDescriptorFiles('{"software":{"ecs":{"files":[{"filename":"c.bin"}]}}}')).toEqual(['c.bin']);
  });

  it('falls back to a text scan for a JSON layout it does not recognise', () => {
    // REGRESSION: returning [] for valid-but-unknown JSON made the consistency check pass
    // vacuously — the worst outcome, since it looks like a verified descriptor.
    expect(extractDescriptorFiles('{"images":[{"filename":"deep.bin","type":"raw"}]}')).toEqual(['deep.bin']);
  });

  it('declares nothing for an empty or fileless descriptor', () => {
    expect(extractDescriptorFiles('')).toEqual([]);
    expect(extractDescriptorFiles('   ')).toEqual([]);
    expect(extractDescriptorFiles('software = { version = "1.0.0"; }')).toEqual([]);
  });
});

describe('checkDescriptorFiles', () => {
  const content = 'files: ( { filename = "rootfs.ext4"; }, { filename = "app.tar.gz"; } );';

  it('counts a file as available whether it is already stored OR being uploaded now', () => {
    // "present or uploaded" is one condition, not two: an operator adding the second half of a
    // descriptor's files must not be told the first half is missing.
    const check = checkDescriptorFiles({ content, stored: ['rootfs.ext4'], staged: ['app.tar.gz'] });
    expect(check.missing).toEqual([]);
    expect(check.declared.map((d) => d.status)).toEqual(['stored', 'staged']);
  });

  it('reports a declared file that is nowhere', () => {
    const check = checkDescriptorFiles({ content, staged: ['rootfs.ext4'] });
    expect(check.missing).toEqual(['app.tar.gz']);
    expect(check.declared.find((d) => d.name === 'app.tar.gz')?.status).toBe('missing');
  });

  it('reports a file uploaded but not declared, which the build silently drops', () => {
    const check = checkDescriptorFiles({ content, staged: ['rootfs.ext4', 'app.tar.gz', 'extra.bin'] });
    expect(check.missing).toEqual([]);
    expect(check.undeclared).toEqual(['extra.bin']);
  });

  it('matches on the basename and ignores case', () => {
    // A descriptor writes a bare filename for an artifact stored with a path, and the two spellings
    // of the same file were being reported as one missing and one undeclared.
    const check = checkDescriptorFiles({
      content: 'files: ( { filename = "rootfs.ext4"; } );',
      stored: ['images/RootFS.ext4'],
    });
    expect(check.missing).toEqual([]);
    expect(check.undeclared).toEqual([]);
  });

  it('finds nothing to complain about when there is no descriptor', () => {
    // A module without one falls back to the distribution set's, so "no descriptor" is valid and
    // must not report every uploaded file as undeclared.
    const check = checkDescriptorFiles({ content: '', staged: ['whatever.bin'] });
    expect(check.declared).toEqual([]);
    expect(check.missing).toEqual([]);
    expect(check.undeclared).toEqual([]);
  });
});
