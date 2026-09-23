import { buildSiteTree, extractSiteNames } from './site-hierarchy';

describe('site-hierarchy', () => {
  const projects = [
    {
      name: 'Demo Organization',
      sites: [
        {
          name: 'Site Alpha',
          gedungList: [
            { name: 'Main Building', floors: [{ name: 'Floor 1' }] }
          ]
        },
        { name: 'Site Beta' }
      ]
    }
  ];

  it('buildSiteTree maps projects, sites, buildings, and floors', () => {
    const tree = buildSiteTree(projects);

    expect(tree.length).toBe(1);
    expect(tree[0].label).toBe('Demo Organization');

    const sites = tree[0].children!;
    expect(sites.map(s => s.siteValue)).toEqual(['Site Alpha', 'Site Beta']);

    const buildings = sites[0].children!;
    expect(buildings[0].label).toBe('Main Building');
    expect(buildings[0].buildingValue).toBe('Main Building');
    expect(buildings[0].children![0].label).toBe('Floor 1');
    expect(buildings[0].children![0].siteValue).toBe('Site Alpha');
  });

  it('extractSiteNames flattens unique site names', () => {
    expect(extractSiteNames(projects)).toEqual(['Site Alpha', 'Site Beta']);
  });

  it('handles empty and missing data', () => {
    expect(buildSiteTree([])).toEqual([]);
    expect(extractSiteNames([])).toEqual([]);
    expect(buildSiteTree([{ name: 'No Sites' } as any])[0].children).toEqual([]);
    expect(extractSiteNames([{ name: 'No Sites' } as any])).toEqual([]);
  });
});
