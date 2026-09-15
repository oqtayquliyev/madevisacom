export type Airport = {
  code: string; // IATA
  city: string;
  country: string;
  countryCode: string;
};

export const airports: Airport[] = [
  { code: 'GYD', city: 'Baku', country: 'Azerbaijan', countryCode: 'AZ' },
  { code: 'IST', city: 'Istanbul', country: 'Turkey', countryCode: 'TR' },
  { code: 'DXB', city: 'Dubai', country: 'United Arab Emirates', countryCode: 'AE' },
  { code: 'LON', city: 'London', country: 'United Kingdom', countryCode: 'GB' },
  { code: 'PAR', city: 'Paris', country: 'France', countryCode: 'FR' },
  { code: 'BER', city: 'Berlin', country: 'Germany', countryCode: 'DE' },
  { code: 'MIL', city: 'Milan', country: 'Italy', countryCode: 'IT' },
  { code: 'ROM', city: 'Rome', country: 'Italy', countryCode: 'IT' },
  { code: 'MAD', city: 'Madrid', country: 'Spain', countryCode: 'ES' },
  { code: 'AMS', city: 'Amsterdam', country: 'Netherlands', countryCode: 'NL' },
  { code: 'ZRH', city: 'Zurich', country: 'Switzerland', countryCode: 'CH' },
  { code: 'VIE', city: 'Vienna', country: 'Austria', countryCode: 'AT' },
  { code: 'DUB', city: 'Dublin', country: 'Ireland', countryCode: 'IE' },
  { code: 'NYC', city: 'New York', country: 'United States', countryCode: 'US' },
  { code: 'YTO', city: 'Toronto', country: 'Canada', countryCode: 'CA' },
  { code: 'SYD', city: 'Sydney', country: 'Australia', countryCode: 'AU' },
  { code: 'DOH', city: 'Doha', country: 'Qatar', countryCode: 'QA' },
  { code: 'TBS', city: 'Tbilisi', country: 'Georgia', countryCode: 'GE' },
  { code: 'MOW', city: 'Moscow', country: 'Russia', countryCode: 'RU' },
  { code: 'DEL', city: 'Delhi', country: 'India', countryCode: 'IN' },
];

export const defaultOrigin = airports[0]; // Baku
export const defaultDestination = airports[5]; // Berlin
