export type DestinationInfo = {
  countryCode: string;
  countryName: string;
  region: string;
  blurb: string;
  officialLinks: { label: string; url: string }[];
};

// Only real, well-known, official (.gov / government-run) links —
// no invented URLs. Extend this list as you verify more sources; see
// OPPORTUNITIES.md for the pattern to follow for sponsored/verified
// program links tied to a specific country.
export const destinationInfo: DestinationInfo[] = [
  {
    countryCode: 'DE',
    countryName: 'Germany',
    region: 'Western Europe',
    blurb: 'Strong demand for skilled workers; the federal government runs a dedicated portal for work visas and recognition of foreign qualifications.',
    officialLinks: [
      { label: 'Make it in Germany (official skilled-worker portal)', url: 'https://www.make-it-in-germany.com/en/' },
      { label: 'Federal Foreign Office — visas', url: 'https://www.auswaertiges-amt.de/en/visa-service' },
    ],
  },
  {
    countryCode: 'FR',
    countryName: 'France',
    region: 'Western Europe',
    blurb: 'Official visa portal with route-by-route requirements, including the long-term "Talent Passport" for skilled workers.',
    officialLinks: [
      { label: 'France-Visas (official government portal)', url: 'https://france-visas.gouv.fr/en/' },
    ],
  },
  {
    countryCode: 'IT',
    countryName: 'Italy',
    region: 'Western Europe',
    blurb: 'Visa applications are processed through Italy\'s consular network; the Foreign Ministry publishes country-specific requirements.',
    officialLinks: [
      { label: 'Visa for Italy (Ministry of Foreign Affairs)', url: 'https://vistoperitalia.esteri.it/home/en' },
    ],
  },
  {
    countryCode: 'GB',
    countryName: 'United Kingdom',
    region: 'Western Europe',
    blurb: 'All UK visa and immigration routes — work, study, family, visit — are managed through the official gov.uk service.',
    officialLinks: [
      { label: 'Visas and immigration (gov.uk)', url: 'https://www.gov.uk/browse/visas-immigration' },
    ],
  },
  {
    countryCode: 'ES',
    countryName: 'Spain',
    region: 'Western Europe',
    blurb: 'Spain\'s Ministry of Foreign Affairs coordinates visa policy across its global consulates, including the popular non-lucrative and digital nomad visas.',
    officialLinks: [
      { label: 'Ministry of Foreign Affairs — visas', url: 'https://www.exteriores.gob.es/en/ServiciosAlCiudadano/Paginas/Visados.aspx' },
    ],
  },
  {
    countryCode: 'NL',
    countryName: 'Netherlands',
    region: 'Western Europe',
    blurb: 'The Immigration and Naturalisation Service (IND) handles all residence permits, including the Highly Skilled Migrant scheme.',
    officialLinks: [
      { label: 'IND — Immigration and Naturalisation Service', url: 'https://ind.nl/en' },
    ],
  },
  {
    countryCode: 'AE',
    countryName: 'United Arab Emirates',
    region: 'Middle East',
    blurb: 'The Federal Authority for Identity, Citizenship, Customs & Port Security runs UAE visa and Golden Visa programs.',
    officialLinks: [
      { label: 'ICP — Identity, Citizenship, Customs & Port Security', url: 'https://icp.gov.ae/en/' },
    ],
  },
  {
    countryCode: 'CA',
    countryName: 'Canada',
    region: 'North America',
    blurb: 'Immigration, Refugees and Citizenship Canada (IRCC) runs Express Entry, work permits, and the Working Holiday program.',
    officialLinks: [
      { label: 'IRCC — official immigration portal', url: 'https://www.canada.ca/en/immigration-refugees-citizenship.html' },
    ],
  },
  {
    countryCode: 'US',
    countryName: 'United States',
    region: 'North America',
    blurb: 'The U.S. Department of State handles visa issuance; USCIS manages immigration benefits and work authorization.',
    officialLinks: [
      { label: 'U.S. Visas (Department of State)', url: 'https://travel.state.gov/content/travel/en/us-visas.html' },
    ],
  },
  {
    countryCode: 'AU',
    countryName: 'Australia',
    region: 'Oceania',
    blurb: 'The Department of Home Affairs manages all Australian visa subclasses, from skilled migration to working holiday.',
    officialLinks: [
      { label: 'Department of Home Affairs — visas', url: 'https://immi.homeaffairs.gov.au/' },
    ],
  },
];
