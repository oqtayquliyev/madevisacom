import { NotificationBell } from '@/components/notifications/NotificationBell';
import { useEffect, useState } from "react";
import { SoonChip, SOON_VIEWS } from "@/components/common/SoonChip";
import {
  BarChart3,
  Briefcase,
  Building2,
  ChevronDown,
  Ghost,
  GraduationCap,
  LayoutDashboard,
  LogIn,
  LogOut,
  ScanSearch,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useCv } from "@/lib/cv/store";
import { CvRequiredDialog } from "@/components/cv/CvGate";
import { fetchMyManagedPublishers } from "@/lib/companyManager";
import { handleNavClick } from "@/lib/navLink";
import type { View } from "@/types";
import { BrandMark } from "@/components/layout/Logo";
import {
  GuestAvatar,
  TravelerAvatar,
} from "@/components/common/TravelerAvatar";

type LandingHeaderProps = {
  go: (view: View) => void;
  onAuth?: (page: "login" | "register") => void;
  active?: View;
};

// Main menu: Jobs · CV match · GhostGood · Company Insights · Recruiters.
// Programs and Study are "soon" — they live in the footer until they launch.
const primaryLinks: {
  view: View;
  href: string;
  label: string;
  icon: typeof Briefcase;
}[] = [
  { view: "jobs", href: "/jobs", label: "Jobs", icon: Briefcase },
  { view: "feedback", href: "/ghostgood", label: "GhostGood", icon: Ghost },
  { view: "companies", href: "/companies", label: "Company Insights", icon: BarChart3 },
  { view: "network", href: "/network", label: "Recruiters", icon: Users },
];

// Dropdown rows: grey by default, MadeVisa blue text on hover.
const menuItemClass =
  "group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-[15px] font-medium text-ink-700 transition-colors hover:bg-brand-50 hover:text-[#2563EB]";
const menuIconClass =
  "h-[18px] w-[18px] text-ink-400 transition-colors group-hover:text-[#2563EB]";

export function LandingHeader({ go, onAuth, active }: LandingHeaderProps) {
  const { profile, signOut } = useAuth();
  const { hasCv } = useCv();
  const [openMenu, setOpenMenu] = useState(false);
  const [openProfile, setOpenProfile] = useState(false);
  // Show "Manage company" only to people who actually manage one (cached per user).
  const [managedCompanyName, setManagedCompanyName] = useState<string | null>(
    null,
  );
  useEffect(() => {
    if (!profile) {
      setManagedCompanyName(null);
      return;
    }
    let alive = true;
    fetchMyManagedPublishers().then((list) => {
      if (alive)
        setManagedCompanyName(
          list.length === 0
            ? null
            : list.length === 1
              ? list[0].name
              : `${list.length} companies`,
        );
    });
    return () => {
      alive = false;
    };
  }, [profile?.id]);

  // Esc closes whichever menu is open.
  useEffect(() => {
    if (!openMenu && !openProfile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenMenu(false);
        setOpenProfile(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openMenu, openProfile]);

  const linkClass = (view: View) =>
    `flex items-center gap-2 whitespace-nowrap rounded-md px-3.5 py-2.5 md:px-2.5 lg:px-3.5 text-left text-[15px] font-medium transition-colors ${
      active === view
        ? "bg-brand-50 text-[#2563EB]"
        : "text-ink-600 hover:text-[#2563EB]"
    }`;

  // The name in the menu bar links to the public profile (/u/username) when
  // one is set up, otherwise to the profile dashboard.
  const myProfileHref = profile?.username ? `/u/${profile.username}` : "/profile";

  const closeAll = () => {
    setOpenMenu(false);
    setOpenProfile(false);
  };

  const goToMyProfile = () => {
    closeAll();
    if (profile?.username) {
      window.history.pushState({}, "", myProfileHref);
      window.dispatchEvent(new PopStateEvent("popstate"));
      window.scrollTo({ top: 0 });
    } else {
      go("profile");
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-3 px-5 sm:px-8">
          <BrandMark onClick={() => go("home")} />

          <nav
            className={`${
              openMenu
                ? "menu-pop absolute left-4 right-4 top-[72px] z-50 flex flex-col rounded-md border border-ink-200 bg-white p-3 shadow-xl"
                : "hidden"
            } gap-1 md:static md:z-auto md:flex md:flex-row md:items-center md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none md:[animation:none]`}
          >
          {/* Jobs first, then CV match, then the rest. */}
            {primaryLinks.slice(0, 1).map((link) => {
              const Icon = link.icon;
              return (
                <a
                  key={link.view}
                  href={link.href}
                  onClick={(event) =>
                    handleNavClick(event, () => {
                      go(link.view);
                      setOpenMenu(false);
                    })
                  }
                  className={`${linkClass(link.view)} ${SOON_VIEWS.has(link.view) && active !== link.view ? "!text-ink-400 hover:!text-ink-600" : ""}`}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                  {SOON_VIEWS.has(link.view) && <SoonChip />}
                </a>
              );
            })}

            <a
              href="/cv-match"
              onClick={(event) =>
                handleNavClick(event, () => {
                  window.history.pushState({}, "", "/cv-match");
                  window.dispatchEvent(new PopStateEvent("popstate"));
                  window.scrollTo({ top: 0 });
                  setOpenMenu(false);
                })
              }
              className={linkClass("cv-match" as View)}
            >
              <ScanSearch className="h-4 w-4" />
              CV match
              <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white">{hasCv ? "On" : "Free"}</span>
            </a>

            {primaryLinks.slice(1).map((link) => {
              const Icon = link.icon;
              return (
                <a
                  key={link.view}
                  href={link.href}
                  onClick={(event) =>
                    handleNavClick(event, () => {
                      go(link.view);
                      setOpenMenu(false);
                    })
                  }
                  className={`${linkClass(link.view)} ${SOON_VIEWS.has(link.view) && active !== link.view ? "!text-ink-400 hover:!text-ink-600" : ""}`}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                  {SOON_VIEWS.has(link.view) && <SoonChip />}
                </a>
              );
            })}
            <div className="my-1 h-px bg-ink-100 md:hidden" />

            <div className="flex items-center gap-1.5 px-3.5 py-1 text-xs text-ink-400 md:hidden">
              <GraduationCap className="h-3.5 w-3.5" />
              <Briefcase className="h-3.5 w-3.5" />
              More opportunities added every week
            </div>
          </nav>

          <div className="flex items-center gap-2.5">
            {!profile && (
              // Guests get one clear action. It opens sign-in, which links on
              // to "Create account" for people who don't have one yet.
              <a
                href="/login"
                onClick={(event) =>
                  handleNavClick(event, () => onAuth?.("login"))
                }
                className="block whitespace-nowrap rounded-md bg-[#2563EB] px-3.5 py-2 text-[14px] font-semibold text-white transition-colors hover:bg-brand-700 sm:px-5 sm:py-2.5 sm:text-[15px]"
              >
                Get started
              </a>
            )}

            {profile && <NotificationBell />}

            {/* Account menu — the name links to the person's profile; the avatar +
                arrow sit in a soft grey box and open the menu. */}
            {profile && (
            <div className="relative">
              <div
                className={`group/acct flex items-center ${
                  profile ? "gap-1.5 sm:gap-2" : "gap-1"
                }`}
              >
                {profile && (
                  <a
                    href={myProfileHref}
                    onClick={(event) =>
                      handleNavClick(event, goToMyProfile)
                    }
                    title="Go to your profile"
                    className="max-w-[5.5rem] origin-right truncate text-[14px] font-semibold text-ink-800 transition-[transform,color] duration-300 ease-out hover:text-[#2563EB] group-hover/acct:scale-[1.04] sm:max-w-[9rem] sm:text-[15px] md:max-lg:hidden"
                  >
                    {profile.full_name?.split(" ")[0] || "Profile"}
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setOpenProfile((v) => !v);
                    setOpenMenu(false); // one menu at a time, otherwise they overlap on mobile
                  }}
                  aria-label="Account menu"
                  aria-haspopup="menu"
                  aria-expanded={openProfile}
                  className="flex items-center gap-1 rounded-lg bg-ink-100 p-1 transition-colors hover:bg-ink-200/80"
                >
                  <span className="transition-transform duration-300 ease-out group-hover/acct:scale-[1.06]">
                    {profile ? (
                      <span className="block rounded-md p-[2px] ring-2 ring-[#2563EB]">
                        <span className="block sm:hidden">
                          <TravelerAvatar avatarUrl={profile.avatar_url} size={28} />
                        </span>
                        <span className="hidden sm:block">
                          <TravelerAvatar avatarUrl={profile.avatar_url} size={34} />
                        </span>
                      </span>
                    ) : (
                      <>
                        <span className="block sm:hidden">
                          <GuestAvatar size={28} />
                        </span>
                        <span className="hidden sm:block">
                          <GuestAvatar size={36} />
                        </span>
                      </>
                    )}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-ink-500 transition-transform duration-300 group-hover/acct:text-[#2563EB] ${
                      openProfile ? "rotate-180 text-[#2563EB]" : ""
                    }`}
                  />
                </button>
              </div>

              {openProfile && (
                <>
                  <button
                    type="button"
                    aria-label="Close menu"
                    tabIndex={-1}
                    onClick={() => setOpenProfile(false)}
                    className="fixed inset-0 z-30 cursor-default"
                  />
                  <div className="menu-pop absolute right-0 top-full z-40 mt-2 w-64 rounded-md border border-ink-200 bg-white p-1.5 shadow-xl">
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      {profile ? (
                        <TravelerAvatar
                          avatarUrl={profile.avatar_url}
                          size={36}
                        />
                      ) : (
                        <GuestAvatar size={36} />
                      )}
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                          {profile ? "Account" : "Guest"}
                        </p>
                        {profile ? (
                          <a
                            href={myProfileHref}
                            onClick={(event) =>
                              handleNavClick(event, goToMyProfile)
                            }
                            className="mt-0.5 block truncate text-[15px] font-semibold text-ink-900 hover:text-[#2563EB]"
                          >
                            {profile.full_name ?? profile.email}
                          </a>
                        ) : (
                          <p className="mt-0.5 truncate text-[15px] font-semibold text-ink-900">
                            Browsing as guest
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="my-1 h-px bg-ink-100" />

                    {profile ? (
                      <>
                        <a
                          href="/profile"
                          onClick={(event) =>
                            handleNavClick(event, () => {
                              go("profile");
                              closeAll();
                            })
                          }
                          className={menuItemClass}
                        >
                          <LayoutDashboard className={menuIconClass} />
                          Profile & Dashboard
                        </a>
                        {managedCompanyName && (
                          <a
                            href="/company"
                            onClick={(event) =>
                              handleNavClick(event, () => {
                                go("company");
                                closeAll();
                              })
                            }
                            className={menuItemClass}
                          >
                            <Building2 className={menuIconClass} />
                            <span className="truncate">
                              Manage {managedCompanyName}
                            </span>
                          </a>
                        )}
                        {profile.role === "admin" && (
                          <a
                            href="/admin"
                            onClick={(event) =>
                              handleNavClick(event, () => {
                                go("admin");
                                closeAll();
                              })
                            }
                            className={menuItemClass}
                          >
                            <ShieldCheck className={menuIconClass} />
                            Admin panel
                          </a>
                        )}
                        <button
                          onClick={() => {
                            signOut();
                            closeAll();
                          }}
                          className="group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-[15px] font-medium text-rose-600 transition-colors hover:bg-rose-50"
                        >
                          <LogOut className="h-[18px] w-[18px]" />
                          Sign out
                        </button>
                      </>
                    ) : (
                      <>
                        <a
                          href="/login"
                          onClick={(event) =>
                            handleNavClick(event, () => {
                              onAuth?.("login");
                              closeAll();
                            })
                          }
                          className={menuItemClass}
                        >
                          <LogIn className={menuIconClass} />
                          Sign in
                        </a>
                        <a
                          href="/register"
                          onClick={(event) =>
                            handleNavClick(event, () => {
                              onAuth?.("register");
                              closeAll();
                            })
                          }
                          className={menuItemClass}
                        >
                          <UserPlus className={menuIconClass} />
                          Create account
                        </a>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
            )}

            <button
              onClick={() => {
                setOpenMenu(!openMenu);
                setOpenProfile(false);
              }}
              className="grid h-10 w-10 place-items-center rounded-md border border-ink-200 text-ink-700 transition-colors hover:text-[#2563EB] md:hidden"
              aria-label="Toggle navigation"
              aria-expanded={openMenu}
            >
              {openMenu ? (
                <X className="h-5 w-5" />
              ) : (
                <CandyBoxIcon />
              )}
            </button>
          </div>
        </div>
      </header>
      {/* Outside the header: its backdrop blur would trap a fixed-position child. */}
      <CvRequiredDialog />
    </>
  );
}

/** 3×3 dots ("candy box") menu icon. */
function CandyBoxIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      {[3, 10, 17].flatMap((y) => [3, 10, 17].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2" />))}
    </svg>
  );
}
