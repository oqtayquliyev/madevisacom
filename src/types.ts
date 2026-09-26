export type Status =
  | 'completed'
  | 'confirmed'
  | 'in-progress'
  | 'waiting'
  | 'not-started'
  | 'action-required'
  | 'cancelled';

export type RouteCountry = { code: string; name: string; flag: string };

export type RequirementStatus = Status;

export type RequirementStep = {
  id: string;
  title: string;
  detail: string;
  status: RequirementStatus;
  action?: string;
};

export type Agency = {
  id: string;
  name: string;
  initials: string;
  rating: number;
  tripsHandled: number;
  destinations: string[];
  services: string[];
  priceFrom: number;
  responseTime: string;
  match?: string;
};

export type Trip = {
  id: string;
  customerName: string;
  origin: RouteCountry;
  destination: RouteCountry;
  city: string;
  dates: string;
  readiness: number;
  attention: number;
  managedBy?: string;
  nextAction: string;
  nextActionDetail: string;
  steps: RequirementStep[];
  payment: { total: number; paid: number; remaining: number };
  agencyStatus?: string;
};

export type Service = {
  title: string;
  description: string;
  price: number;
  completion: string;
  includes: string[];
};

export type AgencyRequest = {
  id: string;
  customer: string;
  route: string;
  date: string;
  services: string[];
  status: Status;
};

export type View =
  | 'home'
  | 'jobs'
  | 'programs'
  | 'study'
  | 'sponsored-programs'
  | 'submit-job'
  | 'profile'
  | 'experts'
  | 'destinations'
  | 'dashboard'
  | 'admin'
  | 'company'
  | 'companies'
  | 'feedback'
  | 'official-partners'
  | 'agencies'
  | 'network';

  
