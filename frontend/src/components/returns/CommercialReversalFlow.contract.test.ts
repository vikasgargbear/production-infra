import fs from 'fs';
import path from 'path';

const read = (name: string) => fs.readFileSync(path.join(__dirname, name), 'utf8');

describe('commercial reversal visible lifecycle', () => {
  it('mounts all three typed operations with review, independent approval, execute, and readback', () => {
    const flow = read('CommercialReversalFlow.tsx');
    const command = read('utils/commercialReversalCommand.ts');
    const hub = read('ReturnsHub.tsx');
    expect(hub).toContain("id: 'commercial-reversal'");
    expect(flow).toContain('Prepare immutable review');
    expect(flow).toContain('Approve as distinct reviewer');
    expect(flow).toContain('Execute as requester');
    expect(flow).toContain('commercial-reversal-readback');
    expect(flow).toContain('canonical-immutable-preview');
    expect(command).toContain("sales.return.reversal.prepare");
    expect(command).toContain("procurement.purchase_return.reversal.prepare");
    expect(command).toContain("finance.adjustment_note.reversal.prepare");
    expect(command).toContain('/web/actions/commercial-reversal/commands/${commandId}/readback');
    expect(command).not.toMatch(/\.reduce\(|\.filter\(|grand[_A-Z]|tax[_A-Z].*\+/i);
  });
});
