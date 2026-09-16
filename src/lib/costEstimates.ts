/**
 * Lightweight, transparent cost estimator — NOT live pricing. It gives
 * visitors a rough "what should I budget" number instantly, with no API
 * key or cost. Every number here is a static, documented estimate you
 * should tune with real data over time (or eventually replace the
 * flight portion with the Aviasales Data API — see OPPORTUNITIES.md).
 *
 * The model: origin and destination are each tagged with a broad
 * "region". A region-pair lookup gives a rough flight price band
 * (same-region trips are assumed short/cheap, opposite-side-of-the-
 * world trips are assumed long/expensive). Destination-specific data
 * covers accommodation and visa fees, since those don't depend on
 * where the traveler is coming from.
 */

export type Region =
  | 'caucasus'
  | 'middle-east'
  | 'western-europe'
  | 'eastern-europe'
  | 'north-america'
  | 'south-america'
  | 'sub-saharan-africa'
  | 'north-africa'
  | 'south-asia'
  | 'east-asia'
  | 'southeast-asia'
  | 'oceania'
  | 'other';

// Curated mapping for the countries most likely to show up as an
// origin (nationalities) or destination on this site. Extend freely —
// anything not listed falls back to 'other', which still produces a
// (wider, clearly-labeled) estimate rather than failing.
export const regionByCountryCode: Record<string, Region> = {
  AZ: 'caucasus', GE: 'caucasus', AM: 'caucasus',
  TR: 'middle-east', AE: 'middle-east', QA: 'middle-east', SA: 'middle-east', IL: 'middle-east', JO: 'middle-east', KW: 'middle-east', BH: 'middle-east', OM: 'middle-east',
  GB: 'western-europe', FR: 'western-europe', DE: 'western-europe', ES: 'western-europe', IT: 'western-europe', NL: 'western-europe', CH: 'western-europe', AT: 'western-europe', IE: 'western-europe', BE: 'western-europe', PT: 'western-europe', SE: 'western-europe', DK: 'western-europe', NO: 'western-europe', FI: 'western-europe',
  PL: 'eastern-europe', RO: 'eastern-europe', CZ: 'eastern-europe', HU: 'eastern-europe', RU: 'eastern-europe', UA: 'eastern-europe', GR: 'eastern-europe', BG: 'eastern-europe', MD: 'eastern-europe',
  US: 'north-america', CA: 'north-america', MX: 'north-america',
  BR: 'south-america', AR: 'south-america', CL: 'south-america', CO: 'south-america', PE: 'south-america',
  NG: 'sub-saharan-africa', ZA: 'sub-saharan-africa', KE: 'sub-saharan-africa', GH: 'sub-saharan-africa', ET: 'sub-saharan-africa',
  EG: 'north-africa', MA: 'north-africa', TN: 'north-africa', DZ: 'north-africa',
  IN: 'south-asia', PK: 'south-asia', BD: 'south-asia', LK: 'south-asia', NP: 'south-asia',
  CN: 'east-asia', JP: 'east-asia', KR: 'east-asia', TW: 'east-asia', HK: 'east-asia',
  TH: 'southeast-asia', VN: 'southeast-asia', PH: 'southeast-asia', ID: 'southeast-asia', MY: 'southeast-asia', SG: 'southeast-asia',
  AU: 'oceania', NZ: 'oceania',
};

export function regionFor(countryCode: string | null): Region {
  if (!countryCode) return 'other';
  return regionByCountryCode[countryCode.toUpperCase()] ?? 'other';
}

// Rough one-way-trip flight price bands in USD, keyed by
// "regionA|regionB" (order-independent — see estimateFlightRangeUSD).
// These are deliberately wide ranges, not point estimates.
const FLIGHT_BANDS: Record<string, [number, number]> = {
  // Same region
  same: [60, 220],
  // Caucasus / Middle East / Eastern Europe are all "regional" from Baku
  'caucasus|middle-east': [90, 260],
  'caucasus|eastern-europe': [110, 300],
  'caucasus|western-europe': [180, 450],
  'caucasus|south-asia': [200, 480],
  'caucasus|east-asia': [400, 900],
  'caucasus|north-america': [550, 1300],
  'caucasus|oceania': [700, 1600],
  'middle-east|western-europe': [150, 400],
  'middle-east|eastern-europe': [140, 380],
  'middle-east|south-asia': [150, 380],
  'middle-east|east-asia': [350, 800],
  'middle-east|north-america': [500, 1200],
  'middle-east|oceania': [650, 1500],
  'western-europe|eastern-europe': [60, 220],
  'western-europe|north-america': [280, 750],
  'western-europe|south-asia': [350, 750],
  'western-europe|east-asia': [450, 950],
  'western-europe|southeast-asia': [450, 1000],
  'western-europe|oceania': [600, 1400],
  'western-europe|sub-saharan-africa': [300, 700],
  'western-europe|north-africa': [120, 350],
  'north-america|south-america': [250, 650],
  'north-america|east-asia': [500, 1100],
  'north-america|oceania': [700, 1600],
  'east-asia|southeast-asia': [100, 350],
  'east-asia|oceania': [350, 800],
};

/**
 * Returns a rough [min, max] one-way flight price in USD for a
 * region-pair. Falls back to a wide generic band for combinations we
 * haven't curated explicitly.
 */
export function estimateFlightRangeUSD(origin: Region, destination: Region): [number, number] {
  if (origin === destination) return FLIGHT_BANDS.same;

  const key = [origin, destination].sort().join('|');
  return FLIGHT_BANDS[key] ?? [300, 900];
}

export type DestinationCost = {
  countryCode: string;
  countryName: string;
  region: Region;
  /** Typical tourist/short-stay visa fee, USD */
  visaFeeUSD: number;
  /** Average accommodation cost per night, USD (mid-range) */
  accommodationPerNightUSD: number;
  /** Typical program/course/relocation-service average cost, USD */
  programAverageUSD: number;
  /** Typical work permit / work visa fee, USD */
  workPermitFeeUSD: number;
};

// Covers the destinations already featured elsewhere on the site.
// Visa/work-permit fees and program averages are rough published-fee
// estimates; always confirm current figures with the relevant
// embassy/consulate or institution.
export const destinationCosts: DestinationCost[] = [
  { countryCode: 'IT', countryName: 'Italy', region: 'western-europe', visaFeeUSD: 90, accommodationPerNightUSD: 110, programAverageUSD: 6500, workPermitFeeUSD: 130 },
  { countryCode: 'FR', countryName: 'France', region: 'western-europe', visaFeeUSD: 90, accommodationPerNightUSD: 130, programAverageUSD: 7000, workPermitFeeUSD: 270 },
  { countryCode: 'DE', countryName: 'Germany', region: 'western-europe', visaFeeUSD: 90, accommodationPerNightUSD: 105, programAverageUSD: 5500, workPermitFeeUSD: 110 },
  { countryCode: 'ES', countryName: 'Spain', region: 'western-europe', visaFeeUSD: 90, accommodationPerNightUSD: 95, programAverageUSD: 6000, workPermitFeeUSD: 100 },
  { countryCode: 'GB', countryName: 'United Kingdom', region: 'western-europe', visaFeeUSD: 145, accommodationPerNightUSD: 140, programAverageUSD: 14000, workPermitFeeUSD: 900 },
  { countryCode: 'AE', countryName: 'United Arab Emirates', region: 'middle-east', visaFeeUSD: 90, accommodationPerNightUSD: 120, programAverageUSD: 8500, workPermitFeeUSD: 450 },
  { countryCode: 'US', countryName: 'United States', region: 'north-america', visaFeeUSD: 185, accommodationPerNightUSD: 160, programAverageUSD: 22000, workPermitFeeUSD: 460 },
  { countryCode: 'CA', countryName: 'Canada', region: 'north-america', visaFeeUSD: 100, accommodationPerNightUSD: 135, programAverageUSD: 15000, workPermitFeeUSD: 155 },
  { countryCode: 'TR', countryName: 'Turkey', region: 'middle-east', visaFeeUSD: 60, accommodationPerNightUSD: 65, programAverageUSD: 3500, workPermitFeeUSD: 90 },
  { countryCode: 'CH', countryName: 'Switzerland', region: 'western-europe', visaFeeUSD: 90, accommodationPerNightUSD: 175, programAverageUSD: 9000, workPermitFeeUSD: 210 },
  { countryCode: 'AU', countryName: 'Australia', region: 'oceania', visaFeeUSD: 100, accommodationPerNightUSD: 130, programAverageUSD: 17000, workPermitFeeUSD: 1050 },
  { countryCode: 'NL', countryName: 'Netherlands', region: 'western-europe', visaFeeUSD: 90, accommodationPerNightUSD: 120, programAverageUSD: 9500, workPermitFeeUSD: 380 },
  { countryCode: 'IE', countryName: 'Ireland', region: 'western-europe', visaFeeUSD: 70, accommodationPerNightUSD: 125, programAverageUSD: 11000, workPermitFeeUSD: 1160 },
  { countryCode: 'NZ', countryName: 'New Zealand', region: 'oceania', visaFeeUSD: 130, accommodationPerNightUSD: 110, programAverageUSD: 16000, workPermitFeeUSD: 340 },
];

export type TripEstimate = {
  flightLowUSD: number;
  flightHighUSD: number;
  accommodationTotalUSD: number;
  visaFeeUSD: number;
  totalLowUSD: number;
  totalHighUSD: number;
};

/**
 * Looks up curated destination data by country code, falling back to a
 * generic region-based estimate for destinations we haven't curated
 * yet (so the UI always has something reasonable to show).
 */
export function destinationCostFor(countryCode: string, countryName: string): DestinationCost {
  const found = destinationCosts.find((d) => d.countryCode === countryCode.toUpperCase());
  if (found) return found;

  return {
    countryCode: countryCode.toUpperCase(),
    countryName,
    region: regionFor(countryCode),
    visaFeeUSD: 100,
    accommodationPerNightUSD: 110,
    programAverageUSD: 8000,
    workPermitFeeUSD: 300,
  };
}

export type JourneyCostBreakdown = {
  flightLowUSD: number;
  flightHighUSD: number;
  programAverageUSD: number;
  visaFeeUSD: number;
  workPermitFeeUSD: number;
  includeWorkPermit: boolean;
  includeProgram: boolean;
  totalLowUSD: number;
  totalHighUSD: number;
};

/**
 * Quick "what will this journey cost" estimate for the homepage journey
 * card: a flight range plus the line items relevant to the selected
 * journey type (work adds a work-permit fee, study/programs/business
 * add a program-average line; visa fee always applies).
 */
export function estimateJourneyCostBreakdown({
  originCountryCode,
  destinationCountryCode,
  destinationCountryName,
  journey,
}: {
  originCountryCode: string | null;
  destinationCountryCode: string;
  destinationCountryName: string;
  journey: 'work' | 'study' | 'programs' | 'business' | 'family' | 'relocation';
}): JourneyCostBreakdown {
  const destination = destinationCostFor(destinationCountryCode, destinationCountryName);
  const originRegion = regionFor(originCountryCode);
  const [flightLow, flightHigh] = estimateFlightRangeUSD(originRegion, destination.region);

  const includeWorkPermit = journey === 'work' || journey === 'business' || journey === 'relocation';
  const includeProgram = journey === 'study' || journey === 'programs';

  const workPermitFeeUSD = includeWorkPermit ? destination.workPermitFeeUSD : 0;
  const programAverageUSD = includeProgram ? destination.programAverageUSD : 0;

  return {
    flightLowUSD: flightLow,
    flightHighUSD: flightHigh,
    programAverageUSD,
    visaFeeUSD: destination.visaFeeUSD,
    workPermitFeeUSD,
    includeWorkPermit,
    includeProgram,
    totalLowUSD: flightLow + programAverageUSD + destination.visaFeeUSD + workPermitFeeUSD,
    totalHighUSD: flightHigh + programAverageUSD + destination.visaFeeUSD + workPermitFeeUSD,
  };
}

/**
 * Combines flight range + accommodation (per night × nights) + visa fee
 * into one estimate. This is the single function the UI calls.
 */
export function estimateTripCost({
  originCountryCode,
  destination,
  nights,
  travelers,
}: {
  originCountryCode: string | null;
  destination: DestinationCost;
  nights: number;
  travelers: number;
}): TripEstimate {
  const originRegion = regionFor(originCountryCode);
  const [flightLow, flightHigh] = estimateFlightRangeUSD(originRegion, destination.region);

  const accommodationTotalUSD = destination.accommodationPerNightUSD * nights;
  const visaFeeUSD = destination.visaFeeUSD * travelers;
  const flightTotalLow = flightLow * travelers;
  const flightTotalHigh = flightHigh * travelers;

  return {
    flightLowUSD: flightTotalLow,
    flightHighUSD: flightTotalHigh,
    accommodationTotalUSD,
    visaFeeUSD,
    totalLowUSD: flightTotalLow + accommodationTotalUSD + visaFeeUSD,
    totalHighUSD: flightTotalHigh + accommodationTotalUSD + visaFeeUSD,
  };
}
