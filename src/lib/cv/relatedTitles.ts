// Job titles for "I don't have a CV": the everyday jobs people move abroad for, plus the site's categories,
// and for each title a few close ones that are searched too ("UX designer" → graphic designer, product designer).
import { CATEGORIES_BY_GROUP, categoryGroup, classifyJob } from '@/lib/jobTaxonomy';

/** Jobs many people abroad do — offered as suggestions next to the site's own categories. */
export const COMMON_TITLES = [
  'Hotel housekeeper', 'Room attendant', 'Cleaner', 'Laundry attendant', 'Hotel receptionist', 'Front desk agent', 'Porter', 'Concierge',
  'Waiter', 'Waitress', 'Bartender', 'Barista', 'Host', 'Dishwasher', 'Kitchen helper', 'Kitchen porter', 'Line cook', 'Cook', 'Chef', 'Sous chef', 'Pastry chef', 'Baker', 'Butcher', 'Pizza maker',
  'Caregiver', 'Care assistant', 'Elderly carer', 'Nursing assistant', 'Nurse', 'Home health aide', 'Nanny', 'Babysitter',
  'Truck driver', 'Delivery driver', 'Bus driver', 'Taxi driver', 'Courier', 'Forklift operator', 'Warehouse worker', 'Picker packer', 'Order picker', 'Packer', 'Stock clerk',
  'Factory worker', 'Production worker', 'Machine operator', 'CNC operator', 'Assembly worker', 'Quality inspector', 'Meat processing worker', 'Food production worker',
  'Construction worker', 'Laborer', 'Carpenter', 'Mason', 'Bricklayer', 'Tiler', 'Painter', 'Plasterer', 'Roofer', 'Scaffolder', 'Plumber', 'Electrician', 'Welder', 'Pipefitter', 'HVAC technician', 'Steel fixer',
  'Mechanic', 'Car mechanic', 'Auto technician', 'Maintenance technician', 'Facility technician',
  'Farm worker', 'Fruit picker', 'Greenhouse worker', 'Agricultural worker', 'Landscaper', 'Gardener', 'Fisherman',
  'Security guard', 'Doorman', 'Cashier', 'Retail assistant', 'Sales assistant', 'Shop assistant', 'Customer service agent', 'Call center agent',
  'Hairdresser', 'Beautician', 'Tailor', 'Seamstress', 'Massage therapist',
];

/** What students often study before an Ausbildung or internship abroad. */
export const STUDY_FIELDS = [
  'Nursing', 'Elderly care', 'Healthcare', 'Pharmacy', 'Medicine', 'Mechatronics', 'Mechanical engineering', 'Electrical engineering', 'Electronics', 'Civil engineering',
  'Automotive technology', 'Computer science', 'Software development', 'Information technology', 'Data science', 'Cybersecurity', 'Graphic design', 'Media design',
  'Hotel management', 'Hospitality', 'Tourism', 'Cooking', 'Culinary arts', 'Bakery', 'Food technology', 'Business administration', 'Accounting', 'Finance', 'Marketing',
  'Logistics', 'Supply chain', 'Retail', 'Office management', 'Construction', 'Architecture', 'Plumbing', 'HVAC', 'Welding', 'Agriculture', 'Biology', 'Chemistry', 'Education', 'Languages',
].sort((a, b) => a.localeCompare(b));

const cleanLabel = (l: string) => l.replace(/\s*\(other\)/i, '').trim();
export const ALL_TITLES = [...new Set([...COMMON_TITLES, ...CATEGORIES_BY_GROUP.flatMap((g) => g.labels.map(cleanLabel))])].sort((a, b) => a.localeCompare(b));

/** Close titles, by hand for the common ones. Keys are lower case. */
const RELATED: Record<string, string[]> = {
  'ux designer': ['Graphic designer', 'Product designer', 'UI designer'],
  'ui designer': ['UX designer', 'Graphic designer', 'Web designer'],
  'product designer': ['UX designer', 'UI designer', 'Graphic designer'],
  'graphic designer': ['UX designer', 'Visual designer', 'Web designer'],
  'web designer': ['Graphic designer', 'UI designer', 'Frontend developer'],
  'software engineer': ['Software developer', 'Backend developer', 'Full stack developer'],
  'software developer': ['Software engineer', 'Backend developer', 'Frontend developer'],
  'frontend developer': ['Web developer', 'Full stack developer', 'UI developer'],
  'backend developer': ['Software engineer', 'Full stack developer', 'Java developer'],
  'data analyst': ['Business analyst', 'BI analyst', 'Data scientist'],
  'accountant': ['Bookkeeper', 'Finance assistant', 'Accounts payable clerk'],
  'hotel housekeeper': ['Room attendant', 'Cleaner', 'Laundry attendant'],
  'housekeeper': ['Room attendant', 'Cleaner', 'Laundry attendant'],
  'room attendant': ['Hotel housekeeper', 'Cleaner', 'Laundry attendant'],
  'cleaner': ['Housekeeper', 'Room attendant', 'Janitor'],
  'hotel receptionist': ['Front desk agent', 'Receptionist', 'Concierge'],
  'receptionist': ['Front desk agent', 'Hotel receptionist', 'Office assistant'],
  'waiter': ['Waitress', 'Bartender', 'Barista'],
  'waitress': ['Waiter', 'Bartender', 'Barista'],
  'bartender': ['Waiter', 'Barista', 'Bar staff'],
  'barista': ['Waiter', 'Bartender', 'Cafe assistant'],
  'chef': ['Cook', 'Sous chef', 'Line cook'],
  'cook': ['Chef', 'Line cook', 'Kitchen helper'],
  'line cook': ['Cook', 'Chef', 'Kitchen helper'],
  'kitchen helper': ['Kitchen porter', 'Dishwasher', 'Cook'],
  'dishwasher': ['Kitchen helper', 'Kitchen porter', 'Cleaner'],
  'baker': ['Pastry chef', 'Cook', 'Food production worker'],
  'butcher': ['Meat processing worker', 'Food production worker', 'Cook'],
  'caregiver': ['Care assistant', 'Elderly carer', 'Nursing assistant'],
  'care assistant': ['Caregiver', 'Nursing assistant', 'Elderly carer'],
  'nurse': ['Nursing assistant', 'Care assistant', 'Registered nurse'],
  'nursing assistant': ['Care assistant', 'Nurse', 'Caregiver'],
  'nanny': ['Babysitter', 'Childcare worker', 'Au pair'],
  'truck driver': ['Delivery driver', 'Lorry driver', 'Forklift operator'],
  'delivery driver': ['Courier', 'Truck driver', 'Van driver'],
  'bus driver': ['Coach driver', 'Truck driver', 'Taxi driver'],
  'taxi driver': ['Chauffeur', 'Delivery driver', 'Bus driver'],
  'courier': ['Delivery driver', 'Van driver', 'Warehouse worker'],
  'forklift operator': ['Warehouse worker', 'Reach truck driver', 'Order picker'],
  'warehouse worker': ['Picker packer', 'Forklift operator', 'Order picker'],
  'picker packer': ['Warehouse worker', 'Order picker', 'Packer'],
  'factory worker': ['Production worker', 'Machine operator', 'Assembly worker'],
  'production worker': ['Factory worker', 'Machine operator', 'Packer'],
  'machine operator': ['CNC operator', 'Production worker', 'Factory worker'],
  'construction worker': ['Laborer', 'Carpenter', 'Mason'],
  'laborer': ['Construction worker', 'Helper', 'Warehouse worker'],
  'carpenter': ['Joiner', 'Construction worker', 'Formwork carpenter'],
  'mason': ['Bricklayer', 'Construction worker', 'Tiler'],
  'electrician': ['Electrical technician', 'Maintenance technician', 'Electrical installer'],
  'plumber': ['Pipefitter', 'HVAC technician', 'Heating installer'],
  'welder': ['Metal fabricator', 'Pipefitter', 'Steel fixer'],
  'painter': ['Decorator', 'Plasterer', 'Construction worker'],
  'mechanic': ['Car mechanic', 'Auto technician', 'Maintenance technician'],
  'car mechanic': ['Auto technician', 'Mechanic', 'Tyre fitter'],
  'farm worker': ['Fruit picker', 'Greenhouse worker', 'Agricultural worker'],
  'fruit picker': ['Farm worker', 'Greenhouse worker', 'Harvest worker'],
  'gardener': ['Landscaper', 'Groundskeeper', 'Farm worker'],
  'security guard': ['Security officer', 'Doorman', 'CCTV operator'],
  'cashier': ['Retail assistant', 'Sales assistant', 'Shop assistant'],
  'retail assistant': ['Sales assistant', 'Cashier', 'Shop assistant'],
  'customer service agent': ['Call center agent', 'Customer support', 'Sales assistant'],
  'hairdresser': ['Barber', 'Beautician', 'Stylist'],
  // Study fields (students).
  'nursing': ['Nursing assistant', 'Care assistant', 'Elderly care'],
  'elderly care': ['Care assistant', 'Nursing assistant', 'Caregiver'],
  'mechatronics': ['Mechatronics technician', 'Electronics technician', 'Industrial mechanic'],
  'mechanical engineering': ['Industrial mechanic', 'Mechanical technician', 'CNC operator'],
  'electrical engineering': ['Electrician', 'Electronics technician', 'Electrical technician'],
  'computer science': ['Software developer', 'IT specialist', 'Web developer'],
  'information technology': ['IT specialist', 'IT support', 'System administrator'],
  'software development': ['Software developer', 'Web developer', 'IT specialist'],
  'hotel management': ['Hotel receptionist', 'Hotel clerk', 'Front desk agent'],
  'hospitality': ['Hotel receptionist', 'Restaurant specialist', 'Waiter'],
  'cooking': ['Cook', 'Chef', 'Kitchen helper'],
  'culinary arts': ['Cook', 'Chef', 'Pastry chef'],
  'business administration': ['Office clerk', 'Office administrator', 'Sales assistant'],
  'logistics': ['Warehouse logistics specialist', 'Logistics clerk', 'Warehouse worker'],
  'retail': ['Retail sales', 'Sales assistant', 'Cashier'],
};

/** Up to three titles close to this one: by hand for common jobs, otherwise others in the same field. */
export function relatedTitles(title: string): string[] {
  const t = title.trim().toLowerCase();
  if (!t) return [];
  const own = RELATED[t] ?? RELATED[t.replace(/s$/, '')];
  if (own) return own.slice(0, 3);
  const cat = classifyJob(title);
  const group = cat ? categoryGroup(cat.label) : undefined;
  if (!group) return [];
  const siblings = CATEGORIES_BY_GROUP.find((g) => g.group === group)?.labels.map(cleanLabel) ?? [];
  // Siblings sharing a word with the title first ("Data engineer" → Data Analyst before Bioinformatics).
  const words = new Set(t.split(/\W+/).filter((w) => w.length > 2));
  const shared = (l: string) => l.toLowerCase().split(/\W+/).filter((w) => words.has(w)).length;
  return [...new Set(siblings)]
    .filter((l) => l.toLowerCase() !== t && !/other/i.test(l))
    .sort((a, b) => shared(b) - shared(a))
    .slice(0, 3);
}
