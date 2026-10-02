export type PartnerCategory =
  | 'Immigration & Human Capital'
  | 'Investment & Economic Development'
  | 'Innovation & Startups'
  | 'Education & Scholarships'
  | 'Research'
  | 'Tourism & Destinations';

export type OfficialPartner = {
  name: string;
  country: string;
  countryCode: string;
  category: PartnerCategory;
  officialWebsite: string;
  /** What this institution actually publishes — not a marketing pitch. */
  description: string;
  /** Named programs where one genuinely exists; otherwise a factual category of what they offer. */
  programs: string[];
};

export const officialPartners: OfficialPartner[] = [
  // 1. Immigration & Human Capital
  {
    name: 'Immigration, Refugees and Citizenship Canada (IRCC)',
    country: 'Canada',
    countryCode: 'CA',
    category: 'Immigration & Human Capital',
    officialWebsite: 'https://www.canada.ca/en/services/immigration-citizenship.html',
    description: "Canada's federal department responsible for immigration, visas, permanent residence and citizenship.",
    programs: ['Express Entry', 'Work permits', 'Study permits', 'Citizenship'],
  },
  {
    name: 'Make it in Germany',
    country: 'Germany',
    countryCode: 'DE',
    category: 'Immigration & Human Capital',
    officialWebsite: 'https://www.make-it-in-germany.com/',
    description: "The German federal government's official portal for skilled workers moving to Germany.",
    programs: ['Skilled worker visas', 'Job seeker visa', 'Recognition of foreign qualifications'],
  },
  {
    name: 'Department of Home Affairs',
    country: 'Australia',
    countryCode: 'AU',
    category: 'Immigration & Human Capital',
    officialWebsite: 'https://www.homeaffairs.gov.au/',
    description: "Australia's government department overseeing visas, immigration and border policy.",
    programs: ['Skilled visas', 'Work visas', 'Student visas'],
  },
  {
    name: 'UK Visas & Immigration / GOV.UK',
    country: 'United Kingdom',
    countryCode: 'GB',
    category: 'Immigration & Human Capital',
    officialWebsite: 'https://www.gov.uk/browse/visas-immigration',
    description: 'Official UK government service for visa and immigration applications.',
    programs: ['Skilled Worker visa', 'Student visa', 'Family visas'],
  },
  {
    name: 'Immigration and Naturalisation Service (IND)',
    country: 'Netherlands',
    countryCode: 'NL',
    category: 'Immigration & Human Capital',
    officialWebsite: 'https://ind.nl/en',
    description: "The Netherlands' agency for residence permits, asylum and naturalisation.",
    programs: ['Highly Skilled Migrant scheme', 'Study residence permits'],
  },
  {
    name: 'Department of Enterprise, Tourism and Employment',
    country: 'Ireland',
    countryCode: 'IE',
    category: 'Immigration & Human Capital',
    officialWebsite: 'https://enterprise.gov.ie/en/',
    description: "Irish government department covering employment permits, enterprise and trade policy.",
    programs: ['Employment permits'],
  },
  {
    name: 'Immigration New Zealand',
    country: 'New Zealand',
    countryCode: 'NZ',
    category: 'Immigration & Human Capital',
    officialWebsite: 'https://www.immigration.govt.nz/',
    description: "New Zealand's government agency for visas, residence and immigration policy.",
    programs: ['Skilled Migrant Category', 'Work visas', 'Student visas'],
  },
  {
    name: 'Immigration Services Agency of Japan',
    country: 'Japan',
    countryCode: 'JP',
    category: 'Immigration & Human Capital',
    officialWebsite: 'https://www.moj.go.jp/isa/',
    description: "Japan's agency overseeing residency status, visas and immigration control.",
    programs: ['Specified Skilled Worker', 'Status of residence applications'],
  },
  {
    name: 'Ministry of Manpower',
    country: 'Singapore',
    countryCode: 'SG',
    category: 'Immigration & Human Capital',
    officialWebsite: 'https://www.mom.gov.sg/',
    description: "Singapore's ministry responsible for work passes and employment policy.",
    programs: ['Employment Pass', 'S Pass', 'Work Permit'],
  },
  {
    name: 'State Secretariat for Migration (SEM)',
    country: 'Switzerland',
    countryCode: 'CH',
    category: 'Immigration & Human Capital',
    officialWebsite: 'https://www.sem.admin.ch/sem/en/home.html',
    description: "Switzerland's federal authority for migration, visas and residence permits.",
    programs: ['Residence permits', 'Work permits'],
  },
  {
    name: 'Ministry of the Interior',
    country: 'France',
    countryCode: 'FR',
    category: 'Immigration & Human Capital',
    officialWebsite: 'https://www.interieur.gouv.fr/',
    description: "French government ministry overseeing immigration and residence policy.",
    programs: ['Talent Passport', 'Residence permits'],
  },

  // 2. Investment & Economic Development
  {
    name: 'Invest in Canada',
    country: 'Canada',
    countryCode: 'CA',
    category: 'Investment & Economic Development',
    officialWebsite: 'https://www.investcanada.ca/',
    description: "Canada's official investment promotion agency for foreign direct investment.",
    programs: ['Foreign direct investment facilitation'],
  },
  {
    name: 'Invest Ontario',
    country: 'Canada',
    countryCode: 'CA',
    category: 'Investment & Economic Development',
    officialWebsite: 'https://www.investontario.ca/',
    description: "Ontario's provincial agency for attracting business investment.",
    programs: ['Business investment facilitation'],
  },
  {
    name: 'Invest Alberta',
    country: 'Canada',
    countryCode: 'CA',
    category: 'Investment & Economic Development',
    officialWebsite: 'https://investalberta.ca/',
    description: "Alberta's provincial corporation for economic development and investment attraction.",
    programs: ['Business investment facilitation'],
  },
  {
    name: 'Austrade',
    country: 'Australia',
    countryCode: 'AU',
    category: 'Investment & Economic Development',
    officialWebsite: 'https://www.austrade.gov.au/',
    description: "Australia's trade and investment commission promoting trade, investment and education.",
    programs: ['Trade & investment facilitation'],
  },
  {
    name: 'Invest Victoria',
    country: 'Australia',
    countryCode: 'AU',
    category: 'Investment & Economic Development',
    officialWebsite: 'https://invest.vic.gov.au/',
    description: "Victorian state government agency for attracting investment.",
    programs: ['Business investment facilitation'],
  },
  {
    name: 'Singapore Economic Development Board (EDB)',
    country: 'Singapore',
    countryCode: 'SG',
    category: 'Investment & Economic Development',
    officialWebsite: 'https://www.edb.gov.sg/',
    description: "Singapore's lead agency for planning and executing investment strategies.",
    programs: ['Foreign investment facilitation'],
  },
  {
    name: 'Enterprise Singapore',
    country: 'Singapore',
    countryCode: 'SG',
    category: 'Investment & Economic Development',
    officialWebsite: 'https://www.enterprisesg.gov.sg/',
    description: "Singapore's government agency championing enterprise development and innovation.",
    programs: ['SME growth support', 'Startup support'],
  },
  {
    name: 'Germany Trade & Invest (GTAI)',
    country: 'Germany',
    countryCode: 'DE',
    category: 'Investment & Economic Development',
    officialWebsite: 'https://www.gtai.de/en/invest',
    description: "Germany's economic development agency for foreign trade and inward investment.",
    programs: ['Foreign investment facilitation'],
  },
  {
    name: 'Business France',
    country: 'France',
    countryCode: 'FR',
    category: 'Investment & Economic Development',
    officialWebsite: 'https://www.businessfrance.fr/en',
    description: "France's national agency for international business development and investment.",
    programs: ['Investment & export facilitation'],
  },
  {
    name: 'Netherlands Enterprise Agency (RVO)',
    country: 'Netherlands',
    countryCode: 'NL',
    category: 'Investment & Economic Development',
    officialWebsite: 'https://english.rvo.nl/',
    description: "Dutch government agency implementing policy for entrepreneurship, innovation and investment.",
    programs: ['Business & innovation support'],
  },
  {
    name: 'New Zealand Trade & Enterprise (NZTE)',
    country: 'New Zealand',
    countryCode: 'NZ',
    category: 'Investment & Economic Development',
    officialWebsite: 'https://www.nzte.govt.nz/',
    description: "New Zealand's international business development agency.",
    programs: ['Export & investment support'],
  },

  // 3. Innovation & Startups
  {
    name: 'Innovate UK',
    country: 'United Kingdom',
    countryCode: 'GB',
    category: 'Innovation & Startups',
    officialWebsite: 'https://www.ukri.org/councils/innovate-uk/',
    description: "The UK's national innovation agency, part of UK Research and Innovation.",
    programs: ['Innovation grants', 'Smart Grants'],
  },

  // 4. Education, Scholarships & Research
  {
    name: 'DAAD',
    country: 'Germany',
    countryCode: 'DE',
    category: 'Education & Scholarships',
    officialWebsite: 'https://www.daad.de/en/',
    description: "Germany's national agency supporting international academic exchange and scholarships.",
    programs: ['DAAD Scholarships'],
  },
  {
    name: 'Chevening',
    country: 'United Kingdom',
    countryCode: 'GB',
    category: 'Education & Scholarships',
    officialWebsite: 'https://www.chevening.org/',
    description: "The UK government's global scholarship programme funded by the Foreign, Commonwealth & Development Office.",
    programs: ['Chevening Scholarship'],
  },
  {
    name: 'Ministry of Education, Culture, Sports, Science and Technology (MEXT)',
    country: 'Japan',
    countryCode: 'JP',
    category: 'Education & Scholarships',
    officialWebsite: 'https://www.mext.go.jp/en/',
    description: "Japan's ministry overseeing education policy, including scholarships for international students.",
    programs: ['MEXT Scholarship'],
  },
  {
    name: 'Erasmus+',
    country: 'European Union',
    countryCode: 'EU',
    category: 'Education & Scholarships',
    officialWebsite: 'https://erasmus-plus.ec.europa.eu/',
    description: "The European Union's programme for education, training, youth and sport exchange.",
    programs: ['Erasmus+ Exchange Programme'],
  },

  // Research
  {
    name: 'UK Research and Innovation (UKRI)',
    country: 'United Kingdom',
    countryCode: 'GB',
    category: 'Research',
    officialWebsite: 'https://www.ukri.org/',
    description: "UK public body directing research and innovation funding across the sciences and humanities.",
    programs: ['Research council funding'],
  },
  {
    name: 'Research Ireland',
    country: 'Ireland',
    countryCode: 'IE',
    category: 'Research',
    officialWebsite: 'https://www.researchireland.ie/',
    description: "Ireland's national research funding agency.",
    programs: ['Research funding programmes'],
  },

  // 5. Tourism & Destinations
  {
    name: 'Destination Canada',
    country: 'Canada',
    countryCode: 'CA',
    category: 'Tourism & Destinations',
    officialWebsite: 'https://www.destinationcanada.com/',
    description: "Canada's national tourism marketing organization.",
    programs: ['Destination marketing'],
  },
  {
    name: 'Tourism Australia',
    country: 'Australia',
    countryCode: 'AU',
    category: 'Tourism & Destinations',
    officialWebsite: 'https://www.australia.com/',
    description: "Australia's government body responsible for international tourism marketing.",
    programs: ['Destination marketing'],
  },
  {
    name: 'VisitBritain',
    country: 'United Kingdom',
    countryCode: 'GB',
    category: 'Tourism & Destinations',
    officialWebsite: 'https://www.visitbritain.org/',
    description: "The UK's national tourism agency promoting Britain internationally.",
    programs: ['Destination marketing'],
  },
  {
    name: 'Singapore Tourism Board',
    country: 'Singapore',
    countryCode: 'SG',
    category: 'Tourism & Destinations',
    officialWebsite: 'https://www.stb.gov.sg/',
    description: "Singapore's statutory board responsible for tourism development and promotion.",
    programs: ['Destination marketing'],
  },
  {
    name: 'Atout France',
    country: 'France',
    countryCode: 'FR',
    category: 'Tourism & Destinations',
    officialWebsite: 'https://www.atout-france.fr/',
    description: "France's tourism development agency.",
    programs: ['Destination marketing'],
  },
];

export const partnerCategories: PartnerCategory[] = [
  'Immigration & Human Capital',
  'Investment & Economic Development',
  'Innovation & Startups',
  'Education & Scholarships',
  'Research',
  'Tourism & Destinations',
];
