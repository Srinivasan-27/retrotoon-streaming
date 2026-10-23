
import { useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, Link } from "react-router-dom";
import { ArrowRight, Play, Tv, Clock, RotateCcw } from "lucide-react";
import Header from "./components/Header";
import SeriesCard from "./components/SeriesCard";
import Auth from "./pages/Auth";
import SeriesPage from "./pages/Series";
import Watch from "./pages/Watch";
import Admin from "./pages/Admin";
import CommunityRequests from "./CommunityRequests";
import { supabase, supabaseReady } from "./lib/supabase";
import { demoSeries } from "./data/demo";
import type { Series } from "./types";

type WatchItem = {
  episode_id: string;
  progress_seconds: number;
  duration_seconds: number | null;
  updated_at: string;
  episode: {
    id: string;
    title: string;
    episode_number: number;
    season: {
      title: string;
      series: {
        title: string;
        slug: string;
        poster_path: string | null;
      };
    };
  };
};

function getSeriesGenres(series: Series): string[] {
  const genres = (series as Series & { genres?: unknown }).genres;
  return Array.isArray(genres) ? genres.filter((genre): genre is string => typeof genre === "string") : [];
}

function GenreTags({
  series,
  onSelectGenre,
}: {
  series: Series;
  onSelectGenre: (genre: string) => void;
}) {
  const genres = getSeriesGenres(series);
  if (!genres.length) return null;

  return (
    <div className="series-genre-tags" aria-label={`${series.title} genres`}>
      {genres.slice(0, 3).map((genre) => (
        <button
          type="button"
          className="series-genre-tag"
          key={genre}
          aria-label={`Show cartoons in the ${genre} genre`}
          title={`Explore ${genre} cartoons`}
          onClick={() => onSelectGenre(genre)}
        >
          {genre}
        </button>
      ))}
    </div>
  );
}

function ContinueWatching() {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      if (!supabaseReady) {
        setLoading(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) return;

      if (!user) {
        setSignedIn(false);
        setLoading(false);
        return;
      }

      setSignedIn(true);

      const { data, error: historyError } = await supabase
        .from("watch_history")
        .select(`
          episode_id,
          progress_seconds,
          duration_seconds,
          updated_at,
          episode:episodes!inner (
            id,
            title,
            episode_number,
            is_published,
            season:seasons!inner (
              title,
              series:cartoon_series!inner (
                title,
                slug,
                poster_path,
                status
              )
            )
          )
        `)
        .eq("user_id", user.id)
        // Completed episodes stay in watch_history but are hidden from this list.
        .eq("completed", false)
        .gt("progress_seconds", 0)
        .order("updated_at", { ascending: false })
        .limit(12);

        console.log("Continue Watching user:", user.id);
        console.log("Continue Watching error:", historyError);
        console.log("Continue Watching data:", data);

      if (!active) return;

      if (historyError) {
        console.error("Continue Watching error details:", {
          message: historyError.message,
          details: historyError.details,
          hint: historyError.hint,
          code: historyError.code,
        });

        setError(historyError.message);
        setLoading(false);
        return;
      }

      const history = (data ?? []) as unknown as WatchItem[];

      const visibleHistory = history.filter((item) => {
        const episode = item.episode as WatchItem["episode"] & {
          is_published?: boolean;
          season: WatchItem["episode"]["season"] & {
            series: WatchItem["episode"]["season"]["series"] & {
              status?: string;
            };
          };
        };

        return (
          episode.is_published !== false &&
          episode.season.series.status !== "draft"
        );
      });

      setItems(visibleHistory);
      setLoading(false);
    }

    loadHistory();

    return () => {
      active = false;
    };
  }, []);

  if (!supabaseReady || (!loading && !signedIn)) return null;
  if (!loading && !error && items.length === 0) return null;

  return (
    <section className="stream-section continue-section">
      <div className="stream-section-head">
        <div>
          <span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span>
          <h2>Continue Watching</h2>
        </div>
        <span className="result-count">
          <Clock size={14} /> YOUR HISTORY
        </span>
      </div>

      {loading ? (
        <p className="muted">Loading your watch history...</p>
      ) : error ? (
        <p className="notice">
          Couldn't load your watch history. Please refresh the page.
        </p>
      ) : (
        <div className="continue-grid">
          {items.map((item) => {
            const episode = item.episode;
            const series = episode.season.series;
            const duration = item.duration_seconds ?? 0;
            const percent = duration > 0
              ? Math.max(
                  0,
                  Math.min(
                    100,
                    Math.round((item.progress_seconds / duration) * 100)
                  )
                )
              : 0;

            const formatTime = (seconds: number) => {
              const safeSeconds = Math.max(0, Math.floor(seconds || 0));
              const hours = Math.floor(safeSeconds / 3600);
              const mins = Math.floor((safeSeconds % 3600) / 60);
              const secs = safeSeconds % 60;

              if (hours > 0) {
                return `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
              }

              return `${mins}:${String(secs).padStart(2, "0")}`;
            };

            return (
              <Link
                to={`/watch/${item.episode_id}`}
                className="continue-card"
                key={item.episode_id}
              >
                <div className="continue-poster">
                  {series.poster_path ? (
                    <img src={series.poster_path} alt={series.title} />
                  ) : (
                    <div className="continue-placeholder">
                      <Tv size={32} />
                    </div>
                  )}

                  <span className="continue-play">
                    <Play size={23} fill="currentColor" />
                  </span>

                  <span className="continue-episode">
                    EP {episode.episode_number}
                  </span>
                </div>

                <div className="continue-info">
                  <span className="continue-series">{series.title}</span>
                  <strong>{episode.title}</strong>
                  <small>
                    {episode.season.title}
                    {" · "}
                    {duration > 0
                      ? `${formatTime(item.progress_seconds)} / ${formatTime(duration)} · ${percent}% watched`
                      : `${formatTime(item.progress_seconds)} watched`}
                  </small>

                  {duration > 0 && (
                    <div
                      className="continue-progress"
                      role="progressbar"
                      aria-label={`${series.title} viewing progress`}
                      aria-valuenow={percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <span style={{ width: `${percent}%` }} />
                    </div>
                  )}

                  <span className="continue-resume">
                    <RotateCcw size={13} /> Resume episode
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Home({ isLoggedIn, isAdmin }: { isLoggedIn: boolean; isAdmin: boolean }) {
  const [series, setSeries] = useState<Series[]>(demoSeries);
  const [query, setQuery] = useState("");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [language, setLanguage] = useState("All");
  const [releaseYear, setReleaseYear] = useState("All");
  const [sortBy, setSortBy] = useState("newest");
  const [selectedGenre, setSelectedGenre] = useState("All");

  useEffect(() => {
    const listener = (e: Event) =>
      setQuery((e as CustomEvent<string>).detail);

    window.addEventListener("retrotoon-search", listener);
    return () => window.removeEventListener("retrotoon-search", listener);
  }, []);

  useEffect(() => {
    if (!supabaseReady) return;

    let active = true;

    (async () => {
      const { data, error } = await supabase
        .from("cartoon_series")
        .select("*")
        .eq("status", "published")
        .order("created_at", { ascending: false });

      if (!error && data && data.length && active) {
        setSeries(data as Series[]);
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user && active) {
        const { data: saved } = await supabase
          .from("watchlist")
          .select("series_id")
          .eq("user_id", user.id);

        if (active) setSavedIds((saved ?? []).map((x) => x.series_id));
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const availableGenres = useMemo(
    () => [...new Set(series.flatMap((item) => getSeriesGenres(item)))].sort((a, b) => a.localeCompare(b)),
    [series]
  );

  const filtered = useMemo(() => {
    const results = series.filter((s) => {
      const searchText = `${s.title} ${s.description ?? ""} ${s.language} ${getSeriesGenres(s).join(" ")}`.toLowerCase();
      const matchesQuery = searchText.includes(query.toLowerCase());
      const matchesLanguage = language === "All" || (s.language || "Tamil").toLowerCase() === language.toLowerCase();
      const matchesYear = releaseYear === "All" || String(s.release_year ?? "") === releaseYear;
      const matchesGenre = selectedGenre === "All" || getSeriesGenres(s).includes(selectedGenre);
      return matchesQuery && matchesLanguage && matchesYear && matchesGenre;
    });
    return results.sort((a, b) => {
      if (sortBy === "az") return a.title.localeCompare(b.title);
      if (sortBy === "oldest") return (a.release_year ?? Infinity) - (b.release_year ?? Infinity);
      return (b.release_year ?? -Infinity) - (a.release_year ?? -Infinity);
    });
  }, [series, query, language, releaseYear, sortBy, selectedGenre]);

  const [featuredIndex, setFeaturedIndex] = useState(0);
  const heroTouchStart = useRef<{ x: number; y: number } | null>(null);
  const featured = series[featuredIndex] ?? series[0];

  useEffect(() => {
    if (series.length <= 1) return;

    const timer = window.setInterval(() => {
      setFeaturedIndex((current) => (current + 1) % series.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [series.length]);

  useEffect(() => {
    setFeaturedIndex((current) =>
      series.length ? current % series.length : 0
    );
  }, [series.length]);

  function changeFeatured(direction: number) {
    setFeaturedIndex(
      (current) => (current + direction + series.length) % series.length
    );
  }

  async function toggleSaved(id: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/auth";
      return;
    }

    if (savedIds.includes(id)) {
      await supabase
        .from("watchlist")
        .delete()
        .eq("user_id", user.id)
        .eq("series_id", id);

      setSavedIds((old) => old.filter((x) => x !== id));
    } else {
      const { error } = await supabase
        .from("watchlist")
        .insert({ user_id: user.id, series_id: id });

      if (!error) setSavedIds((old) => [...old, id]);
    }
  }

  function selectGenre(genre: string) {
    setSelectedGenre(genre);
    document.getElementById("catalogue")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <>
      <section
        className="stream-hero"
        onTouchStart={(event) => {
          const touch = event.changedTouches[0];
          if (touch) heroTouchStart.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={(event) => {
          const start = heroTouchStart.current;
          heroTouchStart.current = null;
          const touch = event.changedTouches[0];
          if (!start || !touch || series.length < 2) return;
          const deltaX = touch.clientX - start.x;
          const deltaY = touch.clientY - start.y;
          // Only treat clearly horizontal gestures as carousel swipes; keep vertical page scrolling natural.
          if (Math.abs(deltaX) >= 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
            changeFeatured(deltaX < 0 ? 1 : -1);
          }
        }}
      >
        <div
          className="stream-hero-bg"
            style={
              featured?.banner_url || featured?.poster_path
                ? {
                     backgroundImage: `linear-gradient(90deg, #0b0b12 0%, rgba(11,11,18,.88) 43%, rgba(11,11,18,.15) 100%), url(${featured.banner_url || featured.poster_path})`,
                  }
                : undefined
          }
        />

        <div className="stream-hero-copy">
          <div className="stream-kicker">
            <span className="live-dot" /> RETROTOON ORIGINAL COLLECTION
          </div>

          <div className="stream-feature-meta">
            <span>FEATURED</span>
            <span>HD</span>
            <span>{featured?.release_year ?? "CLASSICS"}</span>
            <span>{featured?.language ?? "Tamil"}</span>
          </div>

          <h1>{featured?.title ?? "Your childhood, on demand."}</h1>
          <p>
            {featured?.description ??
              "Rediscover the cartoons that made your weekends unforgettable."}
          </p>

          <div className="stream-hero-buttons">
            <Link
              to={featured ? `/series/${featured.slug}` : "#catalogue"}
              className="stream-play"
            >
              <Play size={17} fill="currentColor" /> Watch now
            </Link>
            <a href="#catalogue" className="stream-more">
              <ArrowRight size={17} /> Explore catalogue
            </a>
          </div>
        </div>

        <div className="hero-watermark" aria-hidden="true">
          <span>RT</span>
          <small>REWIND YOUR WORLD</small>
        </div>

        <div className="hero-pagination">
          <button
            type="button"
            aria-label="Previous featured cartoon"
            onClick={() => changeFeatured(-1)}
          >
            ‹
          </button>

          {series.map((item, index) => (
            <button
              type="button"
              key={item.id}
              aria-label={`Feature ${item.title}`}
              className={index === featuredIndex ? "selected" : ""}
              onClick={() => setFeaturedIndex(index)}
            />
          ))}

          <button
            type="button"
            aria-label="Next featured cartoon"
            onClick={() => changeFeatured(1)}
          >
            ›
          </button>

          <span>
            {String(featuredIndex + 1).padStart(2, "0")} /{" "}
            {String(series.length).padStart(2, "0")}
          </span>
        </div>
      </section>

      <main className="page-shell stream-shell">
        <section className="stream-section">
          <div className="stream-section-head">
            <div>
              <span className="eyebrow">FAN FAVOURITES</span>
              <h2>Trending Cartoons</h2>
            </div>
            <span className="result-count">EXPLORE NOW</span>
          </div>

          <div className="stream-carousel">
            {series.slice(0, 6).map((s) => (
              <div className="stream-carousel-item" key={s.id}>
                <SeriesCard
                  series={s}
                  onAdd={toggleSaved}
                  saved={savedIds.includes(s.id)}
                />
                <GenreTags series={s} onSelectGenre={selectGenre} />
              </div>
            ))}
          </div>
        </section>

        <ContinueWatching key={isLoggedIn ? "signed-in" : "signed-out"} />

        <CommunityRequests isLoggedIn={isLoggedIn} isAdmin={isAdmin} />

        {!supabaseReady && (
          <div className="setup-banner">
            Preview mode · Connect Supabase to load your own catalogue and
            enable accounts.
          </div>
        )}

        <section className="stream-section" id="catalogue">
          <div className="stream-section-head">
            <div>
              <span className="eyebrow">PICK YOUR NEXT ADVENTURE</span>
              <h2>Explore the collection</h2>
            </div>
            <span className="result-count">{filtered.length} TITLES</span>
          </div>

          <div className="advanced-search-filters">
  <div className="genre-bar" aria-label="Filter by language">
    {["All", "Tamil", "English", "Japanese"].map((item) => (
      <button
        key={item}
        type="button"
        className={language === item ? "genre-chip active" : "genre-chip"}
        onClick={() => setLanguage(item)}
      >
        {item === "All" ? "All languages" : item}
      </button>
    ))}
  </div>

  <div className="genre-filter-group" aria-label="Filter by genre">
    <span className="filter-caption">Genres</span>
    <div className="genre-bar">
      {["All", ...availableGenres].map((genre) => (
        <button key={genre} type="button"
          className={selectedGenre === genre ? "genre-chip active" : "genre-chip"}
          onClick={() => setSelectedGenre(genre)}>
          {genre === "All" ? "All genres" : genre}
        </button>
      ))}
    </div>
  </div>

  <label className="search-filter">
    <span>Release year</span>
    <select
      value={releaseYear}
      onChange={(e) => setReleaseYear(e.target.value)}
    >
      <option value="All">All years</option>
      {[...new Set(
        series
          .map((s) => s.release_year)
          .filter((year): year is number => year !== null),
      )]
        .sort((a, b) => b - a)
        .map((year) => (
          <option key={year} value={String(year)}>
            {year}
          </option>
        ))}
    </select>
  </label>

  <label className="search-filter">
    <span>Sort by</span>
    <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
      <option value="newest">Newest year</option>
      <option value="oldest">Oldest year</option>
      <option value="az">Title: A–Z</option>
    </select>
  </label>

  <button
    type="button"
    className="genre-chip"
    onClick={() => {
      setQuery("");
      setLanguage("All");
      setSelectedGenre("All");
      setReleaseYear("All");
      setSortBy("newest");
    }}
  >
    Clear filters
  </button>
</div>

          <div className="stream-grid">
            {filtered.map((s, i) => (
              <div
                key={s.id}
                className="stream-card-wrap"
                style={{ animationDelay: `${i * 45}ms` }}
              >
                <SeriesCard
                  series={s}
                  onAdd={toggleSaved}
                  saved={savedIds.includes(s.id)}
                />
                <GenreTags series={s} onSelectGenre={selectGenre} />
              </div>
            ))}
          </div>

          {!filtered.length && (
            <div className="empty-state">
              <h3>No cartoons found</h3>
              <p>Try another title, language, year, or genre.</p>
            </div>
          )}
        </section>

        <section className="stream-section added-section">
          <div className="stream-section-head">
            <div>
              <span className="eyebrow">FRESH FROM THE VAULT</span>
              <h2>Recently added</h2>
            </div>
            <a className="text-link" href="#catalogue">
              Browse all <ArrowRight size={15} />
            </a>
          </div>

          <div className="recent-list">
            {series.slice(0, 4).map((s, i) => (
              <Link
                to={`/series/${s.slug}`}
                className="recent-item"
                key={s.id}
              >
                <span className="recent-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="recent-thumb">
                  {s.poster_path ? (
                    <img src={s.poster_path} alt="" />
                  ) : (
                    <Tv size={23} />
                  )}
                </span>
                <span className="recent-copy">
                  <strong>{s.title}</strong>
                  <small>
                    {s.language || "Classic animation"} ·{" "}
                    {s.release_year ?? "Retro"}
                  </small>
                </span>
                <Play size={16} className="recent-play" />
              </Link>
            ))}
          </div>
        </section>

        
       {!isLoggedIn && (
         <section className="stream-cta">
            <div>
              <span className="eyebrow">KEEP YOUR FAVOURITES CLOSE</span>
              <h2>Your own cartoon shelf.</h2>
              <p>
                Sign in to save series and pick up your nostalgia journey
                whenever you like.
              </p>
            </div>
            <Link to="/auth" className="stream-play">
              Join RetroToon <ArrowRight size={16} />
            </Link>
          </section>
        )}
      </main>
    </>
  );
}

function MyList() {
  const [items, setItems] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState("");
  const [removingIds, setRemovingIds] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

    async function loadList() {
      setLoading(true);
      setError("");

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (!active) return;

      if (userError) {
        setError("Couldn't check your sign-in status. Please refresh and try again.");
        setLoading(false);
        return;
      }

      if (!user) {
        setSignedIn(false);
        setLoading(false);
        return;
      }

      setSignedIn(true);
      const { data, error: listError } = await supabase
        .from("watchlist")
        .select("series_id, cartoon_series(*)")
        .eq("user_id", user.id);

      if (!active) return;
      if (listError) {
        console.error("My List load error:", listError);
        setError("Couldn't load your saved cartoons. Please try again.");
        setLoading(false);
        return;
      }

      const list = (data ?? [])
        .map((item: any) => item.cartoon_series)
        .filter(Boolean) as Series[];
      setItems(list);
      setLoading(false);
    }

    void loadList();
    return () => { active = false; };
  }, []);

  async function removeFromList(seriesId: string) {
    if (removingIds.includes(seriesId)) return;
    setRemovingIds((current) => [...current, seriesId]);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      setError("Your session may have expired. Please sign in again.");
      setRemovingIds((current) => current.filter((id) => id !== seriesId));
      return;
    }

    const { error: removeError } = await supabase
      .from("watchlist")
      .delete()
      .eq("user_id", user.id)
      .eq("series_id", seriesId);

    if (removeError) {
      console.error("My List remove error:", removeError);
      setError("Couldn't remove that cartoon. Please try again.");
    } else {
      setItems((current) => current.filter((series) => series.id !== seriesId));
      setError("");
    }
    setRemovingIds((current) => current.filter((id) => id !== seriesId));
  }

  return (
    <main className="page-shell my-list-page">
      <div className="my-list-heading">
        <div>
          <span className="eyebrow">YOUR PERSONAL COLLECTION</span>
          <h1 className="page-title">My List<span className="brand-accent">.</span></h1>
          <p className="my-list-subtitle">Your saved cartoons, all in one place.</p>
        </div>
        {!loading && signedIn && items.length > 0 && (
          <span className="result-count">{items.length} {items.length === 1 ? "TITLE" : "TITLES"} SAVED</span>
        )}
      </div>

      {error && <p className="notice" role="alert">{error}</p>}

      {loading ? (
        <div className="my-list-state" role="status">
          <span className="my-list-loader" aria-hidden="true" />
          <p>Loading your saved cartoons...</p>
        </div>
      ) : !signedIn ? (
        <div className="empty-state my-list-empty">
          <span className="my-list-empty-icon" aria-hidden="true">♡</span>
          <h3>Your cartoon shelf is waiting</h3>
          <p>Sign in to see your saved series and keep your favourites together.</p>
          <Link to="/auth" className="primary-button">Sign in / create account</Link>
        </div>
      ) : items.length > 0 ? (
        <div className="series-grid my-list-grid">
          {items.map((series) => (
            <div className="my-list-card" key={series.id}>
              <SeriesCard
                series={series}
                saved
                onAdd={() => void removeFromList(series.id)}
              />
              {removingIds.includes(series.id) && <span className="my-list-card-status">Removing...</span>}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state my-list-empty">
          <span className="my-list-empty-icon" aria-hidden="true">♡</span>
          <h3>Your list is empty</h3>
          <p>When you find a cartoon you love, tap the + button to save it here.</p>
          <Link to="/#catalogue" className="primary-button">Explore cartoons</Link>
        </div>
      )}
    </main>
  );
}

export default function App() {
  const [, setQuery] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    let active = true;

    
async function checkAdmin(userId?: string) {
  if (!userId) {
    if (active) {
      setIsLoggedIn(false);
      setIsAdmin(false);
    }
    return;
  }

  if (active) {
    setIsLoggedIn(true);
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (active) {
    setIsAdmin(!error && data?.role === "admin");
  }
}


    supabase.auth.getUser().then(({ data }) => {
      void checkAdmin(data.user?.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void checkAdmin(session?.user?.id);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);


  return (
    <div className="app-shell">
      <Header onSearch={setQuery} />

      <Routes>
        <Route path="/" element={<Home isLoggedIn={isLoggedIn} isAdmin={isAdmin} />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/series/:slug" element={<SeriesPage />} />
        <Route path="/watch/:episodeId" element={<Watch />} />
        <Route path="/my-list" element={<MyList />} />
        <Route path="/admin" element={<Admin />} />
        <Route
          path="*"
          element={
            <main className="page-shell">
              <h1>Page not found</h1>
              <Link to="/">Return home</Link>
            </main>
          }
        />
      </Routes>

      <footer className="site-footer">
        <Link to="/" className="brand footer-brand">
          <span className="brand-icon">
            <Tv size={18} />
          </span>
          <span>
            RETRO<span className="brand-accent">TOON</span>
            <small>PRESS PLAY ON NOSTALGIA</small>
          </span>
        </Link>

        <p>
          Made for the love of animation. Stream only content you are
          authorized to share.
        </p>
        {isAdmin && <Link to="/admin">Admin studio</Link>}
      </footer>
    </div>
  );
}
