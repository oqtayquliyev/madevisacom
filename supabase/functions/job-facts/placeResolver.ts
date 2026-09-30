// Identical copy of src/lib/placeResolver.ts for the Deno edge function — keep the two in sync.
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
//      decided by evidence, strongest first:
//        a. the city is a known city of that state — also after dropping
//           "North / South / East / West / New / Fort / Mount / Lake…"
//           ("North Chicago, IL" → Illinois, "East Peoria, IL", "Fort
//           Wayne, IN") — or a known US city anywhere;
//        b. the city is a known city of the country ("Tel Aviv, IL");
//        c. a hint from the caller (the company's other jobs are in the US);
//        d. the city's spelling: accents / "Kfar…", "Kiryat…" / "…pur",
//           "…abad" / "…hausen", "…dorf" point to the country; "…ville",
//           "…ton", "…field", "Springs", "Heights" point to the US;
//        e. the more common reading for that code (DEFAULT_READING).
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
  ID: set(['Boise', 'Meridian', 'Nampa', 'Idaho Falls', 'Pocatello', 'Coeur dAlene', 'Twin Falls', 'Caldwell', 'Post Falls', 'Lewiston', 'Rexburg', 'Eagle', 'Kuna', 'Moscow', 'Ammon', 'Chubbuck', 'Hayden', 'Mountain Home', 'Blackfoot', 'Garden City', 'Jerome', 'Burley', 'Sandpoint', 'Ketchum', 'Sun Valley', 'Hailey', 'Emmett', 'Rathdrum', 'Star']),
  IL: set(['Chicago', 'Naperville', 'Aurora', 'Evanston', 'Schaumburg', 'Springfield', 'Peoria', 'Rockford', 'Deerfield', 'Northbrook', 'Oak Brook', 'Champaign', 'Downers Grove', 'Lake Forest', 'Rosemont', 'Joliet', 'Elgin', 'Waukegan', 'Cicero', 'Arlington Heights', 'Bolingbrook', 'Palatine', 'Skokie', 'Des Plaines', 'Orland Park', 'Tinley Park', 'Oak Lawn', 'Berwyn', 'Mount Prospect', 'Wheaton', 'Hoffman Estates', 'Oak Park', 'Glenview', 'Lombard', 'Elmhurst', 'Buffalo Grove', 'Bloomington', 'Normal', 'Urbana', 'Decatur', 'Carbondale', 'Moline', 'Rock Island', 'Quincy', 'Danville', 'Kankakee', 'Libertyville', 'Lincolnshire', 'Vernon Hills', 'Itasca', 'Oakbrook Terrace', 'Warrenville', 'Lisle', 'Bannockburn', 'Mettawa', 'Abbott Park', 'Round Lake', 'Gurnee', 'Mundelein', 'Northfield', 'Glenview', 'Park Ridge', 'Niles', 'Elk Grove Village', 'Wood Dale', 'Addison', 'Carol Stream', 'Batavia', 'Geneva', 'St Charles', 'Saint Charles', 'Plainfield', 'Romeoville', 'Lemont', 'Westchester', 'Hinsdale', 'Burr Ridge', 'Oak Forest', 'Harvey', 'Alsip', 'Bedford Park', 'Franklin Park', 'Melrose Park', 'Rolling Meadows', 'Barrington', 'Crystal Lake', 'McHenry', 'Woodstock', 'DeKalb', 'Sycamore', 'Ottawa', 'LaSalle', 'Galesburg', 'Macomb', 'Effingham', 'Mattoon', 'Charleston', 'Belleville', 'Edwardsville', 'Collinsville', "O'Fallon", 'Alton', 'Granite City', 'Marion', 'Mount Vernon', 'Centralia']),
  IN: set(['Indianapolis', 'Fort Wayne', 'Evansville', 'South Bend', 'Carmel', 'Bloomington', 'Fishers', 'West Lafayette', 'Lafayette', 'Hammond', 'Gary', 'Muncie', 'Terre Haute', 'Kokomo', 'Anderson', 'Noblesville', 'Greenwood', 'Elkhart', 'Mishawaka', 'Lawrence', 'Jeffersonville', 'Columbus', 'Westfield', 'Zionsville', 'Plainfield', 'Merrillville', 'Valparaiso', 'Richmond', 'Warsaw', 'Goshen', 'Crown Point', 'Brownsburg', 'Avon', 'Franklin', 'Seymour', 'Jasper', 'New Albany', 'Clarksville', 'Portage', 'Michigan City', 'La Porte', 'Marion', 'Logansport', 'Vincennes', 'Batesville', 'Shelbyville', 'Greensburg', 'Whiting', 'East Chicago', 'Munster', 'Schererville', 'Highland', 'Plymouth', 'Auburn', 'Angola', 'Huntington', 'Wabash', 'Peru', 'Frankfort', 'Lebanon', 'Crawfordsville', 'Martinsville', 'Bedford', 'Madison', 'New Castle', 'Connersville', 'Rushville', 'Decatur', 'Bluffton', 'Portland', 'Princeton', 'Tell City', 'Washington']),
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
  CO: set(['Bogota', 'Medellin', 'Cali', 'Barranquilla', 'Cartagena', 'Bucaramanga', 'Pereira', 'Santa Marta', 'Manizales', 'Cucuta', 'Ibague', 'Villavicencio', 'Pasto', 'Neiva', 'Monteria', 'Envigado', 'Itagui', 'Sabaneta', 'Rionegro', 'Chia', 'Zipaquira', 'Soacha', 'Bello', 'Tunja', 'Popayan', 'Valledupar', 'Sincelejo', 'Armenia']),
  DE: set(['Berlin', 'Munich', 'Munchen', 'Hamburg', 'Frankfurt', 'Frankfurt am Main', 'Cologne', 'Koln', 'Stuttgart', 'Dusseldorf', 'Leipzig', 'Dresden', 'Hannover', 'Nuremberg', 'Nurnberg', 'Bremen', 'Essen', 'Dortmund', 'Bonn', 'Mannheim', 'Karlsruhe', 'Osnabruck', 'Heidelberg', 'Walldorf', 'Wolfsburg', 'Ingolstadt', 'Darmstadt', 'Aachen', 'Munster', 'Augsburg', 'Freiburg', 'Kiel', 'Potsdam', 'Erlangen', 'Regensburg']),
  GA: set(['Libreville', 'Port-Gentil', 'Franceville']),
  ID: set(['Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Denpasar', 'Bali', 'Yogyakarta', 'Semarang', 'Tangerang', 'Bekasi', 'Batam', 'South Jakarta', 'Jakarta Selatan', 'Jakarta Pusat', 'Central Jakarta', 'Makassar', 'Palembang', 'Depok', 'Bogor', 'Malang', 'Balikpapan', 'Pekanbaru', 'Cikarang', 'Karawang', 'Tangerang Selatan', 'South Tangerang', 'Solo', 'Surakarta', 'Manado', 'Padang', 'Samarinda', 'Pontianak', 'Banjarmasin', 'Cirebon', 'Serang', 'Cilegon']),
  IL: set(['Tel Aviv', 'Tel Aviv-Yafo', 'Tel Aviv Yafo', 'Jerusalem', 'Haifa', 'Herzliya', 'Herzliya Pituach', 'Petah Tikva', 'Petach Tikva', 'Petah Tiqva', 'Raanana', 'Netanya', 'Beer Sheva', 'Beersheba', 'Beer-Sheva', 'Rehovot', 'Ramat Gan', 'Yokneam', 'Yokneam Illit', 'Kfar Saba', 'Hod Hasharon', 'Rosh HaAyin', 'Rosh Haayin', 'Modiin', 'Modiin-Maccabim-Reut', 'Caesarea', 'Airport City', 'Or Yehuda', 'Bnei Brak', 'Holon', 'Bat Yam', 'Ashdod', 'Ashkelon', 'Eilat', 'Nazareth', 'Rishon LeZion', 'Rishon Lezion', 'Lod', 'Ramla', 'Yavne', 'Kiryat Gat', 'Kiryat Shmona', 'Karmiel', 'Afula', 'Hadera', 'Tiberias', 'Dimona', 'Sderot', 'Nes Ziona', 'Ness Ziona', 'Givatayim', 'Beit Shemesh', 'Migdal HaEmek', 'Nahariya', 'Akko', 'Acre', 'Kiryat Ono', 'Yehud', 'Shoham', 'Kfar Yona', 'Even Yehuda', 'Kadima', 'Petah Tiqwa', 'Matam', 'Omer', 'Rosh Pina', 'Katzrin', 'Umm al-Fahm', 'Tira', 'Taibe', 'Sakhnin', 'Arad', 'Mitzpe Ramon', 'Zichron Yaakov', 'Pardes Hanna', 'Binyamina', 'Kiryat Bialik', 'Kiryat Motzkin', 'Kiryat Ata', 'Tirat Carmel', 'Nesher', 'Yokneam Ilit', 'Ma alot', 'Maalot-Tarshiha', 'Tel Mond', 'Ramat Hasharon', 'Ramat HaSharon', 'Savyon', 'Ganei Tikva', 'Elad', 'Beitar Illit', 'Maale Adumim']),
  IN: set(['Bangalore', 'Bengaluru', 'Mumbai', 'Delhi', 'New Delhi', 'Hyderabad', 'Chennai', 'Pune', 'Kolkata', 'Noida', 'Gurgaon', 'Gurugram', 'Ahmedabad', 'Jaipur', 'Kochi', 'Coimbatore', 'Chandigarh', 'Indore', 'Thiruvananthapuram', 'Mysore', 'Vadodara', 'Nagpur', 'Bhubaneswar', 'Greater Noida', 'Navi Mumbai', 'Thane', 'Lucknow', 'Kanpur', 'Surat', 'Visakhapatnam', 'Vizag', 'Mangalore', 'Mangaluru', 'Trivandrum', 'Cochin', 'Madurai', 'Tiruchirappalli', 'Trichy', 'Vijayawada', 'Guntur', 'Nashik', 'Aurangabad', 'Rajkot', 'Bhopal', 'Patna', 'Ranchi', 'Raipur', 'Dehradun', 'Guwahati', 'Goa', 'Panaji', 'Mohali', 'Ludhiana', 'Amritsar', 'Jalandhar', 'Faridabad', 'Ghaziabad', 'Sonipat', 'Manesar', 'Hosur', 'Pondicherry', 'Puducherry', 'Kozhikode', 'Calicut', 'Thrissur', 'Hubli', 'Belgaum', 'Belagavi', 'Varanasi', 'Agra', 'Meerut', 'Allahabad', 'Prayagraj', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer', 'Gandhinagar', 'Anand', 'Vapi', 'Bharuch', 'Jamshedpur', 'Dhanbad', 'Cuttack', 'Siliguri', 'Durgapur', 'Howrah', 'Salem', 'Erode', 'Tiruppur', 'Vellore', 'Chengalpattu', 'Sriperumbudur', 'Kolhapur', 'Solapur', 'Pimpri-Chinchwad', 'Pimpri Chinchwad', 'Sangli', 'Jammu', 'Srinagar', 'Shimla']),
  KY: set(['George Town', 'Grand Cayman']),
  LA: set(['Vientiane', 'Luang Prabang']),
  MA: set(['Casablanca', 'Rabat', 'Marrakech', 'Marrakesh', 'Tangier', 'Tanger', 'Fes', 'Fez', 'Agadir', 'Meknes', 'Oujda', 'Kenitra', 'Tetouan', 'Safi', 'Mohammedia', 'El Jadida', 'Nador', 'Beni Mellal', 'Laayoune', 'Temara', 'Sale', 'Ouarzazate', 'Essaouira', 'Dakhla', 'Berrechid', 'Settat', 'Khouribga']),
  MD: set(['Chisinau', 'Balti']),
  ME: set(['Podgorica', 'Budva', 'Bar', 'Niksic', 'Herceg Novi', 'Kotor', 'Tivat', 'Cetinje', 'Ulcinj', 'Bijelo Polje', 'Pljevlja']),
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

/**
 * For an ambiguous code with an unknown city and no other clue, which
 * reading is more common in job listings. Career sites write "City, IL" /
 * "City, MA" / "City, CO" / "City, ME" almost always for Illinois,
 * Massachusetts, Colorado and Maine — Israeli, Moroccan, Colombian and
 * Montenegrin jobs name the country ("Tel Aviv, Israel") and their big
 * cities are listed above anyway.
 */
const DEFAULT_READING: Record<string, 'region' | 'country'> = {
  DE: 'country', IN: 'country', ID: 'country', AR: 'country', NL: 'country', SK: 'country', PE: 'country',
  SA: 'country', MT: 'country',
  IL: 'region', MA: 'region', CO: 'region', ME: 'region',
};

/** Every well-known US city, whatever the state ("Aurora" is in IL and CO). */
const ALL_US_CITIES = new Set<string>([
  ...Object.values(US_CITIES).flatMap((s) => [...s]),
  ...set([
    'New York', 'Brooklyn', 'Queens', 'Manhattan', 'Bronx', 'Staten Island', 'Houston', 'Dallas', 'Austin', 'San Antonio', 'Fort Worth', 'Plano', 'Irving', 'Frisco',
    'Philadelphia', 'Detroit', 'Ann Arbor', 'Grand Rapids', 'Milwaukee', 'Madison', 'Cleveland', 'Cincinnati', 'Columbus', 'Dayton', 'Toledo', 'Akron',
    'Las Vegas', 'Reno', 'Henderson', 'Salt Lake City', 'Provo', 'Lehi', 'Albuquerque', 'Santa Fe', 'Oklahoma City', 'Tulsa', 'Wichita', 'Overland Park',
    'Des Moines', 'Cedar Rapids', 'Portland', 'Eugene', 'Salem', 'Beaverton', 'Hillsboro', 'Anchorage', 'Honolulu', 'Miami', 'Orlando', 'Tampa', 'Jacksonville',
    'Fort Lauderdale', 'Boca Raton', 'St Petersburg', 'Tallahassee', 'West Palm Beach', 'Newark', 'Jersey City', 'Princeton', 'Hoboken', 'Parsippany',
    'Hartford', 'Stamford', 'New Haven', 'Providence', 'Burlington', 'Manchester', 'Nashua', 'Buffalo', 'Rochester', 'Albany', 'Syracuse', 'White Plains',
    'Washington', 'Baltimore', 'Pittsburgh', 'Omaha', 'Charleston', 'Little Rock', 'Birmingham', 'Memphis', 'Louisville', 'Kansas City', 'St Louis',
  ]),
]);

/** "North Chicago" → "chicago", "Fort Wayne" stays (its own name), "East Peoria" → "peoria". */
const US_PREFIX = /^(?:north|south|east|west|new|old|upper|lower|greater|port|fort|ft|mount|mt|lake|saint|st|la|el|palm|glen|oak|spring|university|village of|city of|town of)\s+/;
const withoutPrefix = (c: string) => c.replace(US_PREFIX, '');

/** Spellings typical of US place names. */
const US_SPELLING = /(?:ville|ton|town|burg|boro|borough|field|wood|woods|ford|dale|port|view|side|creek|springs|heights|falls|park|beach|hills|grove|harbor|harbour|valley|village|township|junction|lake|lakes|ridge|point|crossing|station|county|city|center|mills|bluffs|meadows|estates|plains|gardens|shores|bay)$/;
/** Spellings that point to the country behind an ambiguous code. */
const COUNTRY_SPELLING: Record<string, RegExp> = {
  IL: /^(?:kfar|kiryat|qiryat|ramat|givat|beit|bet|rosh|ramot|neve|nes|maalot|mitzpe|ein|hod|bnei|migdal|or|kafr|umm|tel|petah|petach|rishon|moshav|kibbutz|mevaseret|zichron|zikhron|yokneam|modiin|maale|nahal|gan|ganei|kochav|kokhav)\b|(?:iya|iyya|ya'?akov|ziona|yam)$/,
  IN: /(?:pur|puram|abad|nagar|garh|palli|palle|halli|gaon|ganj|patnam|kottai|giri|wadi|vadi|pet|cheri|chery|uru|ooru|bagh|dhanbad|khand)$/,
  DE: /(?:stadt|hausen|heim|dorf|berg|bach|furt|ingen|brueck|bruck|brucken|hagen|leben|rode|stedt|born|weiler|kirchen|munster|witz|itz|ow|feld|feldern|haven|am main)$|^(?:bad|sankt|st)\s/,
  ID: /^(?:kota|kabupaten|kab|jakarta|tangerang|bekasi|bogor)\b/,
  MA: /^(?:ain|ait|beni|sidi|bni|oulad|el|al)\s/,
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

/** Extra context: e.g. the country most of the same company's jobs are in. */
export type PlaceHint = { prefer?: string | null };
export type PlaceResolver = ((raw: string | null | undefined, hint?: PlaceHint) => PlaceCountry | null) & {
  /** Same as calling it, plus whether the answer was only a best guess (an ambiguous code with an unknown city). */
  detail: (raw: string | null | undefined, hint?: PlaceHint) => { country: PlaceCountry | null; guessed: boolean };
};

export function createPlaceResolver(countries: PlaceCountry[]): PlaceResolver {
  const byCode = new Map(countries.map((c) => [c.code.toUpperCase(), c]));
  const byName = new Map(countries.map((c) => [norm(c.name), c]));
  const get = (code: string) => byCode.get(code) ?? null;
  // Longest names first so "Papua New Guinea" beats "Guinea".
  const namesByLength = [...byName.entries()].filter(([n]) => n.length > 3).sort((a, b) => b[0].length - a[0].length);
  const regionNames = [...US_STATE_BY_NAME.keys(), ...CA_PROVINCE_BY_NAME.keys(), ...AU_STATE_BY_NAME.keys()].sort((a, b) => b.length - a.length);

  // Set while one lookup runs: true when an ambiguous code was decided
  // without real evidence (only spelling / default reading).
  let guessed = false;
  let hint: PlaceHint | undefined;

  /** A two-letter code next to a city: region or country? */
  const readCode = (code: string, city: string | null): PlaceCountry | null => {
    const c = norm(city ?? '');
    const iso = get(code);
    const isUS = code in US_STATES;
    const isCA = code in CA_PROVINCES;
    const isAU = code in AU_STATES;
    if (!isUS && !isCA && !isAU) return iso;
    const region = () => get(isUS ? 'US' : isCA ? 'CA' : 'AU');
    if (!iso) return region(); // e.g. TX, ON, NSW — not country codes at all
    // a. / b. The city tells us directly (also "North Chicago" → Chicago).
    if (c) {
      const bare = withoutPrefix(c);
      if (isAU && (AU_CITIES.has(c) || AU_CITIES.has(bare))) return get('AU');
      if (isUS && (US_CITIES[code]?.has(c) || US_CITIES[code]?.has(bare))) return get('US');
      if (COUNTRY_CITIES[code]?.has(c)) return iso;
      if (isCA && COUNTRY_CITIES.CA.has(c)) return get('CA');
      if (isUS && (ALL_US_CITIES.has(c) || ALL_US_CITIES.has(bare))) return get('US');
    }
    guessed = true;
    // c. What the caller knows (e.g. the company's other jobs).
    const prefer = hint?.prefer?.toUpperCase();
    if (prefer === code) return iso;
    if (prefer && ((isUS && prefer === 'US') || (isCA && prefer === 'CA') || (isAU && prefer === 'AU'))) return region();
    // d. How the city is spelled.
    if (c) {
      const raw = (city ?? '').trim();
      // Letters US place names don't use (ü, é, ñ, ç…) → the country.
      if (/[\u00c0-\u024f\u1e00-\u1eff]/.test(raw.normalize('NFC'))) return iso;
      if (COUNTRY_SPELLING[code]?.test(c)) return iso;
      if (isUS && (US_SPELLING.test(c) || US_PREFIX.test(c))) return get('US');
    }
    // e. The more common reading.
    if (DEFAULT_READING[code] === 'country') return iso;
    return region();
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

  const resolveOnce = (raw: string | null | undefined): PlaceCountry | null => {
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

  const detail = (raw: string | null | undefined, h?: PlaceHint) => {
    guessed = false;
    hint = h;
    const country = resolveOnce(raw);
    const out = { country, guessed: Boolean(country) && guessed };
    guessed = false;
    hint = undefined;
    return out;
  };
  const resolver = ((raw: string | null | undefined, h?: PlaceHint) => detail(raw, h).country) as PlaceResolver;
  resolver.detail = detail;
  return resolver;
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
  const bare = withoutPrefix(c);
  if (code === 'GE') return US_CITIES.GA?.has(c) || US_CITIES.GA?.has(bare) ? 'US' : null;
  if (COUNTRY_CITIES[code]?.has(c)) return null; // a real city of that country
  if (code in AU_STATES && (AU_CITIES.has(c) || AU_CITIES.has(bare))) return 'AU';
  if (code in US_STATES && (US_CITIES[code]?.has(c) || US_CITIES[code]?.has(bare) || ALL_US_CITIES.has(c) || ALL_US_CITIES.has(bare))) return 'US';
  if (code in CA_PROVINCES && COUNTRY_CITIES.CA.has(c)) return 'CA';
  return null;
}

/**
 * Re-checks a country already saved on a job. Returns the ISO code it
 * should be, or null when the saved one is fine / nothing better is known.
 *   - `texts`: other location text for the job (the posting's own location
 *     line, its office list, "US - …" titles). One clear answer that differs
 *     from the saved country wins.
 *   - Otherwise, for a code that is also a US state / CA province / AU state
 *     (IL, IN, DE, AZ, CA, GE…), "<city>, <code>" is read again with the
 *     current rules ("North Chicago" + IL → US; "Tel Aviv" + IL stays).
 */
export function recheckSavedCountry(
  resolve: PlaceResolver,
  storedIso: string,
  city: string | null | undefined,
  texts: (string | null | undefined)[],
  hint?: PlaceHint,
): string | null {
  const stored = storedIso.toUpperCase();
  const votes = new Set<string>();
  for (const t of texts) {
    const hit = t ? resolve(t, hint) : null;
    if (hit) votes.add(hit.code);
  }
  if (votes.size === 1 && !votes.has(stored)) return [...votes][0];
  if (votes.size >= 1) return null; // the job's own text confirms it, or several countries
  if (!isAmbiguousRegionCode(stored)) return null;
  const known = knownRegionCity(stored, city);
  if (known && known !== stored) return known;
  const c = (city ?? '').trim();
  if (!c || stored === 'GE') return null;
  const again = resolve(`${c}, ${stored}`, hint);
  return again && again.code !== stored ? again.code : null;
}
