import { describe, expect, it } from 'vitest';
import { importBackground } from './import';
import { isDriveConnected, listDriveProjects } from './drive';
import { safeFilename } from './files';

describe('Integrációs hibahatárok', () => {
  it('does not attempt a Drive request without an explicit connection', async () => {
    expect(isDriveConnected()).toBe(false);
    await expect(listDriveProjects()).rejects.toThrow('csatlakozz újra');
  });
  it('makes portable filenames without path components', () => {
    expect(safeFilename('../Terv: fürdő\\A?.')).not.toMatch(/[\\/:?]/);
    expect(safeFilename(' . ')).toBe('villamos-terv');
    expect(safeFilename('Őrmező – lakás')).toBe('Őrmező – lakás');
  });
  it('rejects empty and unsupported floorplan sources before invoking an image or PDF renderer', async () => {
    await expect(importBackground(new File([], 'empty.png', { type: 'image/png' }))).rejects.toThrow('üres');
    await expect(importBackground(new File(['<script>'], 'plan.html', { type: 'text/html' }))).rejects.toThrow('PDF, PNG vagy JPG');
  });
});
