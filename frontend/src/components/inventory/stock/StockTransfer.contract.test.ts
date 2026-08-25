import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'StockTransfer.tsx'), 'utf8');

describe('StockTransfer governed location contract', () => {
  it('disables invalid source and destination choices with visible reasons', () => {
    expect(source).toContain('governedTransferLocationAvailability');
    expect(source).toContain('destinationTransferLocationAvailability');
    expect(source).toContain('disabled={!availability.eligible}');
    expect(source).toContain('Unavailable locations are disabled by canonical inventory governance.');
    expect(source).toContain('unavailableTransferLocationLabel');
    expect(source).toContain('no compatible destination location');
  });

  it('fails closed before product search or prepare when governed context is invalid', () => {
    expect(source).toContain('sourceAvailability?.eligible');
    expect(source).toContain('destinationAvailability?.eligible');
    expect(source).toContain('disabled={!routeReady}');
    expect(source).toContain('Source location is not governed as transfer eligible.');
    expect(source).toContain('Select distinct branches and governed transfer-eligible locations first');
  });
});
