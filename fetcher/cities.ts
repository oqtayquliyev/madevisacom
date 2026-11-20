// Big job-market cities → country, for ads that give only a city ("Berlin", "Munich").
// Used only when the location has no country in it. Add a line when you see a city land on
// "Several locations" on the site. Keys are lowercase, without accents.

const LIST: Record<string, string[]> = {
  DE: ['berlin', 'munich', 'munchen', 'hamburg', 'frankfurt', 'frankfurt am main', 'cologne', 'koln', 'stuttgart', 'dusseldorf', 'leipzig', 'dortmund', 'essen', 'bremen', 'dresden', 'hanover', 'hannover', 'nuremberg', 'nurnberg', 'duisburg', 'bochum', 'wuppertal', 'bielefeld', 'bonn', 'munster', 'karlsruhe', 'mannheim', 'augsburg', 'wiesbaden', 'aachen', 'kiel', 'freiburg', 'heidelberg', 'potsdam', 'regensburg', 'ingolstadt', 'wolfsburg', 'erlangen', 'darmstadt', 'mainz', 'ulm', 'jena', 'rostock', 'magdeburg', 'chemnitz', 'kassel', 'braunschweig', 'osnabruck', 'oldenburg', 'saarbrucken', 'walldorf', 'herzogenaurach', 'eschborn', 'gutersloh', 'paderborn', 'lubeck', 'halle', 'erfurt', 'wurzburg', 'heilbronn', 'pforzheim', 'reutlingen', 'tubingen', 'konstanz', 'garching', 'unterfohring', 'neckarsulm'],
  AT: ['vienna', 'wien', 'graz', 'linz', 'salzburg', 'innsbruck', 'klagenfurt'],
  CH: ['zurich', 'geneva', 'geneve', 'basel', 'bern', 'lausanne', 'zug', 'lucerne', 'luzern', 'st. gallen', 'winterthur', 'lugano', 'baar'],
  NL: ['amsterdam', 'rotterdam', 'the hague', 'den haag', 'utrecht', 'eindhoven', 'groningen', 'leiden', 'delft', 'haarlem', 'amstelveen', 'hoofddorp', 'nijmegen', 'arnhem', 'breda', 'tilburg', 'maastricht', 'enschede', 'almere', 'schiphol'],
  BE: ['brussels', 'bruxelles', 'antwerp', 'antwerpen', 'ghent', 'gent', 'leuven', 'liege', 'mechelen', 'bruges'],
  LU: ['luxembourg'],
  FR: ['paris', 'lyon', 'marseille', 'toulouse', 'nice', 'nantes', 'bordeaux', 'lille', 'strasbourg', 'montpellier', 'rennes', 'grenoble', 'sophia antipolis', 'la defense', 'boulogne-billancourt', 'issy-les-moulineaux', 'levallois-perret'],
  ES: ['madrid', 'barcelona', 'valencia', 'seville', 'sevilla', 'malaga', 'bilbao', 'zaragoza', 'palma', 'alicante', 'las palmas', 'granada'],
  PT: ['lisbon', 'lisboa', 'porto', 'braga', 'coimbra', 'aveiro', 'faro'],
  IT: ['milan', 'milano', 'rome', 'roma', 'turin', 'torino', 'naples', 'napoli', 'bologna', 'florence', 'firenze', 'genoa', 'genova', 'padua', 'padova', 'verona', 'trieste'],
  IE: ['dublin', 'cork', 'galway', 'limerick'],
  GB: ['london', 'manchester', 'birmingham', 'edinburgh', 'glasgow', 'leeds', 'bristol', 'liverpool', 'cambridge', 'oxford', 'belfast', 'cardiff', 'newcastle', 'nottingham', 'sheffield', 'reading', 'brighton', 'milton keynes', 'aberdeen', 'southampton', 'leicester', 'coventry', 'york', 'bath', 'slough', 'guildford'],
  DK: ['copenhagen', 'kobenhavn', 'aarhus', 'odense', 'aalborg'],
  SE: ['stockholm', 'gothenburg', 'goteborg', 'malmo', 'uppsala', 'lund', 'linkoping'],
  NO: ['oslo', 'bergen', 'trondheim', 'stavanger'],
  FI: ['helsinki', 'espoo', 'tampere', 'oulu', 'turku', 'vantaa'],
  EE: ['tallinn', 'tartu'],
  LV: ['riga'],
  LT: ['vilnius', 'kaunas'],
  PL: ['warsaw', 'warszawa', 'krakow', 'wroclaw', 'gdansk', 'poznan', 'lodz', 'katowice', 'gdynia', 'lublin'],
  CZ: ['prague', 'praha', 'brno', 'ostrava'],
  SK: ['bratislava', 'kosice'],
  HU: ['budapest', 'debrecen'],
  RO: ['bucharest', 'bucuresti', 'cluj-napoca', 'cluj', 'iasi', 'timisoara', 'brasov'],
  BG: ['sofia', 'plovdiv', 'varna'],
  GR: ['athens', 'thessaloniki'],
  HR: ['zagreb', 'split'],
  SI: ['ljubljana'],
  RS: ['belgrade', 'novi sad'],
  CY: ['limassol', 'nicosia', 'larnaca', 'paphos'],
  MT: ['valletta', 'sliema', 'st julians'],
  TR: ['istanbul', 'ankara', 'izmir'],
  UA: ['kyiv', 'kiev', 'lviv', 'kharkiv'],
  AZ: ['baku', 'sumgayit'],
  GE: ['tbilisi'],
  AM: ['yerevan'],
  AE: ['dubai', 'abu dhabi', 'sharjah'],
  SA: ['riyadh', 'jeddah'],
  QA: ['doha'],
  IL: ['tel aviv', 'tel aviv-yafo', 'jerusalem', 'haifa', 'herzliya'],
  US: ['new york', 'new york city', 'nyc', 'san francisco', 'seattle', 'austin', 'boston', 'chicago', 'los angeles', 'denver', 'atlanta', 'miami', 'washington, d.c.', 'washington dc', 'san jose', 'palo alto', 'mountain view', 'menlo park', 'sunnyvale', 'san diego', 'portland', 'philadelphia', 'dallas', 'houston', 'phoenix', 'pittsburgh', 'salt lake city', 'minneapolis', 'detroit', 'nashville', 'raleigh', 'brooklyn', 'cupertino', 'redmond', 'bellevue', 'santa clara', 'oakland', 'boulder', 'cambridge, ma'],
  CA: ['toronto', 'vancouver', 'montreal', 'ottawa', 'calgary', 'edmonton', 'waterloo', 'quebec city', 'winnipeg', 'halifax', 'victoria', 'kitchener'],
  MX: ['mexico city', 'ciudad de mexico', 'guadalajara', 'monterrey'],
  BR: ['sao paulo', 'rio de janeiro', 'belo horizonte', 'curitiba', 'porto alegre', 'florianopolis'],
  AR: ['buenos aires', 'cordoba'],
  CO: ['bogota', 'medellin'],
  CL: ['santiago'],
  AU: ['sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'canberra', 'gold coast'],
  NZ: ['auckland', 'wellington', 'christchurch'],
  SG: ['singapore'],
  JP: ['tokyo', 'osaka', 'kyoto', 'yokohama', 'fukuoka', 'nagoya'],
  KR: ['seoul', 'busan'],
  CN: ['shanghai', 'beijing', 'shenzhen', 'guangzhou', 'hangzhou'],
  HK: ['hong kong'],
  TW: ['taipei'],
  IN: ['bangalore', 'bengaluru', 'mumbai', 'delhi', 'new delhi', 'hyderabad', 'pune', 'chennai', 'gurgaon', 'gurugram', 'noida', 'kolkata', 'ahmedabad'],
  MY: ['kuala lumpur', 'penang'],
  TH: ['bangkok'],
  VN: ['ho chi minh city', 'hanoi'],
  ID: ['jakarta'],
  PH: ['manila', 'makati', 'taguig', 'cebu'],
  ZA: ['cape town', 'johannesburg', 'durban', 'pretoria'],
  EG: ['cairo'],
  NG: ['lagos', 'abuja'],
  KE: ['nairobi'],
  MA: ['casablanca', 'rabat'],
};

const CITY = new Map<string, string>();
for (const [code, cities] of Object.entries(LIST)) for (const c of cities) if (!CITY.has(c)) CITY.set(c, code);

const clean = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ß/g, 'ss').replace(/\s+/g, ' ').trim();

/** "Berlin" → DE, "Munich (Hybrid)" → DE, "Cambridge, MA" → US. Null when unknown. */
export function countryFromCity(location: string | null | undefined): string | null {
  if (!location) return null;
  const full = clean(location.replace(/\(.*?\)/g, ''));
  if (CITY.has(full)) return CITY.get(full)!;
  const first = full.split(/[,/|•·;–—-]/)[0].trim();
  return CITY.get(first) ?? null;
}
