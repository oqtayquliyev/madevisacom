import { useEffect, useMemo, useRef, useState } from 'react';
import { SoonChip } from '@/components/common/SoonChip';
import {
  ArrowRight,
  BadgeCheck,
  ChevronDown,
  Clock,
  Flame,
  Globe2,
  GraduationCap,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { View } from '@/types';
import { DirectListingBadge } from '@/components/common/DirectListingBadge';
import {
  fetchSponsoredPrograms,
  getApplicationWindowStatus,
  toEligibilityCriteria,
  type ApplicationWindowStatus,
  type SponsoredProgram,
} from '@/lib/programs';
import { computeEligibility, usePersonalization } from '@/lib/personalization';
import { useSeo } from '@/lib/seo';
import { LandingHeader } from '@/pages/landing/components/LandingHeader';
import { LandingFooter } from '@/pages/landing/components/LandingFooter';
import { PersonalizationBar, EligibilityBadge } from '@/components/opportunities/PersonalizationBar';
import { CircleFlag } from '@/components/common/CircleFlag';
import { CompanyLogo } from '@/components/common/CompanyLogo';
import { countries } from '@/data/jobs';
import { formatCost, PROGRAM_CATEGORIES, type ProgramCategory } from '@/lib/listingCategories';

/**
 * One page, two modes — same layout and behaviour as the Jobs page:
 *  - "programs" (/programs): government schemes, work, relocation, training…
 *  - "study"    (/study):    scholarships, universities, language courses, exchanges
 * Both read the same `programs` table; the mode just decides which
 * program categories belong on the page and which filters make sense.
 */
export type OpportunityMode = 'programs' | 'study';

const STUDY_CATEGORIES: ProgramCategory[] = ['Scholarship', 'University / Education', 'Language course', 'Exchange program'];
const PROGRAM_ONLY_CATEGORIES: ProgramCategory[] = PROGRAM_CATEGORIES.filter((c) => !STUDY_CATEGORIES.includes(c));

const MODE_CONFIG: Record<
  OpportunityMode,
  {
    path: string;
    seoTitle: string;
    seoDescription: string;
    heading: string;
    subheading: string;
    searchPlaceholder: string;
    listTitle: string;
    noun: string;
    nounPlural: string;
    categories: ProgramCategory[];
    allTypesLabel: string;
    typeFilterLabel: string;
    emptyTitle: string;
    emptyText: string;
    footnote: string;
  }
> = {
  programs: {
    path: '/programs',
    seoTitle: 'Programs: Government, Work, Training & Relocation',
    seoDescription:
      'Discover official programs from governments, companies and organizations: work, training, relocation, volunteer and immigration programs, at home or abroad.',
    heading: 'Discover {programs} from official sources.',
    subheading: 'Government schemes, work, training and relocation programs collected from official sources and verified organizations, in one place.',
    searchPlaceholder: 'Program name, field or organization',
    listTitle: 'Programs',
    noun: 'program',
    nounPlural: 'programs',
    categories: PROGRAM_ONLY_CATEGORIES,
    allTypesLabel: 'All program types',
    typeFilterLabel: 'Program type',
    emptyTitle: 'Programs are coming soon',
    emptyText: "We're adding government, work and training programs. Check back soon, or browse jobs in the meantime.",
    footnote:
      'MadeVisa collects programs from official and publicly available sources and verified organizations. Details can change after publishing, so always check the current status on the official program page.',
  },
  study: {
    path: '/study',
    seoTitle: 'Study Opportunities: Scholarships, Universities & Courses',
    seoDescription:
      'Discover scholarships, university programs, language courses and exchanges from official sources, with funding and application deadlines in one place.',
    heading: 'Discover {study opportunities} worldwide.',
    subheading: 'Scholarships, university programs, language courses and exchanges from official sources, with funding and deadlines in one place.',
    searchPlaceholder: 'Scholarship, university, course or field',
    listTitle: 'Study opportunities',
    noun: 'study opportunity',
    nounPlural: 'study opportunities',
    categories: STUDY_CATEGORIES,
    allTypesLabel: 'All study types',
    typeFilterLabel: 'Study type',
    emptyTitle: 'Study opportunities are coming soon',
    emptyText: "We're adding scholarships, university programs and language courses. Check back soon, or browse jobs in the meantime.",
    footnote:
      'MadeVisa collects study opportunities from official and publicly available sources. Deadlines and funding can change, so always check the current details on the official page before applying.',
  },
};

const PAGE_SIZE = 12;

const DATE_POSTED_OPTIONS = ['Any time', 'Past 24 hours', 'Past week', 'Past month'] as const;
type DatePostedOption = (typeof DATE_POSTED_OPTIONS)[number];

const STATUS_OPTIONS = ['Any status', 'Open now', 'Opening soon', 'Rolling', 'Closed'] as const;
type StatusOption = (typeof STATUS_OPTIONS)[number];
const STATUS_TO_WINDOW: Record<Exclude<StatusOption, 'Any status'>, ApplicationWindowStatus> = {
  'Open now': 'open',
  'Opening soon': 'upcoming',
  Rolling: 'rolling',
  Closed: 'closed',
};

const FUNDING_OPTIONS = ['Any funding', 'Free', 'Fully funded', 'Paid', 'Not disclosed'] as const;
type FundingOption = (typeof FUNDING_OPTIONS)[number];

const ORG_OPTIONS = ['All organizations', 'Government', 'Company', 'Agency'] as const;
type OrgOption = (typeof ORG_OPTIONS)[number];

type SortOption = 'newest' | 'deadline';

const windowLabel: Record<ApplicationWindowStatus, string> = {
  open: 'Applications open',
  upcoming: 'Opens soon',
  closed: 'Applications closed',
  rolling: 'Rolling applications',
};

function matchesFunding(program: SponsoredProgram, funding: FundingOption): boolean {
  switch (funding) {
    case 'Free':
      return program.cost_status === 'free';
    case 'Fully funded':
      return program.cost_status === 'fully_funded';
    case 'Paid':
      return program.cost_status === 'cost_available';
    case 'Not disclosed':
      return program.cost_status === 'cost_not_disclosed' || program.cost_status === 'contact_provider';
    default:
      return true;
  }
}

function postedAt(program: SponsoredProgram): string {
  return program.approved_at ?? program.created_at;
}

function withinDateWindow(iso: string | null | undefined, window: DatePostedOption): boolean {
  if (window === 'Any time') return true;
  if (!iso) return false;
  const days = (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
  if (window === 'Past 24 hours') return days <= 1;
  if (window === 'Past week') return days <= 7;
  return days <= 31;
}

function formatDateTag(iso: string | null | undefined): { text: string; tier: 'today' | 'yesterday' | 'older' } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(d)) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return { text: 'Added today', tier: 'today' };
  if (diffDays === 1) return { text: 'Added yesterday', tier: 'yesterday' };
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return { text: `${dd}/${mm}/${d.getFullYear()}`, tier: 'older' };
}

function DateTag({ iso }: { iso: string }) {
  const tag = formatDateTag(iso);
  if (!tag) return null;
  if (tag.tier === 'today') {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-orange-600 px-1.5 py-[3px] text-[10px] font-bold tracking-wide text-white">
        <Flame className="h-3 w-3" strokeWidth={2.5} />
        {tag.text}
      </span>
    );
  }
  if (tag.tier === 'yesterday') {
    return <span className="inline-flex items-center gap-1 rounded bg-emerald-600 px-1.5 py-[3px] text-[10px] font-bold tracking-wide text-white">{tag.text}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 rounded bg-ink-100 px-1.5 py-[3px] text-[10px] font-semibold tracking-wide text-ink-600">
      <Clock className="h-3 w-3" />
      {tag.text}
    </span>
  );
}

function ProgramLogo({ program, size = 52 }: { program: SponsoredProgram; size?: number }) {
  const [failed, setFailed] = useState(false);
  const src = program.image_url ?? program.publisher?.logo_url ?? null;
  return (
    <div className="grid shrink-0 place-items-center overflow-hidden rounded-lg border border-ink-200 bg-white" style={{ width: size, height: size }}>
      {src && !failed ? (
        <img src={src} alt={`${program.publisher?.name ?? program.title} logo`} onError={() => setFailed(true)} className="h-full w-full object-contain p-1.5" />
      ) : (
        <CompanyLogo name={program.publisher?.name ?? program.title} size={size - 6} />
      )}
    </div>
  );
}

function ProgramCard({ program, goToProgram }: { program: SponsoredProgram; goToProgram?: (id: string) => void }) {
  const { profile } = usePersonalization();
  const eligibility = computeEligibility(toEligibilityCriteria(program), profile, program.country?.iso_code);
  const windowStatus = getApplicationWindowStatus(program);
  const cost = formatCost(program);
  const href = `/programs/${program.id}`;
  const location = program.country ? (program.city && program.city !== program.country.name ? `${program.city}, ${program.country.name}` : program.country.name) : 'Various';

  return (
    <a
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0 || !goToProgram) return;
        e.preventDefault();
        goToProgram(program.id);
      }}
      className="group relative block rounded-lg border border-ink-900/15 bg-white p-5 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft-lg sm:p-6"
    >
      <div className="flex items-start gap-3.5">
        <ProgramLogo program={program} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-ink-500">{program.publisher?.name}</p>
          <h3 className="mt-0.5 font-slab text-lg font-bold leading-snug text-ink-950 group-hover:text-brand-700">{program.title}</h3>
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-ink-500">
        <span className="flex items-center gap-1.5">
          <CircleFlag countryCode={program.country?.iso_code ?? ''} label={location} size={15} />
          {location}
        </span>
        <span className="flex items-center gap-1.5">
          <GraduationCap className="h-3.5 w-3.5 text-ink-400" />
          {program.category}
        </span>
        {program.duration_text && <span>{program.duration_text}</span>}
      </div>

      {cost && <p className="mt-3 text-[15px] font-bold text-ink-900">{cost}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
            windowStatus === 'open' || windowStatus === 'rolling'
              ? 'bg-emerald-50 text-emerald-700'
              : windowStatus === 'upcoming'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-ink-100 text-ink-500'
          }`}
        >
          {windowLabel[windowStatus]}
        </span>
        {program.applications_close_at && <span className="text-[11px] font-semibold text-ink-600">Deadline {program.applications_close_at}</span>}
        <EligibilityBadge result={eligibility} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3.5">
        <DateTag iso={postedAt(program)} />
        {program.publisher?.name &&
          (program.origin === 'direct' ? (
            <DirectListingBadge company={program.publisher.name} compact />
          ) : (
            <span className="text-[11px] text-ink-400">Source: {program.publisher.name}</span>
          ))}
      </div>
    </a>
  );
}

function ProgramCardSkeleton() {
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3.5">
        <div className="h-[52px] w-[52px] shrink-0 rounded-lg skeleton-shimmer" />
        <div className="min-w-0 flex-1 space-y-2 pt-1">
          <div className="h-3 w-1/3 rounded skeleton-shimmer" />
          <div className="h-4 w-2/3 rounded skeleton-shimmer" />
        </div>
      </div>
      <div className="mt-4 h-3 w-1/2 rounded skeleton-shimmer" />
      <div className="mt-5 h-3 w-1/3 rounded skeleton-shimmer" />
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative min-w-0">
      <label className="mb-1.5 block text-xs font-semibold text-ink-500">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-ink-300 bg-white px-3 text-left text-sm font-medium text-ink-800 transition hover:border-brand-400"
      >
        <span className="truncate">{value}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <button type="button" aria-label={`Close ${label}`} onClick={() => setOpen(false)} className="fixed inset-0 z-20 cursor-default" />
          <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-ink-300 bg-white p-1 shadow-xl">
            {options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className="block w-full truncate rounded px-3 py-2 text-left text-sm text-ink-700 hover:bg-ink-50"
              >
                {option}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Renders "Discover {keyword} ..." with the {keyword} part as MadeVisa-blue text on a white block, so it reads clearly on the blue hero. */
function HighlightedHeading({ text }: { text: string }) {
  const parts = text.split(/(\{[^}]+\})/);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('{') ? (
          <span key={i} className="rounded-md bg-white px-2 font-extrabold text-brand-700 [box-decoration-break:clone] [-webkit-box-decoration-break:clone] sm:px-2.5">
            {part.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

type ProgramsPageProps = {
  go: (view: View) => void;
  onAuth?: (page: 'login' | 'register') => void;
  goToProgram?: (id: string) => void;
  mode?: OpportunityMode;
};

export function ProgramsPage({ go, onAuth, goToProgram, mode = 'programs' }: ProgramsPageProps) {
  const config = MODE_CONFIG[mode];
  useSeo({ title: config.seoTitle, description: config.seoDescription, path: config.path });

  const initial = useMemo(() => new URLSearchParams(window.location.search), []);
  const allTypes = config.allTypesLabel;

  const [search, setSearch] = useState(initial.get('q') ?? '');
  const [country, setCountry] = useState(initial.get('country') ?? 'All countries');
  const [category, setCategory] = useState(() => {
    const c = initial.get('category');
    return c && (config.categories as string[]).includes(c) ? c : allTypes;
  });
  const [status, setStatus] = useState<StatusOption>(() => (STATUS_OPTIONS as readonly string[]).includes(initial.get('status') ?? '') ? (initial.get('status') as StatusOption) : 'Any status');
  const [funding, setFunding] = useState<FundingOption>(() => (FUNDING_OPTIONS as readonly string[]).includes(initial.get('funding') ?? '') ? (initial.get('funding') as FundingOption) : 'Any funding');
  const [orgType, setOrgType] = useState<OrgOption>(() => (ORG_OPTIONS as readonly string[]).includes(initial.get('org') ?? '') ? (initial.get('org') as OrgOption) : 'All organizations');
  const [organization, setOrganization] = useState(initial.get('organization') ?? '');
  const [datePosted, setDatePosted] = useState<DatePostedOption>(() => (DATE_POSTED_OPTIONS as readonly string[]).includes(initial.get('posted') ?? '') ? (initial.get('posted') as DatePostedOption) : 'Any time');
  const [sortBy, setSortBy] = useState<SortOption>(initial.get('sort') === 'deadline' ? 'deadline' : 'newest');
  const [directOnly, setDirectOnly] = useState(initial.get('direct') === '1');
  const [showFilters, setShowFilters] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [allPrograms, setAllPrograms] = useState<SponsoredProgram[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchSponsoredPrograms().then((rows) => {
      if (cancelled) return;
      setAllPrograms(rows.filter((p) => (config.categories as string[]).includes(p.category)));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [config.categories]);

  const countryOptions = useMemo(
    () => ['All countries', ...Array.from(new Set(allPrograms.map((p) => p.country?.name).filter((n): n is string => Boolean(n)))).sort()],
    [allPrograms]
  );

  // Keep the URL in sync with the filters (shareable, and back from a
  // detail page restores them) — same approach as the Jobs page.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (country !== 'All countries') params.set('country', country);
    if (category !== allTypes) params.set('category', category);
    if (status !== 'Any status') params.set('status', status);
    if (funding !== 'Any funding') params.set('funding', funding);
    if (orgType !== 'All organizations') params.set('org', orgType);
    if (organization) params.set('organization', organization);
    if (datePosted !== 'Any time') params.set('posted', datePosted);
    if (sortBy !== 'newest') params.set('sort', sortBy);
    if (directOnly) params.set('direct', '1');
    const query = params.toString();
    window.history.replaceState({}, '', query ? `${config.path}?${query}` : config.path);
  }, [search, country, category, status, funding, orgType, organization, datePosted, sortBy, directOnly, allTypes, config.path]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, country, category, status, funding, orgType, organization, datePosted, sortBy, directOnly]);

  const directPrograms = useMemo(() => allPrograms.filter((p) => p.origin === 'direct'), [allPrograms]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const org = organization.trim().toLowerCase();
    const matched = allPrograms.filter((p) => {
      const matchesSearch =
        !q ||
        p.title.toLowerCase().includes(q) ||
        (p.publisher?.name ?? '').toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.city ?? '').toLowerCase().includes(q) ||
        (p.country?.name ?? '').toLowerCase().includes(q);
      const matchesCountry = country === 'All countries' || p.country?.name === country;
      const matchesCategory = category === allTypes || p.category === category;
      const matchesStatus = status === 'Any status' || getApplicationWindowStatus(p) === STATUS_TO_WINDOW[status];
      const matchesOrgType = orgType === 'All organizations' || p.publisher?.org_type === orgType.toLowerCase();
      const matchesOrganization = !org || (p.publisher?.name ?? '').toLowerCase().includes(org);
      return (
        (!directOnly || p.origin === 'direct') &&
        matchesSearch &&
        matchesCountry &&
        matchesCategory &&
        matchesStatus &&
        matchesFunding(p, funding) &&
        matchesOrgType &&
        matchesOrganization &&
        withinDateWindow(postedAt(p), datePosted)
      );
    });

    if (sortBy === 'deadline') {
      // Soonest upcoming deadline first; no deadline / already closed go last.
      const today = new Date().toISOString().slice(0, 10);
      const key = (p: SponsoredProgram) => (p.applications_close_at && p.applications_close_at >= today ? p.applications_close_at : '9999-12-31');
      return [...matched].sort((a, b) => key(a).localeCompare(key(b)));
    }
    return [...matched].sort((a, b) => new Date(postedAt(b)).getTime() - new Date(postedAt(a)).getTime());
  }, [allPrograms, search, country, category, status, funding, orgType, organization, datePosted, sortBy, directOnly, allTypes]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const clearAllFilters = () => {
    setCountry('All countries');
    setCategory(allTypes);
    setStatus('Any status');
    setFunding('Any funding');
    setOrgType('All organizations');
    setOrganization('');
    setDatePosted('Any time');
    setDirectOnly(false);
  };

  const activeFilters: { key: string; label: string; onClear: () => void }[] = [
    country !== 'All countries' && { key: 'country', label: country, onClear: () => setCountry('All countries') },
    category !== allTypes && { key: 'category', label: category, onClear: () => setCategory(allTypes) },
    status !== 'Any status' && { key: 'status', label: status, onClear: () => setStatus('Any status') },
    funding !== 'Any funding' && { key: 'funding', label: funding, onClear: () => setFunding('Any funding') },
    orgType !== 'All organizations' && { key: 'org', label: orgType, onClear: () => setOrgType('All organizations') },
    organization && { key: 'organization', label: organization, onClear: () => setOrganization('') },
    datePosted !== 'Any time' && { key: 'posted', label: datePosted, onClear: () => setDatePosted('Any time') },
    directOnly && { key: 'direct', label: 'Direct from organizations', onClear: () => setDirectOnly(false) },
  ].filter((f): f is { key: string; label: string; onClear: () => void } => Boolean(f));

  const POPULAR_COUNTRY_PILL_COUNT = 8;
  const topCountries = countries.slice(0, POPULAR_COUNTRY_PILL_COUNT);
  const selectedPill = countries.find((c) => c.name === country);
  const visibleCountryPills =
    country !== 'All countries' && selectedPill && !topCountries.some((c) => c.name === country)
      ? [...topCountries.slice(0, POPULAR_COUNTRY_PILL_COUNT - 1), selectedPill]
      : topCountries;

  const nothingPublishedYet = !loading && allPrograms.length === 0;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-ink-900">
      <LandingHeader go={go} onAuth={onAuth} active={mode === 'study' ? 'study' : 'programs'} />

      <section className="bg-brand-700 text-white">
        <div className="mx-auto max-w-5xl px-5 py-9 sm:px-8 sm:py-14">
          <h1 className="font-slab text-3xl font-bold leading-[1.3] tracking-tight text-white sm:text-4xl sm:leading-[1.3]">
            <HighlightedHeading text={config.heading} />
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/80 sm:text-base">{config.subheading}</p>

          <div className="mt-5">
            <PersonalizationBar tone="dark" />
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <div className="flex h-12 shrink-0 items-center gap-3 rounded-md border border-white bg-white sm:flex-1 px-3.5 shadow-sm">
              <Search className="h-4.5 w-4.5 shrink-0 text-ink-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={config.searchPlaceholder}
                className="h-full w-full bg-transparent text-sm font-medium text-ink-900 outline-none placeholder:text-ink-400"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="text-ink-400 hover:text-ink-700">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className="flex h-12 items-center justify-center gap-2 rounded-md border border-white/30 bg-white/10 px-5 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFilters.length > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-[10px] text-brand-700">{activeFilters.length}</span>
              )}
            </button>
          </div>

          <div className="-mx-5 mt-5 flex flex-wrap gap-2 px-5 pb-1 sm:mx-0 sm:px-0">
            <button
              type="button"
              onClick={() => setCountry('All countries')}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                country === 'All countries' ? 'border-white bg-white text-brand-700' : 'border-white/25 bg-white/10 text-white hover:border-white/60 hover:bg-white/15'
              }`}
            >
              <Globe2 className="h-3.5 w-3.5" />
              All countries
            </button>
            {visibleCountryPills.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => setCountry(item.name)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                  country === item.name ? 'border-white bg-white text-brand-700' : 'border-white/25 bg-white/10 text-white hover:border-white/60 hover:bg-white/15'
                }`}
              >
                <CircleFlag countryCode={item.code} label={item.name} size={15} />
                {item.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      {showFilters && (
        <section className="border-b border-ink-200 bg-white">
          <div className="mx-auto max-w-5xl px-5 py-5 sm:px-8">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SelectField label="Country" value={country} options={countryOptions.length > 1 ? countryOptions : ['All countries', ...countries.map((c) => c.name)]} onChange={setCountry} />
              <SelectField label={config.typeFilterLabel} value={category} options={[allTypes, ...config.categories]} onChange={setCategory} />
              <SelectField label="Application status" value={status} options={[...STATUS_OPTIONS]} onChange={(v) => setStatus(v as StatusOption)} />
              <SelectField label={mode === 'study' ? 'Funding / tuition' : 'Cost / funding'} value={funding} options={[...FUNDING_OPTIONS]} onChange={(v) => setFunding(v as FundingOption)} />
              <SelectField label={mode === 'study' ? 'Offered by' : 'Organization type'} value={orgType} options={[...ORG_OPTIONS]} onChange={(v) => setOrgType(v as OrgOption)} />
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-ink-500">{mode === 'study' ? 'Institution' : 'Organization'}</label>
                <input
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder={mode === 'study' ? 'Any university or institution' : 'Any organization'}
                  className="h-10 w-full rounded-md border border-ink-300 bg-white px-3 text-sm font-medium text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-400"
                />
              </div>
              <SelectField label="Date posted" value={datePosted} options={[...DATE_POSTED_OPTIONS]} onChange={(v) => setDatePosted(v as DatePostedOption)} />
            </div>

            {activeFilters.length > 0 && (
              <button type="button" onClick={clearAllFilters} className="mt-4 text-xs font-semibold text-brand-600 hover:text-brand-700">
                Clear all filters
              </button>
            )}
          </div>
        </section>
      )}

      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink-900">{config.listTitle}</h2>
            <p className="mt-0.5 text-sm text-ink-500">
              {loading ? 'Loading…' : `${filtered.length.toLocaleString()} ${filtered.length === 1 ? config.noun : config.nounPlural}`}
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-md border border-ink-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setSortBy('newest')}
              className={`rounded px-3 py-1.5 text-xs font-semibold transition ${sortBy === 'newest' ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-50'}`}
            >
              Newest
            </button>
            <button
              type="button"
              onClick={() => setSortBy('deadline')}
              className={`rounded px-3 py-1.5 text-xs font-semibold transition ${sortBy === 'deadline' ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-50'}`}
            >
              Deadline soonest
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {directPrograms.length > 0 && (
            <button
              type="button"
              onClick={() => setDirectOnly((v) => !v)}
              className={`flex shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                directOnly ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100'
              }`}
            >
              <BadgeCheck className="h-3.5 w-3.5" />
              Direct from organizations ({directPrograms.length})
            </button>
          )}
          {[allTypes, ...config.categories].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                category === c ? 'bg-brand-600 text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100'
              }`}
            >
              {c === allTypes ? 'All' : c}
            </button>
          ))}
        </div>

        {activeFilters.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {activeFilters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={f.onClear}
                className="flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 py-1 pl-3 pr-2 text-xs font-semibold text-brand-700 hover:bg-brand-100"
              >
                {f.label}
                <X className="h-3 w-3" />
              </button>
            ))}
            <button type="button" onClick={clearAllFilters} className="text-xs font-semibold text-ink-400 hover:text-ink-600">
              Clear all
            </button>
          </div>
        )}

        {loading ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProgramCardSkeleton key={i} />
            ))}
          </div>
        ) : nothingPublishedYet ? (
          <div className="mt-6 rounded-lg border border-ink-200 bg-white px-6 py-16 text-center">
            <GraduationCap className="mx-auto h-8 w-8 text-brand-300" />
            <h3 className="mt-4 text-lg font-bold text-ink-900">{config.emptyTitle}</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">{config.emptyText}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => go('jobs')} className="flex items-center gap-2 rounded-md bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
                Browse jobs
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <button type="button" disabled title="Opens on MadeVisa soon" className="flex cursor-not-allowed items-center gap-2 rounded-md border border-ink-200 px-5 py-2.5 text-sm font-semibold text-ink-400">
                List a {mode === 'study' ? 'study opportunity' : 'program'}
                <SoonChip />
              </button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-6 rounded-lg border border-ink-200 bg-white px-6 py-16 text-center">
            <Search className="mx-auto h-8 w-8 text-ink-300" />
            <h3 className="mt-4 text-lg font-bold text-ink-900">No {config.nounPlural} found</h3>
            <p className="mt-2 text-sm text-ink-500">Try changing your search or filters.</p>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                clearAllFilters();
              }}
              className="mt-5 rounded-md bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            {!directOnly && activeFilters.length === 0 && !search && directPrograms.length > 0 && (
              <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
                      <BadgeCheck className="h-4 w-4 text-emerald-600" />
                      Posted directly on MadeVisa
                    </h3>
                    <p className="text-xs text-ink-500">Published here by the organizations running them.</p>
                  </div>
                  {directPrograms.length > 2 && (
                    <button type="button" onClick={() => setDirectOnly(true)} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800">
                      See all {directPrograms.length} →
                    </button>
                  )}
                </div>
                <div className="mt-3 grid gap-4 lg:grid-cols-2">
                  {directPrograms.slice(0, 2).map((program) => (
                    <ProgramCard key={`direct-${program.id}`} program={program} goToProgram={goToProgram} />
                  ))}
                </div>
              </div>
            )}
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {visible.map((program) => (
                <ProgramCard key={program.id} program={program} goToProgram={goToProgram} />
              ))}
            </div>
            {hasMore && (
              <div className="mt-7 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  className="flex items-center gap-2 rounded-md border border-ink-300 px-6 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50"
                >
                  Show more {config.nounPlural}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </>
        )}

        <p className="mt-10 text-xs leading-5 text-ink-400">{config.footnote}</p>
      </main>

      <LandingFooter go={go} onAuth={onAuth} />
    </div>
  );
}

