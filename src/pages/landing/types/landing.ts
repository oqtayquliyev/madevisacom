export type Journey =
  | 'work'
  | 'study'
  | 'programs'
  | 'business'
  | 'family';

export type Service =
  | 'visa'
  | 'flights'
  | 'hotels'
  | 'airbnb'
  | 'experts';

export type ResultTab =
  | 'best'
  | 'cheapest'
  | 'suggested'
  | 'sponsored';

export type Country = {
  name: string;
  code: string;
  flag: string;
  image: string;
};

export type JourneyQuestion = {
  id: string;
  label: string;
  placeholder: string;
  options?: string[];
  type?: 'select' | 'number';
};

export type JourneyConfig = {
  id: Journey;
  label: string;
  description: string;
  cost: number;
  opportunities: number;
  questions: JourneyQuestion[];
};