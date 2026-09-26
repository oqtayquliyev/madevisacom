// Location text → country, without mistaking US states (and Canadian /
// Australian regions) for countries.
//
// "Goodyear, AZ, US, 85395" is Arizona, not Azerbaijan; "Phoenix, AZ" is
// Arizona; "Baku, AZ" is Azerbaijan; "Osnabrück, DE" is Germany but
// "Wilmington, DE" is Delaware. Rules, in order:
//   1. An explicit country anywhere wins (US / USA / United States / a
//      full country name / "USA - Goodyear…").
//   2. "XX 12345" (state code + ZIP) is the United States.
//   3. Full US state / Canadian province / Australian state names map to
//      that country ("Arizona", "New Mexico" — not Mexico, "Indiana" — not
//      India). "City, Georgia" is the US state unless the city is Georgian.
//   4. A two-letter code that is both a region and a country code is
//      decided by the city; unknown cities fall back to the more common
//      reading for that code (DEFAULT_READING).
//   5. Otherwise, a plain ISO country code or a country name in the text.
//
// Pure module with no imports, so the server detector can use an
// identical copy (supabase/functions/job-facts/placeResolver.ts).

export type PlaceCountry = { code: string; name: string };

export const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};

export const CA_PROVINCES: Record<string, string> = {
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick', NL: 'Newfoundland and Labrador', NS: 'Nova Scotia',
  NT: 'Northwest Territories', NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec', SK: 'Saskatchewan', YT: 'Yukon',
};

export const AU_STATES: Record<string, string> = {
  NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland', WA: 'Western Australia', SA: 'South Australia', TAS: 'Tasmania',
  ACT: 'Australian Capital Territory', NT: 'Northern Territory',
};

const norm = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.’']/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const set = (xs: string[]) => new Set(xs.map(norm));

/** Well-known cities for codes that are both a US state and a country. */
const US_CITIES: Record<string, Set<string>> = {
  AL: set(['Birmingham', 'Montgomery', 'Huntsville', 'Mobile', 'Tuscaloosa']),
  AR: set(['Little Rock', 'Fayetteville', 'Bentonville', 'Fort Smith', 'Rogers', 'Springdale']),
  AZ: set(['Phoenix', 'Tucson', 'Mesa', 'Chandler', 'Scottsdale', 'Tempe', 'Gilbert', 'Glendale', 'Goodyear', 'Peoria', 'Flagstaff', 'Surprise', 'Avondale', 'Buckeye']),
  CA: set(['San Francisco', 'Los Angeles', 'San Diego', 'San Jose', 'Sacramento', 'Oakland', 'Palo Alto', 'Mountain View', 'Sunnyvale', 'Santa Clara', 'Menlo Park', 'Cupertino', 'Redwood City', 'Irvine', 'Fremont', 'Berkeley', 'Santa Monica', 'Pasadena', 'Long Beach', 'San Mateo', 'South San Francisco', 'Burbank', 'Culver City', 'El Segundo', 'Emeryville', 'Foster City', 'Milpitas', 'Pleasanton', 'San Ramon', 'Walnut Creek', 'Carlsbad', 'Anaheim', 'Fresno', 'Riverside', 'Santa Barbara', 'Newport Beach', 'Torrance', 'Hayward', 'Livermore']),
  CO: set(['Denver', 'Boulder', 'Colorado Springs', 'Aurora', 'Fort Collins', 'Lakewood', 'Centennial', 'Englewood', 'Broomfield', 'Louisville', 'Golden', 'Littleton', 'Westminster']),
  DE: set(['Wilmington', 'Dover', 'Newark', 'Middletown', 'Lewes']),
  GA: set(['Atlanta', 'Savannah', 'Augusta', 'Columbus', 'Macon', 'Alpharetta', 'Athens', 'Marietta', 'Norcross', 'Duluth', 'Sandy Springs', 'Roswell', 'Kennesaw', 'Peachtree City', 'Pelham', 'Lawrenceville', 'Suwanee', 'Smyrna', 'Johns Creek', 'Cumming', 'Dalton', 'Gainesville', 'Warner Robins', 'Valdosta', 'Buford', 'McDonough', 'Lithia Springs', 'Fayetteville', 'Albany', 'Conyers', 'Stone Mountain', 'Dunwoody', 'Brookhaven', 'Decatur', 'Douglasville', 'Newnan', 'Carrollton', 'Canton', 'Woodstock', 'Forest Park', 'College Park', 'Union City', 'Fairburn', 'Braselton', 'Statesboro', 'Brunswick', 'Tifton', 'Thomasville', 'Rome', 'Cartersville', 'Covington', 'Loganville', 'Snellville', 'Tucker', 'Chamblee', 'Hapeville', 'East Point', 'Stockbridge', 'Jonesboro', 'Morrow', 'Riverdale', 'Pooler', 'Rincon', 'Richmond Hill', 'Hinesville', 'Kingsland', 'Perry', 'Dublin', 'Moultrie', 'Americus', 'LaGrange', 'Griffin', 'Monroe', 'Winder', 'Commerce', 'Jefferson', 'Calhoun', 'Ringgold']),
  ID: set(['Boise', 'Meridian', 'Nampa', 'Idaho Falls', 'Pocatello', 'Coeur dAlene']),
  IL: set(['Chicago', 'Naperville', 'Aurora', 'Evanston', 'Schaumburg', 'Springfield', 'Peoria', 'Rockford', 'Deerfield', 'Northbrook', 'Oak Brook', 'Champaign', 'Downers Grove', 'Lake Forest', 'Rosemont']),
  IN: set(['Indianapolis', 'Fort Wayne', 'Evansville', 'South Bend', 'Carmel', 'Bloomington', 'Fishers', 'West Lafayette', 'Lafayette']),
  KY: set(['Louisville', 'Lexington', 'Bowling Green', 'Covington', 'Frankfort']),
  LA: set(['New Orleans', 'Baton Rouge', 'Shreveport', 'Lafayette', 'Lake Charles']),
  MA: set(['Boston', 'Cambridge', 'Worcester', 'Springfield', 'Somerville', 'Waltham', 'Burlington', 'Lexington', 'Needham', 'Woburn', 'Framingham', 'Marlborough', 'Bedford', 'Quincy', 'Lowell']),
  MD: set(['Baltimore', 'Bethesda', 'Rockville', 'Columbia', 'Annapolis', 'Silver Spring', 'Gaithersburg', 'Frederick', 'Germantown']),
  ME: set(['Portland', 'Bangor', 'Augusta', 'Lewiston', 'South Portland']),
  MN: set(['Minneapolis', 'Saint Paul', 'St Paul', 'Rochester', 'Bloomington', 'Eden Prairie', 'Duluth', 'Plymouth', 'Maple Grove']),
  MO: set(['St Louis', 'Saint Louis', 'Kansas City', 'Springfield', 'Columbia', 'Chesterfield', 'Clayton']),
  MS: set(['Jackson', 'Gulfport', 'Hattiesburg', 'Biloxi', 'Tupelo']),
  MT: set(['Billings', 'Missoula', 'Bozeman', 'Helena', 'Great Falls']),
  NC: set(['Charlotte', 'Raleigh', 'Durham', 'Greensboro', 'Winston-Salem', 'Cary', 'Chapel Hill', 'Wilmington', 'Asheville', 'Morrisville', 'Research Triangle Park']),
  NE: set(['Omaha', 'Lincoln', 'Bellevue', 'Grand Island', 'Kearney']),
  PA: set(['Philadelphia', 'Pittsburgh', 'Harrisburg', 'Allentown', 'King of Prussia', 'Malvern', 'Erie', 'Wayne', 'Conshohocken', 'Lancaster', 'Bethlehem', 'Reading', 'Scranton', 'State College']),
  SC: set(['Charleston', 'Columbia', 'Greenville', 'Spartanburg', 'Mount Pleasant', 'Myrtle Beach', 'Rock Hill']),
  SD: set(['Sioux Falls', 'Rapid City', 'Aberdeen', 'Brookings']),
  TN: set(['Nashville', 'Memphis', 'Knoxville', 'Chattanooga', 'Franklin', 'Brentwood', 'Murfreesboro']),
  VA: set(['Arlington', 'Richmond', 'Virginia Beach', 'Norfolk', 'Alexandria', 'Reston', 'McLean', 'Herndon', 'Fairfax', 'Chantilly', 'Chesapeake', 'Charlottesville', 'Tysons', 'Vienna', 'Ashburn', 'Sterling']),
  WA: set(['Seattle', 'Bellevue', 'Redmond', 'Tacoma', 'Spokane', 'Kirkland', 'Everett', 'Vancouver', 'Olympia', 'Bothell', 'Renton']),
};

/** Well-known cities of the *country* behind an ambiguous code. */
const COUNTRY_CITIES: Record<string, Set<string>> = {
  AL: set(['Tirana', 'Durres', 'Vlore', 'Shkoder']),
  AR: set(['Buenos Aires', 'Cordoba', 'Rosario', 'Mendoza', 'La Plata', 'Mar del Plata']),
  AU: set([]),
  AZ: set(['Baku', 'Ganja', 'Sumgait', 'Sumqayit', 'Mingachevir', 'Shirvan', 'Lankaran', 'Nakhchivan']),
  CA: set(['Toronto', 'Vancouver', 'Montreal', 'Ottawa', 'Calgary', 'Edmonton', 'Winnipeg', 'Quebec City', 'Halifax', 'Waterloo', 'Kitchener', 'Mississauga', 'Victoria', 'Hamilton', 'London', 'Markham', 'Burnaby', 'Saskatoon', 'Regina', 'Laval', 'Brampton', 'Surrey', 'Richmond Hill', 'Oakville', 'Gatineau', 'St Johns', 'Saint John', 'Charlottetown', 'Corner Brook', 'Fredericton', 'Moncton', 'Whitehorse', 'Yellowknife', 'Iqaluit', 'Kelowna', 'Guelph']),
  CO: set(['Bogota', 'Medellin', 'Cali', 'Barranquilla', 'Cartagena', 'Bucaramanga', 'Pereira']),
  DE: set(['Berlin', 'Munich', 'Munchen', 'Hamburg', 'Frankfurt', 'Frankfurt am Main', 'Cologne', 'Koln', 'Stuttgart', 'Dusseldorf', 'Leipzig', 'Dresden', 'Hannover', 'Nuremberg', 'Nurnberg', 'Bremen', 'Essen', 'Dortmund', 'Bonn', 'Mannheim', 'Karlsruhe', 'Osnabruck', 'Heidelberg', 'Walldorf', 'Wolfsburg', 'Ingolstadt', 'Darmstadt', 'Aachen', 'Munster', 'Augsburg', 'Freiburg', 'Kiel', 'Potsdam', 'Erlangen', 'Regensburg']),
  GA: set(['Libreville', 'Port-Gentil', 'Franceville']),
  ID: set(['Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Denpasar', 'Bali', 'Yogyakarta', 'Semarang', 'Tangerang', 'Bekasi', 'Batam']),
  IL: set(['Tel Aviv', 'Tel Aviv-Yafo', 'Jerusalem', 'Haifa', 'Herzliya', 'Petah Tikva', 'Raanana', 'Netanya', 'Beer Sheva', 'Rehovot', 'Ramat Gan', 'Yokneam']),
  IN: set(['Bangalore', 'Bengaluru', 'Mumbai', 'Delhi', 'New Delhi', 'Hyderabad', 'Chennai', 'Pune', 'Kolkata', 'Noida', 'Gurgaon', 'Gurugram', 'Ahmedabad', 'Jaipur', 'Kochi', 'Coimbatore', 'Chandigarh', 'Indore', 'Thiruvananthapuram', 'Mysore', 'Vadodara', 'Nagpur', 'Bhubaneswar']),
  KY: set(['George Town', 'Grand Cayman']),
  LA: set(['Vientiane', 'Luang Prabang']),
  MA: set(['Casablanca', 'Rabat', 'Marrakech', 'Marrakesh', 'Tangier', 'Tanger', 'Fes', 'Fez', 'Agadir', 'Meknes']),
  MD: set(['Chisinau', 'Balti']),
  ME: set(['Podgorica', 'Budva', 'Bar', 'Niksic']),
  MN: set(['Ulaanbaatar', 'Ulan Bator']),
  MO: set(['Macau', 'Macao']),
  MS: set(['Plymouth', 'Brades']),
  MT: set(['Valletta', 'Sliema', 'Birkirkara', 'St Julians', 'Msida', 'Gzira', 'Mosta']),
  NC: set(['Noumea']),
  NE: set(['Niamey', 'Zinder', 'Maradi']),
  NL: set(['Amsterdam', 'Rotterdam', 'The Hague', 'Den Haag', 'Utrecht', 'Eindhoven', 'Groningen', 'Leiden', 'Delft', 'Haarlem', 'Amstelveen', 'Hoofddorp', 'Schiphol', 'Nijmegen', 'Arnhem', 'Maastricht', 'Tilburg', 'Breda', 'Zwolle', 'Almere']),
  PA: set(['Panama City', 'Panama', 'Colon', 'David']),
  PE: set(['Lima', 'Arequipa', 'Cusco', 'Trujillo']),
  SA: set(['Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Makkah', 'Medina', 'Khobar', 'Al Khobar', 'Dhahran', 'NEOM']),
  SC: set(['Victoria', 'Mahe']),
  SD: set(['Khartoum', 'Omdurman', 'Port Sudan']),
  SK: set(['Bratislava', 'Kosice', 'Zilina', 'Nitra', 'Banska Bystrica', 'Presov', 'Trnava']),
  TN: set(['Tunis', 'Sfax', 'Sousse', 'Ariana']),
  VA: set(['Vatican City']),
  WA: set([]),
};

/** For an ambiguous code with an unknown city, which reading is more common in job listings. */
const DEFAULT_READING: Record<string, 'region' | 'country'> = {
  DE: 'country', IN: 'country', IL: 'country', ID: 'country', AR: 'country', CO: 'country', NL: 'country', SK: 'country', PE: 'country',
  SA: 'country', MA: 'country', MT: 'country', ME: 'country',
};

const AU_CITIES = set(['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Canberra', 'Hobart', 'Darwin', 'Gold Coast', 'Fremantle', 'Parramatta', 'Newcastle', 'Geelong']);
const GE_CITIES = set(['Tbilisi', 'Batumi', 'Kutaisi', 'Rustavi', 'Zugdidi']);

const COUNTRY_ALIASES: Record<string, string> = {
  us: 'US', usa: 'US', 'u s': 'US', 'u s a': 'US', 'united states': 'US', 'united states of america': 'US', america: 'US',
  uk: 'GB', 'u k': 'GB', 'great britain': 'GB', britain: 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB',
  uae: 'AE', 'u a e': 'AE', emirates: 'AE',
  deutschland: 'DE', dach: 'DE', nederland: 'NL', holland: 'NL', espana: 'ES', italia: 'IT', schweiz: 'CH', suisse: 'CH', osterreich: 'AT',
  polska: 'PL', 'czech republic': 'CZ', czechia: 'CZ', 'south korea': 'KR', korea: 'KR', 'republic of korea': 'KR', turkiye: 'TR', turkey: 'TR',
  russia: 'RU', vietnam: 'VN', 'hong kong sar': 'HK', 'mainland china': 'CN', prc: 'CN',
};

const US_STATE_BY_NAME = new Map(Object.entries(US_STATES).map(([c, n]) => [norm(n), c]));
const CA_PROVINCE_BY_NAME = new Map(Object.entries(CA_PROVINCES).map(([c, n]) => [norm(n), c]));
const AU_STATE_BY_NAME = new Map(Object.entries(AU_STATES).map(([c, n]) => [norm(n), c]));

export type PlaceResolver = (raw: string | null | undefined) => PlaceCountry | null;

export function createPlaceResolver(countries: PlaceCountry[]): PlaceResolver {
  const byCode = new Map(countries.map((c) => [c.code.toUpperCase(), c]));
  const byName = new Map(countries.map((c) => [norm(c.name), c]));
  const get = (code: string) => byCode.get(code) ?? null;
  // Longest names first so "Papua New Guinea" beats "Guinea".
  const namesByLength = [...byName.entries()].filter(([n]) => n.length > 3).sort((a, b) => b[0].length - a[0].length);
  const regionNames = [...US_STATE_BY_NAME.keys(), ...CA_PROVINCE_BY_NAME.keys(), ...AU_STATE_BY_NAME.keys()].sort((a, b) => b.length - a.length);

  /** A two-letter code next to a city: region or country? */
  const readCode = (code: string, city: string | null): PlaceCountry | null => {
    const c = norm(city ?? '');
    const iso = get(code);
    const isUS = code in US_STATES;
    const isCA = code in CA_PROVINCES;
    const isAU = code in AU_STATES;
    if (!isUS && !isCA && !isAU) return iso;
    // City tells us directly.
    if (c) {
      if (isAU && AU_CITIES.has(c)) return get('AU');
      if (isUS && US_CITIES[code]?.has(c)) return get('US');
      if (iso && COUNTRY_CITIES[code]?.has(c)) return iso;
      if (isCA && COUNTRY_CITIES.CA.has(c)) return get('CA');
    }
    if (!iso) return get(isUS ? 'US' : isCA ? 'CA' : 'AU'); // e.g. TX, ON, NSW — not country codes at all
    if (DEFAULT_READING[code] === 'country') return iso;
    return get(isUS ? 'US' : isCA ? 'CA' : 'AU');
  };

  /** One comma-separated part on its own (city given for context). */
  const readSegment = (seg: string, city: string | null, isFirst: boolean): PlaceCountry | null => {
    const n = norm(seg);
    if (!n) return null;
    const alias = COUNTRY_ALIASES[n];
    if (alias) return get(alias);
    // "USA - Goodyear", "US: Remote"
    const prefix = n.match(/^(usa|us|u s a?|united states|uk|uae)\s*[-–:|]/);
    if (prefix) return get(COUNTRY_ALIASES[prefix[1]] ?? 'US');
    // Region names before country names: "New Mexico", "Indiana", "Georgia".
    // (Not in the first part — that's the city.)
    if (!isFirst) {
      if (n === 'georgia') return city && GE_CITIES.has(norm(city)) ? get('GE') : get('US');
      if (US_STATE_BY_NAME.has(n)) return get('US');
      if (CA_PROVINCE_BY_NAME.has(n)) return get('CA');
      if (AU_STATE_BY_NAME.has(n) && n !== 'victoria') return get('AU');
    }
    const exact = byName.get(n);
    if (exact) return exact;
    // "AZ 85395" — state + ZIP.
    const zip = seg.trim().match(/^([A-Z]{2})\s+\d{5}(?:-\d{4})?$/);
    if (zip && zip[1] in US_STATES) return get('US');
    const code = seg.trim().match(/^[A-Za-z]{2,3}$/) ? seg.trim().toUpperCase() : null;
    if (code && !isFirst) return readCode(code, city);
    return null;
  };

  return (raw) => {
    if (!raw) return null;
    const cleaned = raw.replace(/\bLocations?\b/gi, ' ').replace(/[()]/g, ',').replace(/\s+/g, ' ').trim();
    if (!cleaned) return null;
    const segments = cleaned
      .split(/[,;/|]| - (?=[A-Z])/)
      .map((s) => s.trim())
      .filter((s) => s && !/^[\d\s-]{3,10}$/.test(s));
    if (!segments.length) return null;
    // Whole string is just a code/name: "US", "DE", "Germany".
    if (segments.length === 1) {
      const only = segments[0];
      const n = norm(only);
      if (COUNTRY_ALIASES[n]) return get(COUNTRY_ALIASES[n]);
      const prefix = n.match(/^(usa|us|u s a?|united states|uk|uae)\s*[-–:|]/);
      if (prefix) return get(COUNTRY_ALIASES[prefix[1]] ?? 'US');
      if (/^[A-Za-z]{2}$/.test(only)) return get(only.toUpperCase());
      if (US_STATE_BY_NAME.has(n) && n !== 'georgia') return get('US');
      if (byName.get(n)) return byName.get(n)!;
    }
    const city = segments.length > 1 ? segments[0] : null;

    // 1. Explicit country anywhere (last one wins, it's usually most specific).
    for (let i = segments.length - 1; i >= 0; i--) {
      const n = norm(segments[i]);
      if (COUNTRY_ALIASES[n]) return get(COUNTRY_ALIASES[n]);
      const prefix = n.match(/^(usa|us|u s a?|united states|uk|uae)\s*[-–:|]/);
      if (prefix) return get(COUNTRY_ALIASES[prefix[1]] ?? 'US');
    }
    // 2. State + ZIP anywhere → US.
    if (/\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(cleaned)) {
      const st = cleaned.match(/\b([A-Z]{2})\s+\d{5}/)?.[1];
      if (st && st in US_STATES) return get('US');
    }
    // 3–4. Segment by segment, from the end.
    for (let i = segments.length - 1; i >= 0; i--) {
      const hit = readSegment(segments[i], city, i === 0 && segments.length > 1);
      if (hit) return hit;
    }
    // 5. A region or country name somewhere inside the text.
    const text = norm(cleaned);
    for (const rn of regionNames) {
      if (rn === 'georgia' || rn === 'victoria') continue;
      if (new RegExp(`\\b${rn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text)) {
        return US_STATE_BY_NAME.has(rn) ? get('US') : CA_PROVINCE_BY_NAME.has(rn) ? get('CA') : get('AU');
      }
    }
    for (const [name, c] of namesByLength) {
      if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text)) return c;
    }
    return null;
  };
}

/** Is this code both a US state / CA province / AU state and a country code? */
export function isAmbiguousRegionCode(code: string): boolean {
  // GE: the country Georgia shares its name with the US state ("Atlanta, Georgia").
  return code in US_STATES || code in CA_PROVINCES || code in AU_STATES || code === 'GE';
}

/**
 * Positive evidence only: the city is a well-known city of the US state /
 * Canadian province / Australian state behind `code` ("Phoenix" + AZ → "US").
 * Returns null when unsure — used to repair already-saved jobs safely.
 */
export function knownRegionCity(code: string, city: string | null | undefined): string | null {
  const c = norm(city ?? '');
  if (!c) return null;
  if (code === 'GE') return US_CITIES.GA?.has(c) ? 'US' : null;
  if (code in AU_STATES && AU_CITIES.has(c)) return 'AU';
  if (code in US_STATES && US_CITIES[code]?.has(c)) return 'US';
  if (code in CA_PROVINCES && COUNTRY_CITIES.CA.has(c)) return 'CA';
  return null;
}
