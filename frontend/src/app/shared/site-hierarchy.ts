export interface SiteNode {
  label: string;
  siteValue?: string;
  buildingValue?: string;
  children?: SiteNode[];
}

/** Bentuk tree SiteNode dari daftar project (respons /api/projects). */
export function buildSiteTree(projects: any[]): SiteNode[] {
  return (projects || []).map(p => ({
    label: p.name,
    children: ((p.sites || []) as any[]).map(s => ({
      label: s.name,
      siteValue: s.name,
      children: ((s.gedungList || []) as any[]).map(g => ({
        label: g.name,
        siteValue: s.name,
        buildingValue: g.name,
        children: ((g.floors || []) as any[]).map(f => ({
          label: f.name,
          siteValue: s.name,
          buildingValue: g.name
        }))
      }))
    }))
  }));
}

/** Daftar nama site unik dari daftar project, urut sesuai data. */
export function extractSiteNames(projects: any[]): string[] {
  const names: string[] = [];
  for (const p of projects || []) {
    for (const s of ((p.sites || []) as any[])) {
      if (s.name && !names.includes(s.name)) names.push(s.name);
    }
  }
  return names;
}
