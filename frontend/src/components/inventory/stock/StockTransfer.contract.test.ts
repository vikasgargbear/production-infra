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

  it('uses server-published logistics and requires an explicit distance', () => {
    expect(source).toContain('context.transfer_logistics_modes');
    expect(source).toContain('No unambiguous server-supported transfer mode is available.');
    expect(source).toContain('Enter the planned transfer distance in kilometres.');
    expect(source).toContain('transport_mode: transferLogisticsModes[0].transport_mode');
    expect(source).not.toContain("transport_mode: 'in_person'");
    expect(source).not.toContain("distance_km: '0.00'");
  });

  it('requires canonical product identity fields without compatibility aliases', () => {
    expect(source).toContain('productName: selectedProduct.product_name');
    expect(source).toContain('productCode: selectedProduct.product_code');
    expect(source).not.toContain('selectedProduct.product_name || selectedProduct.name');
    expect(source).not.toContain('selectedProduct.product_code || selectedProduct.code');
  });

  it('publishes the exact canonical batch identity for deterministic browser selection', () => {
    expect(source).toContain('data-testid={`transfer-fefo-batch-');
    expect(source).toContain('batch.batch_id');
  });
});
