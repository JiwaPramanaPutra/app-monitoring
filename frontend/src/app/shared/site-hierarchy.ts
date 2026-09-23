export interface SiteNode {
  label: string;
  siteValue?: string;
  buildingValue?: string;
  children?: SiteNode[];
}

export const SITE_HIERARCHY: SiteNode[] = [
  { label: 'Disdikpora_Kota_Denpasar', children: [] },
  {
    label: 'POLTEKKES',
    children: [
      { label: 'POLTEKKES-GIZI', siteValue: 'Gizi' },
      { label: 'POLTEKKES-KEPERAWATAN', siteValue: 'Keperawatan' },
      {
        label: 'POLTEKKES-GIGI',
        siteValue: 'Gigi',
        children: [
          { label: 'CBT_SEMENTARA', siteValue: 'Gigi', buildingValue: 'CBT_SEMENTARA' },
          { label: 'GEDUNG_PERPUSTAKAAN', siteValue: 'Gigi', buildingValue: 'GEDUNG_PERPUSTAKAAN' },
          { label: 'LAB_TERPADU', siteValue: 'Gigi', buildingValue: 'LAB_TERPADU' },
          { label: 'GEDUNG_CBT', siteValue: 'Gigi', buildingValue: 'GEDUNG_CBT' }
        ]
      },
      { label: 'POLTEKKES-REKTORAT', siteValue: 'Direktorat' },
      { label: 'POLTEKKES-KEBIDANAN', siteValue: 'Kebidanan' }
    ]
  },
  { label: 'DISKOMINFO-DENPASAR', children: [] },
  { label: 'CNI_BALI', children: [] },
  { label: 'IMIGRASI_NGURAH_RAI', children: [] },
  { label: 'UHN_BANGLI', children: [] },
  { label: 'RS_BMC', children: [] }
];
