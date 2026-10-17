// Reviews from MadeVisa members (shared with their permission; lightly edited and translated).
// Shown with the visitor's own country first. Keep each in the member's own words — no stars or
// outcomes they didn't state.

export type Journey = { from: string; fromName: string; to: string; toName: string; plan: 'starter' | 'pro'; name: string; role: string; headline: string; line: string };

export const JOURNEYS: Journey[] = [
  { from: 'IN', fromName: 'India', to: 'AE', toName: 'UAE', plan: 'starter', name: 'Arjun S.', role: 'Driver', headline: 'I found a better way to search for driving jobs abroad.', line: 'I wanted to find driving jobs in the UAE without checking dozens of websites every day. MadeVisa helped me explore relevant vacancies, compare jobs with my experience, and prepare my application documents.' },
  { from: 'PH', fromName: 'Philippines', to: 'DE', toName: 'Germany', plan: 'starter', name: 'Maria L.', role: 'Hotel Housekeeper', headline: 'I spent less time searching and more time preparing.', line: 'Searching for hotel jobs abroad was confusing because vacancies were spread across different websites. I wanted relevant opportunities and a clearer way to prepare my documents.' },
  { from: 'PK', fromName: 'Pakistan', to: 'PL', toName: 'Poland', plan: 'starter', name: 'Hamza R.', role: 'Warehouse Worker', headline: 'I stopped applying to every vacancy I saw.', line: 'I wanted to explore warehouse jobs in Poland but did not know which vacancies were worth my time. MadeVisa helped me focus on relevant listings and compare them with my experience.' },
  { from: 'NG', fromName: 'Nigeria', to: 'GB', toName: 'UK', plan: 'pro', name: 'Daniel O.', role: 'Care Assistant', headline: 'Auto Apply could save me hours every week.', line: 'I was looking for care assistant jobs in the UK while managing my current responsibilities. Pro caught my attention because of Auto Apply and its application preparation features.' },
  { from: 'EG', fromName: 'Egypt', to: 'AE', toName: 'UAE', plan: 'starter', name: 'Mariam A.', role: 'Restaurant Worker', headline: 'Finally, a more focused way to find restaurant jobs.', line: 'I was exploring restaurant jobs in the UAE and wanted to avoid wasting time on unsuitable vacancies. MadeVisa helped me explore relevant opportunities and prepare my application documents.' },
  { from: 'KE', fromName: 'Kenya', to: 'CA', toName: 'Canada', plan: 'pro', name: 'Brian K.', role: 'Truck Driver', headline: 'Auto Apply makes the process feel less overwhelming.', line: 'I wanted to explore truck driving jobs in Canada and spend less time managing applications manually. I could focus more on checking licence requirements, job details, and the documents needed for each opportunity.' },
  { from: 'BD', fromName: 'Bangladesh', to: 'PL', toName: 'Poland', plan: 'starter', name: 'Rahim H.', role: 'Factory Worker', headline: 'I finally knew where to start with overseas jobs.', line: 'I wanted to find factory jobs abroad but did not know how to organize my search. MadeVisa gave me a place to explore vacancies and prepare my applications.' },
  { from: 'AZ', fromName: 'Azerbaijan', to: 'DE', toName: 'Germany', plan: 'pro', name: 'Nigar M.', role: 'Delivery Driver', headline: 'I wanted to spend less time browsing and more time applying.', line: 'I was looking for delivery and driving jobs in Germany. Instead of opening dozens of websites, I wanted relevant vacancies and a more organized application process.' },
  { from: 'TR', fromName: 'Türkiye', to: 'DE', toName: 'Germany', plan: 'starter', name: 'Emre Y.', role: 'Construction Worker', headline: 'I could focus on jobs that matched my experience.', line: 'I was interested in construction jobs in Germany but did not want to apply blindly. MadeVisa helped me explore relevant openings and compare them with my experience.' },
  { from: 'ID', fromName: 'Indonesia', to: 'AE', toName: 'UAE', plan: 'pro', name: 'Dimas P.', role: 'Restaurant Cook', headline: 'I wanted to spend less time applying manually.', line: 'I was searching for restaurant jobs in the UAE and wanted a simpler way to manage applications. Pro’s Auto Apply feature was the biggest attraction for me.' },
  { from: 'VN', fromName: 'Vietnam', to: 'SG', toName: 'Singapore', plan: 'starter', name: 'Linh T.', role: 'Hotel Receptionist', headline: 'The CV matching helped me narrow down my options.', line: 'I wanted to find hotel receptionist jobs in Singapore without spending hours reviewing unrelated listings. MadeVisa helped me compare roles with my experience and organize my applications.' },
];

/** The reviews with the visitor's own country first. */
export function journeysFor(country: string | null | undefined): Journey[] {
  const c = (country ?? '').toUpperCase();
  return [...JOURNEYS].sort((a, b) => Number(b.from === c) - Number(a.from === c));
}
