// Who needs a work permit where — MadeVisa's rough rule table.
//
// HOW IT WORKS
// Rules are checked top to bottom; the FIRST rule whose passport and
// destination groups both match decides. Groups can be:
//   'any'                 every country
//   'bloc:eu' …           a free-movement bloc (see BLOCS)
//   'region:asia' …       a world region (see REGIONS)
//   'country:DE'          one country (ISO code)
//
// TO FIX A MISTAKE
// Add a more specific rule ABOVE the general one it corrects, e.g.
//   { id: 'nz-uk-youth', passport: ['country:NZ'], dest: ['country:GB'],
//     result: { permit: true, route: 'Youth Mobility Scheme visa', note: '…' },
//     applies: 'New Zealand passports → UK' },
// and bump RULES_REVIEWED. Visa guides (src/data/visa) still decide the
// exact route name for countries that have a guide; these rules decide
// WHETHER a permit is needed, and the route for countries without a guide.
//
// This is general guidance, not legal advice — the job card links to the
// official rules and to "Report a mistake".

export const RULES_REVIEWED = 'September 2026';

export type Bloc = 'eu' | 'eea_ch' | 'cta' | 'anzac' | 'gcc' | 'mercosur';
export type Region = 'europe' | 'middle_east' | 'asia' | 'africa' | 'north_america' | 'latin_america' | 'oceania';
export type Group = 'any' | `bloc:${Bloc}` | `region:${Region}` | `country:${string}`;

const list = (s: string) => s.trim().split(/\s+/);

const EU = list('AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE');

export const BLOCS: Record<Bloc, { name: string; members: string[] }> = {
  eu: { name: 'the EU', members: EU },
  // EU + EEA + Switzerland: free movement for work between all of these.
  eea_ch: { name: 'the EU/EEA and Switzerland', members: [...EU, ...list('IS LI NO CH')] },
  // Common Travel Area: British and Irish citizens live and work in each other's country.
  cta: { name: 'the UK and Ireland', members: list('GB IE') },
  // Trans-Tasman: Australians and New Zealanders can live and work in each other's country.
  anzac: { name: 'Australia and New Zealand', members: list('AU NZ') },
  // Gulf Cooperation Council citizens can work across member states.
  gcc: { name: 'the Gulf states (GCC)', members: list('AE SA QA KW BH OM') },
  // Mercosur Residence Agreement: a simplified residence permit with work rights.
  mercosur: { name: 'Mercosur countries', members: list('AR BR PY UY BO CL CO EC PE') },
};

export const REGIONS: Record<Region, { name: string; members: string[] }> = {
  europe: { name: 'Europe', members: [...EU, ...list('IS LI NO CH GB AL AD BY BA XK MD MC ME MK RU SM RS UA VA GI FO GG JE IM AX SJ')] },
  middle_east: { name: 'the Middle East', members: list('AE SA QA KW BH OM YE IQ IR JO LB SY IL PS TR') },
  asia: { name: 'Asia', members: list('AF AM AZ BD BT BN KH CN GE HK IN ID JP KZ KG LA MO MY MV MN MM NP KP KR PK PH SG LK TW TJ TH TL TM UZ VN') },
  africa: {
    name: 'Africa',
    members: list(
      'DZ AO BJ BW BF BI CV CM CF TD KM CD CG CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU YT MA MZ NA NE NG RE RW SH ST SN SC SL SO ZA SS SD TZ TG TN UG EH ZM ZW'
    ),
  },
  north_america: { name: 'North America', members: list('US CA BM GL PM') },
  latin_america: {
    name: 'Latin America and the Caribbean',
    members: list('MX GT BZ SV HN NI CR PA CU DO HT JM BS BB TT AG DM GD KN LC VC AW CW SX BQ KY TC VG VI PR AI MS GP MQ BL MF AR BO BR CL CO EC GY PY PE SR UY VE FK GF'),
  },
  oceania: { name: 'Oceania', members: list('AU NZ FJ PG SB VU NC PF WS TO KI TV NR PW FM MH CK NU TK AS GU MP WF NF PN') },
};

export type RuleResult = { permit: false; why: string } | { permit: true; route: string; note: string };
export type Rule = { id: string; passport: Group[]; dest: Group[]; result: RuleResult; /** Shown in the ⓘ: which group this rule is about. */ applies: string };

/** Top to bottom — first match wins. Specific rules go above general ones. */
export const RULES: Rule[] = [
  // --- No permit needed (the job card shows nothing) -----------------------
  { id: 'eea-free', passport: ['bloc:eea_ch'], dest: ['bloc:eea_ch'], result: { permit: false, why: 'Free movement in the EU/EEA and Switzerland.' }, applies: 'EU/EEA/Swiss passports → EU/EEA/Switzerland' },
  { id: 'cta', passport: ['bloc:cta'], dest: ['bloc:cta'], result: { permit: false, why: 'Common Travel Area between the UK and Ireland.' }, applies: 'British and Irish passports → UK/Ireland' },
  { id: 'anzac', passport: ['bloc:anzac'], dest: ['bloc:anzac'], result: { permit: false, why: 'Trans-Tasman arrangement between Australia and New Zealand.' }, applies: 'Australian and NZ passports → Australia/NZ' },
  { id: 'gcc', passport: ['bloc:gcc'], dest: ['bloc:gcc'], result: { permit: false, why: 'GCC citizens can work across the Gulf states.' }, applies: 'GCC passports → GCC countries' },

  // --- Easier routes inside a bloc ---------------------------------------------
  {
    id: 'mercosur',
    passport: ['bloc:mercosur'],
    dest: ['bloc:mercosur'],
    result: { permit: true, route: 'Mercosur residence permit', note: 'A simplified residence permit with the right to work, under the Mercosur Residence Agreement.' },
    applies: 'Mercosur passports → Mercosur countries',
  },

  // --- Destination defaults for countries without a visa guide -------------
  {
    id: 'to-eu',
    passport: ['any'],
    dest: ['bloc:eu'],
    result: { permit: true, route: 'EU Blue Card or national work permit', note: 'Skilled jobs usually qualify for the EU Blue Card (degree + salary threshold); otherwise the country’s own work permit, normally with the employer’s help.' },
    applies: 'Passports from outside the EU/EEA → EU countries',
  },
  {
    id: 'to-eea-non-eu',
    passport: ['any'],
    dest: ['country:NO', 'country:IS', 'country:LI'],
    result: { permit: true, route: 'Skilled worker residence permit', note: 'A residence permit for skilled workers, tied to a job offer.' },
    applies: 'Passports from outside the EU/EEA → Norway, Iceland, Liechtenstein',
  },
  {
    id: 'to-ch',
    passport: ['any'],
    dest: ['country:CH'],
    result: { permit: true, route: 'Swiss work permit (employer-sponsored)', note: 'Employer applies; permits for non-EU nationals are limited by annual quotas and favour qualified specialists.' },
    applies: 'Passports from outside the EU/EEA → Switzerland',
  },
  {
    id: 'to-gcc',
    passport: ['any'],
    dest: ['bloc:gcc'],
    result: { permit: true, route: 'Employer-sponsored work visa', note: 'In the Gulf states the employer arranges the work visa and residence permit.' },
    applies: 'Passports from outside the GCC → Gulf states',
  },
  {
    id: 'to-uk-ie',
    passport: ['any'],
    dest: ['bloc:cta'],
    result: { permit: true, route: 'Employer-sponsored work visa', note: 'The employer usually needs to sponsor you.' },
    applies: 'Other passports → UK/Ireland',
  },
  {
    id: 'default',
    passport: ['any'],
    dest: ['any'],
    result: { permit: true, route: 'Work permit needed', note: 'Most countries require a work permit arranged with the employer. Check the official immigration site.' },
    applies: 'All other combinations',
  },
];

// ---------------------------------------------------------------------------

function inGroup(code: string, g: Group): boolean {
  if (g === 'any') return true;
  const [kind, key] = g.split(':') as [string, string];
  if (kind === 'country') return key === code;
  if (kind === 'bloc') return BLOCS[key as Bloc]?.members.includes(code) ?? false;
  if (kind === 'region') return REGIONS[key as Region]?.members.includes(code) ?? false;
  return false;
}

export type RuleMatch = { rule: Rule; result: RuleResult };

/** The rule that applies to a passport working in a country. */
export function workRule(passport: string, dest: string): RuleMatch {
  if (passport === dest) return { rule: { id: 'own-country', passport: [], dest: [], result: { permit: false, why: 'Your own country.' }, applies: 'Own country' }, result: { permit: false, why: 'Your own country.' } };
  const rule = RULES.find((r) => r.passport.some((g) => inGroup(passport, g)) && r.dest.some((g) => inGroup(dest, g)))!;
  return { rule, result: rule.result };
}

export function regionOf(code: string): Region | null {
  for (const [k, r] of Object.entries(REGIONS)) if (r.members.includes(code)) return k as Region;
  return null;
}
