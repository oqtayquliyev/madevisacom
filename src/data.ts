import type { Agency, AgencyRequest, RequirementStep, RouteCountry, Service, Trip } from '@/types';

export const nationalities: RouteCountry[] = [
  { code: 'AZ', name: 'Azerbaijan', flag: '🇦🇿' },
  { code: 'TR', name: 'Turkey', flag: '🇹🇷' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
];

export const destinations: RouteCountry[] = [
  { code: 'IT', name: 'Italy', flag: '🇮🇹' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸' },
];

export const defaultSteps: RequirementStep[] = [
  { id: 'visa', title: 'Visa', detail: 'Schengen tourist visa', status: 'in-progress', action: 'Continue visa documents' },
  { id: 'flight', title: 'Flight', detail: 'Baku → Rome', status: 'completed' },
  { id: 'stay', title: 'Accommodation', detail: 'Hotel booking', status: 'not-started' },
  { id: 'insurance', title: 'Travel Insurance', detail: 'Medical and trip cover', status: 'not-started' },
  { id: 'transfer', title: 'Airport Transfer', detail: 'Fiumicino → Hotel', status: 'waiting' },
  { id: 'activities', title: 'Activities', detail: 'Add optional experiences', status: 'not-started' },
  { id: 'documents', title: 'Documents', detail: '6 of 7 documents ready', status: 'action-required', action: 'Upload passport copy' },
];

export const demoTrip: Trip = {
  id: 'abc123',
  customerName: 'Oqtay Quliyev',
  origin: nationalities[0],
  destination: destinations[0],
  city: 'Rome',
  dates: '12 September → 19 September 2026',
  readiness: 78,
  attention: 2,
  nextAction: 'Complete your visa documents',
  nextActionDetail: 'Upload a clear copy of your passport to continue your application.',
  steps: defaultSteps,
  payment: { total: 2450, paid: 1500, remaining: 950 },
  managedBy: 'Global Travel',
  agencyStatus: 'Agency is preparing visa · Flight confirmed · Insurance pending',
};

export const agencies: Agency[] = [
  {
    id: 'global-travel',
    name: 'Global Travel',
    initials: 'GT',
    rating: 4.9,
    tripsHandled: 1240,
    destinations: ['Italy', 'France', 'Germany', 'Spain'],
    services: ['Visa assistance', 'Flights', 'Hotels', 'Insurance', 'Transfers'],
    priceFrom: 85,
    responseTime: 'Usually within 30 minutes',
    match: 'Best match for your trip',
  },
  {
    id: 'atlas-journeys',
    name: 'Atlas Journeys',
    initials: 'AJ',
    rating: 4.8,
    tripsHandled: 860,
    destinations: ['Italy', 'Spain', 'United Kingdom'],
    services: ['Visa assistance', 'Hotels', 'Activities'],
    priceFrom: 65,
    responseTime: 'Usually within 1 hour',
  },
  {
    id: 'northstar-travel',
    name: 'Northstar Travel',
    initials: 'NT',
    rating: 4.7,
    tripsHandled: 540,
    destinations: ['Italy', 'Germany', 'United Arab Emirates'],
    services: ['Flights', 'Hotels', 'Insurance', 'Transfers'],
    priceFrom: 50,
    responseTime: 'Usually within 2 hours',
  },
];

export const italyService: Service = {
  title: 'Italy Visa Assistance',
  description: 'A focused service for your Italy visa application.',
  price: 120,
  completion: '5 to 10 business days',
  includes: ['Application preparation', 'Document checklist', 'Appointment assistance', 'Application review', 'Status tracking'],
};

export const agencyRequests: AgencyRequest[] = [
  { id: 'req-1', customer: 'Oqtay Quliyev', route: 'Azerbaijan → Italy', date: '12 September 2026', services: ['Visa', 'Hotel', 'Flight'], status: 'action-required' },
  { id: 'req-2', customer: 'Leyla Huseynova', route: 'Azerbaijan → France', date: '18 November 2026', services: ['Visa', 'Insurance'], status: 'waiting' },
  { id: 'req-3', customer: 'Ali Mammadov', route: 'Azerbaijan → Dubai', date: '4 October 2026', services: ['Hotel', 'Transfers'], status: 'completed' },
];

export const tripCards = [
  { ...demoTrip, title: 'Italy', subtitle: '12 Sep → 19 Sep', state: '2 actions required' },
  { ...demoTrip, id: 'dubai-456', city: 'Dubai', title: 'Dubai', subtitle: '4 Oct → 11 Oct', readiness: 100, attention: 0, managedBy: undefined, state: 'Completed' },
  { ...demoTrip, id: 'france-789', city: 'Paris', title: 'France', subtitle: '18 Nov → 25 Nov', readiness: 42, attention: 4, managedBy: undefined, state: 'Planning' },
];
