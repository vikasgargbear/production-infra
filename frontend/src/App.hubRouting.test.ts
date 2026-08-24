import { readFileSync } from 'fs';

describe('App hub routing wiring', () => {
  const source = readFileSync(__dirname + '/App.tsx', 'utf8');

  it.each(['GSTHub', 'MasterHub'])('wires the hash subpage into %s in both directions', hub => {
    const match = source.match(new RegExp(`<${hub}[^>]*>`, 's'));
    expect(match?.[0]).toContain('initialSubpage={subpage}');
    expect(match?.[0]).toContain('onSubpageChange={setSubpage}');
  });
});
