
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  PlusCircle,
  UploadCloud,
  ShieldAlert,
  Film,
  Layers,
  Link as LinkIcon,
  RefreshCw,
  Eye,
  EyeOff,
  Trash2,
  Pencil,
  Save,
  X,
  Users,
  Bookmark,
  TrendingUp,
  PlayCircle,
} from "lucide-react";
import { supabase, supabaseReady } from "../lib/supabase";

const GENRE_OPTIONS = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Drama",
  "Fantasy",
  "Horror",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Superhero",
  "Thriller",
];

type SeriesRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  release_year: number | null;
  language: string;
  status: "draft" | "published";
  poster_path: string | null;
  banner_url: string | null;
  genres: string[];
};

type SeasonRow = {
  id: string;
  title: string;
  season_number: number;
};

type EpisodeRow = {
  id: string;
  title: string;
  episode_number: number;
  storage_path: string | null;
  is_published: boolean;
};

function isYouTubeUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtube-nocookie.com", "youtube-nocookie.com"].includes(url.hostname) &&
      (url.hostname.includes("youtube") || url.hostname === "youtu.be")
    );
  } catch {
    return false;
  }
}

type AnalyticsSnapshot = {
  users: number;
  savedSeries: number;
  historyEntries: number;
  completedEntries: number;
  topSeries: { id: string; title: string; count: number }[];
  dailyActivity: { label: string; count: number }[];
  loadedAt: string;
};

type HistoryAnalyticsRow = {
  updated_at: string;
  completed: boolean | null;
  episode?: {
    season?: {
      series?: { id?: string; title?: string };
    };
  } | null;
};

export default function Admin() {
  const [admin, setAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [activeSection, setActiveSection] = useState<"dashboard" | "create" | "manage">("dashboard");

  const [seriesRows, setSeriesRows] = useState<SeriesRow[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSnapshot | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [seriesSearch, setSeriesSearch] = useState("");
  const [seriesStatusFilter, setSeriesStatusFilter] = useState<"all" | "published" | "draft">("all");
  const [seasonRows, setSeasonRows] = useState<SeasonRow[]>([]);
  const [episodeRows, setEpisodeRows] = useState<EpisodeRow[]>([]);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [year, setYear] = useState("1998");
  const [language, setLanguage] = useState("Tamil");
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [genres, setGenres] = useState<string[]>([]);
  const [bannerFile, setBannerFile] = useState<File | null>(null);

  const [editingSeriesId, setEditingSeriesId] = useState<string | null>(null);
  const [editSeriesTitle, setEditSeriesTitle] = useState("");
  const [editSeriesSlug, setEditSeriesSlug] = useState("");
  const [editSeriesDescription, setEditSeriesDescription] = useState("");
  const [editSeriesYear, setEditSeriesYear] = useState("");
  const [editSeriesLanguage, setEditSeriesLanguage] = useState("");
  const [editSeriesGenres, setEditSeriesGenres] = useState<string[]>([]);

  const [editingEpisodeId, setEditingEpisodeId] = useState<string | null>(null);
  const [editEpisodeTitle, setEditEpisodeTitle] = useState("");
  const [editEpisodeNumber, setEditEpisodeNumber] = useState("1");
  const [editEpisodeUrl, setEditEpisodeUrl] = useState("");

  const [seriesId, setSeriesId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [episodeTitle, setEpisodeTitle] = useState("");
  const [episodeNumber, setEpisodeNumber] = useState("1");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const loadSeries = useCallback(async () => {
    const { data, error } = await supabase
      .from("cartoon_series")
      .select("id,title,slug,description,release_year,language,status,poster_path,banner_url,genres")
      .order("title");

    if (error) {
      setNotice(`Could not load cartoons: ${error.message}`);
      return;
    }

    setSeriesRows((data ?? []) as SeriesRow[]);
  }, []);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    setAnalyticsError("");

    try {
      const [usersResult, watchlistResult, historyCountResult, historyRowsResult] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("watchlist").select("series_id", { count: "exact", head: true }),
        supabase.from("watch_history").select("episode_id", { count: "exact", head: true }),
        supabase
          .from("watch_history")
          .select(`updated_at, completed, episode:episodes!inner(season:seasons!inner(series:cartoon_series!inner(id,title)))`)
          .order("updated_at", { ascending: false })
          .limit(1000),
      ]);

      const firstError = usersResult.error || watchlistResult.error || historyCountResult.error || historyRowsResult.error;
      if (firstError) throw firstError;

      const rows = (historyRowsResult.data ?? []) as unknown as HistoryAnalyticsRow[];
      const start = new Date();
      start.setUTCHours(0, 0, 0, 0);
      start.setUTCDate(start.getUTCDate() - 6);
      const dailyActivity = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(start);
        date.setUTCDate(start.getUTCDate() + index);
        return {
          key: date.toISOString().slice(0, 10),
          label: date.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }),
          count: 0,
        };
      });
      const dayIndex = new Map(dailyActivity.map((day, index) => [day.key, index]));
      const seriesCounts = new Map<string, { id: string; title: string; count: number }>();
      let completedEntries = 0;

      for (const row of rows) {
        if (row.completed) completedEntries += 1;
        const series = row.episode?.season?.series;
        if (series?.id && series.title) {
          const current = seriesCounts.get(series.id) ?? { id: series.id, title: series.title, count: 0 };
          current.count += 1;
          seriesCounts.set(series.id, current);
        }
        const key = row.updated_at?.slice(0, 10);
        const index = key ? dayIndex.get(key) : undefined;
        if (index !== undefined) dailyActivity[index].count += 1;
      }

      setAnalytics({
        users: usersResult.count ?? 0,
        savedSeries: watchlistResult.count ?? 0,
        historyEntries: historyCountResult.count ?? 0,
        completedEntries,
        topSeries: [...seriesCounts.values()].sort((a, b) => b.count - a.count).slice(0, 5),
        dailyActivity: dailyActivity.map(({ label, count }) => ({ label, count })),
        loadedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
    } catch (error) {
      setAnalyticsError(error instanceof Error ? error.message : "Could not load analytics.");
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  const loadSeasons = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("seasons")
      .select("id,title,season_number")
      .eq("series_id", id)
      .order("season_number");

    if (error) {
      setNotice(`Could not load seasons: ${error.message}`);
      return;
    }

    setSeasonRows((data ?? []) as SeasonRow[]);
  }, []);

  const loadEpisodes = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("episodes")
      .select("id,title,episode_number,storage_path,is_published")
      .eq("season_id", id)
      .order("episode_number");

    if (error) {
      setNotice(`Could not load episodes: ${error.message}`);
      return;
    }

    setEpisodeRows((data ?? []) as EpisodeRow[]);
  }, []);

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!active) return;

        if (!user) {
          setAdmin(false);
          return;
        }

        const { data: profile, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (!active) return;

        if (error) {
          setNotice(`Could not verify admin role: ${error.message}`);
          setAdmin(false);
          return;
        }

        const isAdmin = profile?.role === "admin";
        setAdmin(isAdmin);

        if (isAdmin) {
          await Promise.all([loadSeries(), loadAnalytics()]);
        }
      } catch {
        if (active) {
          setAdmin(false);
          setNotice("Could not verify your account. Please sign in again.");
        }
      } finally {
        if (active) setCheckingAdmin(false);
      }
    }

    initialize();

    return () => {
      active = false;
    };
  }, [loadSeries, loadAnalytics]);

  async function uploadPoster(fileToUpload: File, seriesKey: string) {
    if (!fileToUpload.type.startsWith("image/")) {
      throw new Error("Choose an image file such as JPG, PNG, or WebP.");
    }
    if (fileToUpload.size > 5 * 1024 * 1024) {
      throw new Error("Poster images must be 5 MB or smaller.");
    }

    const extension = fileToUpload.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${seriesKey}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("posters")
      .upload(path, fileToUpload, {
        contentType: fileToUpload.type,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from("posters").getPublicUrl(path);
    return data.publicUrl;
  }

  async function uploadBanner(fileToUpload: File, seriesKey: string) {
    if (!fileToUpload.type.startsWith("image/")) {
      throw new Error("Choose a banner image file such as JPG, PNG, or WebP.");
    }
    if (fileToUpload.size > 5 * 1024 * 1024) {
      throw new Error("Banner images must be 5 MB or smaller.");
    }

    const extension = fileToUpload.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${seriesKey}/banners/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("posters")
      .upload(path, fileToUpload, {
        contentType: fileToUpload.type,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from("posters").getPublicUrl(path);
    return data.publicUrl;
  }

  async function replaceSeriesBanner(series: SeriesRow, selectedFile: File | null) {
    if (!selectedFile) {
      setNotice("Choose a banner image first.");
      return;
    }

    setBusy(true);
    setNotice("");
    try {
      const publicUrl = await uploadBanner(selectedFile, series.id);
      const { error } = await supabase
        .from("cartoon_series")
        .update({ banner_url: publicUrl })
        .eq("id", series.id);

      if (error) throw error;

      setSeriesRows((old) =>
        old.map((item) =>
          item.id === series.id ? { ...item, banner_url: publicUrl } : item
        )
      );
      setNotice(`Hero banner updated for "${series.title}".`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setNotice(`Banner upload failed: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function replaceSeriesPoster(series: SeriesRow, selectedFile: File | null) {
    if (!selectedFile) {
      setNotice("Choose a poster image first.");
      return;
    }

    setBusy(true);
    setNotice("");
    try {
      const publicUrl = await uploadPoster(selectedFile, series.id);
      const { error } = await supabase
        .from("cartoon_series")
        .update({ poster_path: publicUrl })
        .eq("id", series.id);

      if (error) throw error;

      setSeriesRows((old) =>
        old.map((item) =>
          item.id === series.id ? { ...item, poster_path: publicUrl } : item
        )
      );
      setNotice(`Poster updated for "${series.title}".`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setNotice(`Poster upload failed: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function createSeries(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setNotice("");

    let posterUrl: string | null = null;
    let bannerUrl: string | null = null;

    try {
      // Upload selected images before creating the series row.
      // The slug is used as a temporary folder key because the database ID is not known yet.
      if (posterFile) {
        posterUrl = await uploadPoster(posterFile, slug.trim());
      }
      if (bannerFile) {
        bannerUrl = await uploadBanner(bannerFile, slug.trim());
      }

      const { data, error } = await supabase
        .from("cartoon_series")
        .insert({
          id: crypto.randomUUID(),
          title: title.trim(),
          slug: slug.trim(),
          description: description.trim(),
          release_year: year ? Number(year) : null,
          language: language.trim(),
          status: "published",
          poster_path: posterUrl,
          genres,
          banner_url: bannerUrl,
        })
        .select("id,title,slug,description,release_year,language,status,poster_path,banner_url,genres")
        .single();

      if (error) throw error;

      setSeriesRows((old) =>
        [...old, data as SeriesRow].sort((a, b) => a.title.localeCompare(b.title))
      );

      setTitle("");
      setSlug("");
      setDescription("");
      setYear("1998");
      setLanguage("Tamil");
      setGenres([]);
      setPosterFile(null);
      setBannerFile(null);
      setNotice(`"${data.title}" created successfully.`);
      setSeriesId(data.id);
      setSeasonId("");
      setSeasonRows([]);
      setEpisodeRows([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setNotice(`Could not create series: ${message}`);
    } finally {
      setBusy(false);
    }

  }

  function beginEditSeries(series: SeriesRow) {
    setEditingSeriesId(series.id);
    setEditSeriesTitle(series.title);
    setEditSeriesSlug(series.slug);
    setEditSeriesDescription(series.description ?? "");
    setEditSeriesYear(series.release_year == null ? "" : String(series.release_year));
    setEditSeriesLanguage(series.language);
    setEditSeriesGenres(series.genres ?? []);
    setNotice("");
  }

  async function saveSeriesEdits(series: SeriesRow) {
    const cleanTitle = editSeriesTitle.trim();
    const cleanSlug = editSeriesSlug.trim();
    const cleanLanguage = editSeriesLanguage.trim();
    if (!cleanTitle || !cleanSlug || !cleanLanguage) {
      setNotice("Series title, URL slug and language are required.");
      return;
    }
    const parsedYear = editSeriesYear.trim() ? Number(editSeriesYear) : null;
    if (parsedYear !== null && (!Number.isInteger(parsedYear) || parsedYear < 1900 || parsedYear > 2100)) {
      setNotice("Enter a valid release year between 1900 and 2100, or leave it blank.");
      return;
    }

    setBusy(true);
    setNotice("");
    try {
      const { data, error } = await supabase
        .from("cartoon_series")
        .update({
          title: cleanTitle,
          slug: cleanSlug,
          description: editSeriesDescription.trim() || null,
          release_year: parsedYear,
          language: cleanLanguage,
          genres: editSeriesGenres,
        })
        .eq("id", series.id)
        .select("id,title,slug,description,release_year,language,status,poster_path,banner_url,genres")
        .single();
      if (error) throw error;
      setSeriesRows((old) => old.map((item) => item.id === series.id ? data as SeriesRow : item).sort((a, b) => a.title.localeCompare(b.title)));
      setEditingSeriesId(null);
      setNotice(`Changes saved for "${cleanTitle}".`);
    } catch (error) {
      setNotice(`Could not update series: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setBusy(false);
    }
  }

  function beginEditEpisode(episode: EpisodeRow) {
    setEditingEpisodeId(episode.id);
    setEditEpisodeTitle(episode.title);
    setEditEpisodeNumber(String(episode.episode_number));
    setEditEpisodeUrl(episode.storage_path ?? "");
    setNotice("");
  }

  async function saveEpisodeEdits(episode: EpisodeRow) {
    const cleanTitle = editEpisodeTitle.trim();
    const number = Number(editEpisodeNumber);
    const cleanUrl = editEpisodeUrl.trim();
    if (!cleanTitle || !Number.isInteger(number) || number < 1) {
      setNotice("Enter an episode title and a whole episode number of 1 or higher.");
      return;
    }
    if (cleanUrl && (cleanUrl.startsWith("http://") || cleanUrl.startsWith("https://")) && !isYouTubeUrl(cleanUrl)) {
      setNotice("For online video URLs, enter a valid YouTube URL. Uploaded video paths can be left unchanged.");
      return;
    }
    if (!cleanUrl) {
      setNotice("Video URL or storage path cannot be empty.");
      return;
    }

    setBusy(true);
    setNotice("");
    try {
      const { data, error } = await supabase
        .from("episodes")
        .update({ title: cleanTitle, episode_number: number, storage_path: cleanUrl })
        .eq("id", episode.id)
        .select("id,title,episode_number,storage_path,is_published")
        .single();
      if (error) throw error;
      setEpisodeRows((old) => old.map((item) => item.id === episode.id ? data as EpisodeRow : item).sort((a, b) => a.episode_number - b.episode_number));
      setEditingEpisodeId(null);
      setNotice(`Changes saved for episode "${cleanTitle}".`);
    } catch (error) {
      setNotice(`Could not update episode: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setBusy(false);
    }
  }

  async function selectSeries(id: string) {
    setSeriesId(id);
    setSeasonId("");
    setSeasonRows([]);
    setEpisodeRows([]);
    setNotice("");

    if (id) await loadSeasons(id);
  }

  async function selectSeason(id: string) {
    setSeasonId(id);
    setEpisodeRows([]);
    setNotice("");

    if (id) await loadEpisodes(id);
  }

  async function createSeason() {
    if (!seriesId) {
      setNotice("Choose a cartoon first.");
      return;
    }

    setBusy(true);
    setNotice("");

    const nextNumber =
      Math.max(0, ...seasonRows.map((season) => season.season_number)) + 1;

    const { data, error } = await supabase
      .from("seasons")
      .insert({
        series_id: seriesId,
        season_number: nextNumber,
        title: `Season ${nextNumber}`,
      })
      .select("id,title,season_number")
      .single();

    setBusy(false);

    if (error) {
      setNotice(`Could not create season: ${error.message}`);
      return;
    }

    setSeasonRows((old) => [...old, data as SeasonRow]);
    setSeasonId(data.id);
    setEpisodeRows([]);
    setNotice(`${data.title} created successfully.`);
  }

  async function createEpisode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!seasonId) {
      setNotice("Choose a season first.");
      return;
    }

    const url = youtubeUrl.trim();

    if (url && !isYouTubeUrl(url)) {
      setNotice("Enter a valid YouTube video URL.");
      return;
    }

    if (!url && !file) {
      setNotice("Enter a YouTube URL or choose a video file.");
      return;
    }

    if (file && file.size > 100 * 1024 * 1024) {
      setNotice("The upload limit is 100 MB. Use a video hosting service for larger files.");
      return;
    }

    setBusy(true);
    setNotice("");

    let storagePath = url;

    if (!url && file) {
      const extension = file.name.split(".").pop()?.toLowerCase() || "mp4";
      const path = `${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("episodes")
        .upload(path, file, {
          contentType: file.type || "video/mp4",
          upsert: false,
        });

      if (uploadError) {
        setBusy(false);
        setNotice(`Video upload failed: ${uploadError.message}`);
        return;
      }

      storagePath = path;
    }

    const { data, error } = await supabase
      .from("episodes")
      .insert({
        season_id: seasonId,
        episode_number: Number(episodeNumber),
        title: episodeTitle.trim(),
        storage_path: storagePath,
        is_published: true,
      })
      .select("id,title,episode_number,storage_path,is_published")
      .single();

    setBusy(false);

    if (error) {
      setNotice(
        `The video may have uploaded, but saving the episode failed: ${error.message}`
      );
      return;
    }

    setEpisodeRows((old) =>
      [...old, data as EpisodeRow].sort(
        (a, b) => a.episode_number - b.episode_number
      )
    );

    setEpisodeTitle("");
    setEpisodeNumber(String(Number(episodeNumber) + 1));
    setYoutubeUrl("");
    setFile(null);

    setNotice("Episode created and published successfully.");
  }

  async function deleteEpisode(episode: EpisodeRow) {
    if (!window.confirm(`Delete episode E${episode.episode_number}: "${episode.title}"? This cannot be undone.`)) return;

    setBusy(true);
    setNotice("");
    try {
      const { error: historyError } = await supabase
        .from("watch_history")
        .delete()
        .eq("episode_id", episode.id);
      if (historyError) throw historyError;

      const { error } = await supabase.from("episodes").delete().eq("id", episode.id);
      if (error) throw error;

      setEpisodeRows((old) => old.filter((item) => item.id !== episode.id));
      setNotice(`Episode "${episode.title}" deleted.`);
    } catch (error) {
      setNotice(`Could not delete episode: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteSeries(series: SeriesRow) {
    if (!window.confirm(`Delete "${series.title}" and all its seasons and episodes? Related watchlist entries and watch history will also be removed. This cannot be undone.`)) return;

    setBusy(true);
    setNotice("");
    try {
      const { data: seasons, error: seasonsError } = await supabase
        .from("seasons").select("id").eq("series_id", series.id);
      if (seasonsError) throw seasonsError;

      const seasonIds = (seasons ?? []).map((row) => row.id as string);
      if (seasonIds.length) {
        const { data: episodes, error: episodesError } = await supabase
          .from("episodes").select("id").in("season_id", seasonIds);
        if (episodesError) throw episodesError;

        const episodeIds = (episodes ?? []).map((row) => row.id as string);
        if (episodeIds.length) {
          const { error: historyError } = await supabase
            .from("watch_history").delete().in("episode_id", episodeIds);
          if (historyError) throw historyError;

          const { error: deleteEpisodesError } = await supabase
            .from("episodes").delete().in("id", episodeIds);
          if (deleteEpisodesError) throw deleteEpisodesError;
        }

        const { error: deleteSeasonsError } = await supabase
          .from("seasons").delete().in("id", seasonIds);
        if (deleteSeasonsError) throw deleteSeasonsError;
      }

      const { error: watchlistError } = await supabase
        .from("watchlist").delete().eq("series_id", series.id);
      if (watchlistError) throw watchlistError;

      const { error } = await supabase.from("cartoon_series").delete().eq("id", series.id);
      if (error) throw error;

      setSeriesRows((old) => old.filter((item) => item.id !== series.id));
      if (seriesId === series.id) {
        setSeriesId("");
        setSeasonId("");
        setSeasonRows([]);
        setEpisodeRows([]);
      }
      setNotice(`"${series.title}" and its seasons/episodes were deleted.`);
    } catch (error) {
      setNotice(`Could not delete series: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleSeriesStatus(series: SeriesRow) {
    const nextStatus =
      series.status === "published" ? "draft" : "published";

    setNotice("");

    const { error } = await supabase
      .from("cartoon_series")
      .update({ status: nextStatus })
      .eq("id", series.id);

    if (error) {
      setNotice(`Could not update series: ${error.message}`);
      return;
    }

    setSeriesRows((old) =>
      old.map((item) =>
        item.id === series.id ? { ...item, status: nextStatus } : item
      )
    );

    setNotice(
      `"${series.title}" is now ${nextStatus === "published" ? "published" : "a draft"}.`
    );
  }

  async function toggleEpisodeStatus(episode: EpisodeRow) {
    const nextStatus = !episode.is_published;

    const { error } = await supabase
      .from("episodes")
      .update({ is_published: nextStatus })
      .eq("id", episode.id);

    if (error) {
      setNotice(`Could not update episode: ${error.message}`);
      return;
    }

    setEpisodeRows((old) =>
      old.map((item) =>
        item.id === episode.id
          ? { ...item, is_published: nextStatus }
          : item
      )
    );

    setNotice(
      `"${episode.title}" is now ${nextStatus ? "published" : "unpublished"}.`
    );
  }

  if (!supabaseReady) {
    return (
      <main className="page-shell">
        <h1>Admin studio</h1>
        <p className="notice">
          Configure Supabase in .env.local before using admin tools.
        </p>
      </main>
    );
  }

  const activityMax = Math.max(1, ...(analytics?.dailyActivity.map((day) => day.count) ?? [0]));
  const topSeriesMax = Math.max(1, ...(analytics?.topSeries.map((series) => series.count) ?? [0]));

  const publishedCount = seriesRows.filter((series) => series.status === "published").length;
  const draftCount = seriesRows.filter((series) => series.status === "draft").length;
  const genreCount = new Set(seriesRows.flatMap((series) => series.genres ?? [])).size;
  const filteredSeriesRows = seriesRows.filter((series) => {
    const term = seriesSearch.trim().toLowerCase();
    const matchesSearch = !term || `${series.title} ${series.slug} ${series.language} ${(series.genres ?? []).join(" ")}`.toLowerCase().includes(term);
    const matchesStatus = seriesStatusFilter === "all" || series.status === seriesStatusFilter;
    return matchesSearch && matchesStatus;
  });

  if (checkingAdmin) {
    return (
      <main className="page-shell">
        <p className="muted">Checking admin access...</p>
      </main>
    );
  }

  if (!admin) {
    return (
      <main className="page-shell admin-gate">
        <ShieldAlert size={32} />
        <h1>Admin access required</h1>
        <p className="muted">
          Sign in with your authorized admin account. If you are already
          signed in, verify your role in the profiles table.
        </p>
        {notice && <p className="notice">{notice}</p>}
        <code>
          update public.profiles set role = 'admin' where id = 'YOUR_AUTH_USER_UUID';
        </code>
      </main>
    );
  }

  return (
    <main className="page-shell admin-page">
      <span className="eyebrow">RETROTOON · CONTROL ROOM</span>
      <h1>
        Admin dashboard<span className="brand-accent">.</span>
      </h1>
      <p className="muted">
        Manage your cartoon catalogue, seasons and episodes.
      </p>

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      <nav className="admin-section-nav" aria-label="Admin studio sections">
        <button type="button" className={activeSection === "dashboard" ? "admin-section-tab active" : "admin-section-tab"} aria-current={activeSection === "dashboard" ? "page" : undefined} onClick={() => setActiveSection("dashboard")}>
          <TrendingUp size={16} /> Dashboard & Analytics
        </button>
        <button type="button" className={activeSection === "create" ? "admin-section-tab active" : "admin-section-tab"} aria-current={activeSection === "create" ? "page" : undefined} onClick={() => setActiveSection("create")}>
          <PlusCircle size={16} /> Create Content
        </button>
        <button type="button" className={activeSection === "manage" ? "admin-section-tab active" : "admin-section-tab"} aria-current={activeSection === "manage" ? "page" : undefined} onClick={() => setActiveSection("manage")}>
          <Pencil size={16} /> Manage Content
        </button>
      </nav>

      {activeSection === "dashboard" && <section className="admin-dashboard-panel" aria-label="Dashboard and analytics">
      <div className="admin-dashboard-intro">
        <div>
          <span className="admin-overview-label">CONTENT OVERVIEW</span>
          <p className="muted">A quick snapshot of your catalogue. Counts update when content changes.</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => void Promise.all([loadSeries(), loadAnalytics()])} disabled={busy || analyticsLoading}>
          <RefreshCw size={15} /> {analyticsLoading ? "Refreshing…" : "Refresh dashboard"}
        </button>
      </div>

      <div className="admin-stats">
        <div className="form-card admin-stat-card">
          <span className="admin-stat-icon"><Film size={20} /></span>
          <p className="muted">Total cartoons</p>
          <h2>{seriesRows.length}</h2>
          <small>All catalogue titles</small>
        </div>
        <div className="form-card admin-stat-card">
          <span className="admin-stat-icon"><Eye size={20} /></span>
          <p className="muted">Published</p>
          <h2>{publishedCount}</h2>
          <small>Visible to visitors</small>
        </div>
        <div className="form-card admin-stat-card">
          <span className="admin-stat-icon"><EyeOff size={20} /></span>
          <p className="muted">Drafts</p>
          <h2>{draftCount}</h2>
          <small>Not publicly listed</small>
        </div>
        <div className="form-card admin-stat-card">
          <span className="admin-stat-icon"><Layers size={20} /></span>
          <p className="muted">Genres used</p>
          <h2>{genreCount}</h2>
          <small>Unique genres across titles</small>
        </div>
      </div>

      <section className="admin-analytics-section" aria-labelledby="analytics-heading">
        <div className="admin-analytics-heading">
          <div>
            <span className="admin-overview-label">AUDIENCE & ENGAGEMENT</span>
            <h2 id="analytics-heading">Advanced analytics</h2>
            <p className="muted">Based on your Supabase profiles, watchlist and watch history.</p>
          </div>
          {analytics?.loadedAt && <span className="admin-analytics-updated">Updated {analytics.loadedAt}</span>}
        </div>

        {analyticsError && <p className="notice" role="alert">Analytics could not be loaded: {analyticsError}. Check the table access policies and column names in Supabase.</p>}

        <div className="admin-analytics-kpis">
          <div className="form-card admin-analytics-kpi">
            <span className="admin-stat-icon"><Users size={19} /></span>
            <p className="muted">Registered profiles</p>
            <strong>{analyticsLoading && !analytics ? "…" : (analytics?.users ?? "—")}</strong>
            <small>Rows visible in profiles</small>
          </div>
          <div className="form-card admin-analytics-kpi">
            <span className="admin-stat-icon"><Bookmark size={19} /></span>
            <p className="muted">Saved series</p>
            <strong>{analyticsLoading && !analytics ? "…" : (analytics?.savedSeries ?? "—")}</strong>
            <small>Total watchlist entries</small>
          </div>
          <div className="form-card admin-analytics-kpi">
            <span className="admin-stat-icon"><PlayCircle size={19} /></span>
            <p className="muted">History entries</p>
            <strong>{analyticsLoading && !analytics ? "…" : (analytics?.historyEntries ?? "—")}</strong>
            <small>Saved user/episode progress rows</small>
          </div>
          <div className="form-card admin-analytics-kpi">
            <span className="admin-stat-icon"><TrendingUp size={19} /></span>
            <p className="muted">Completed entries</p>
            <strong>{analyticsLoading && !analytics ? "…" : (analytics?.completedEntries ?? "—")}</strong>
            <small>Completed rows in the latest 1,000 history records</small>
          </div>
        </div>

        <div className="admin-analytics-grid">
          <div className="form-card admin-chart-card">
            <div className="admin-chart-title">
              <div><h3>Watch-history activity</h3><p className="muted">History rows updated per day · last 7 days</p></div>
              <span className="admin-chart-total">{analytics?.dailyActivity.reduce((sum, day) => sum + day.count, 0) ?? 0}</span>
            </div>
            {analyticsLoading && !analytics ? <p className="muted">Loading activity…</p> : (
              <div className="admin-bar-chart" role="img" aria-label="Watch history updates over the last seven days">
                {(analytics?.dailyActivity ?? []).map((day) => (
                  <div className="admin-bar-column" key={day.label}>
                    <span className="admin-bar-value">{day.count}</span>
                    <div className="admin-bar-track"><span style={{ height: `${Math.max(day.count > 0 ? 8 : 0, (day.count / activityMax) * 100)}%` }} /></div>
                    <small>{day.label}</small>
                  </div>
                ))}
              </div>
            )}
            <p className="admin-chart-note">This reflects saved progress updates in the latest 1,000 history rows, not precise play sessions or unique visitors.</p>
          </div>

          <div className="form-card admin-chart-card">
            <div className="admin-chart-title">
              <div><h3>Most tracked cartoons</h3><p className="muted">Titles with the most watch-history entries</p></div>
            </div>
            {analyticsLoading && !analytics ? <p className="muted">Loading titles…</p> : !analytics?.topSeries.length ? <p className="muted">No watch-history data yet. Activity will appear after viewers watch episodes.</p> : (
              <div className="admin-top-series">
                {analytics.topSeries.map((series, index) => (
                  <div className="admin-top-series-row" key={series.id}>
                    <span className="admin-top-rank">{String(index + 1).padStart(2, "0")}</span>
                    <div className="admin-top-series-main"><div className="admin-top-series-meta"><strong>{series.title}</strong><small>{series.count} entries</small></div><div className="admin-top-track"><span style={{ width: `${(series.count / topSeriesMax) * 100}%` }} /></div></div>
                  </div>
                ))}
              </div>
            )}
            <p className="admin-chart-note">Ranking uses the most recent 1,000 history rows returned by Supabase.</p>
          </div>
        </div>
      </section>
      </section>}

      <div className="admin-grid">
        {activeSection === "create" && <form className="form-card stack-form" onSubmit={createSeries}>
          <h2>
            <PlusCircle /> New cartoon series
          </h2>

          <label>
            Series title
            <input
              required
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setSlug(
                  e.target.value
                    .toLowerCase()
                    .trim()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, "")
                );
              }}
              placeholder="My classic cartoon"
            />
          </label>

          <label>
            URL slug
            <input
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="my-classic-cartoon"
            />
          </label>

          <label>
            Description
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <div className="two-fields">
            <label>
              Release year
              <input
                type="number"
                min="1900"
                max="2100"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </label>
            <label>
              Language
              <input
                required
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              />
            </label>
          </div>

          <fieldset className="genre-picker" disabled={busy}>
            <legend>Genres</legend>
            <p className="muted">Choose one or more genres.</p>
            <div className="genre-options">
              {GENRE_OPTIONS.map((genre) => (
                <label key={genre} className="genre-option">
                  <input
                    type="checkbox"
                    checked={genres.includes(genre)}
                    onChange={(e) =>
                      setGenres((current) =>
                        e.target.checked
                          ? [...current, genre]
                          : current.filter((item) => item !== genre)
                      )
                    }
                  />
                  {genre}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="file-drop">
            <UploadCloud size={22} />
            <span>
              {posterFile ? posterFile.name : "Choose poster image (optional, max 5 MB)"}
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => setPosterFile(e.target.files?.[0] ?? null)}
              disabled={busy}
            />
          </label>

          <label className="file-drop">
            <UploadCloud size={22} />
            <span>
              {bannerFile ? bannerFile.name : "Choose hero banner (optional, landscape image, max 5 MB)"}
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => setBannerFile(e.target.files?.[0] ?? null)}
              disabled={busy}
            />
          </label>

          <button className="primary-button" disabled={busy}>
            {busy ? "Please wait..." : "Create series"}
          </button>
        </form>}

        {activeSection === "manage" && <>
        <section className="form-card stack-form">
          <h2>
            <Film /> Existing cartoons
          </h2>

          <div className="admin-catalogue-tools">
            <label className="admin-search-label">
              <span>Search cartoons</span>
              <input
                type="search"
                value={seriesSearch}
                onChange={(e) => setSeriesSearch(e.target.value)}
                placeholder="Title, language, genre..."
              />
            </label>
            <label className="admin-search-label">
              <span>Publication status</span>
              <select
                value={seriesStatusFilter}
                onChange={(e) => setSeriesStatusFilter(e.target.value as "all" | "published" | "draft")}
              >
                <option value="all">All statuses</option>
                <option value="published">Published</option>
                <option value="draft">Drafts</option>
              </select>
            </label>
            <button
              type="button"
              className="secondary-button"
              onClick={() => { setSeriesSearch(""); setSeriesStatusFilter("all"); void loadSeries(); }}
              disabled={busy}
            >
              <RefreshCw size={15} /> Reset / refresh
            </button>
          </div>

          {seriesRows.length === 0 ? (
            <p className="muted">No cartoons found yet.</p>
          ) : (
            <div className="admin-list">
              {filteredSeriesRows.length === 0 ? (
                <p className="muted">No cartoons match this search or status filter.</p>
              ) : filteredSeriesRows.map((series) => (
                <div className="admin-list-item" key={series.id}>
                  <div className="grow">
                    <strong>{series.title}</strong>
                    <p className="muted">
                      {series.language} · {series.release_year ?? "Year unknown"}
                    </p>
                    <span className="status-label">
                      {series.status}
                    </span>
                    {series.poster_path && (
                      <p className="muted">
                        <a href={series.poster_path} target="_blank" rel="noreferrer">
                          View current poster
                        </a>
                      </p>
                    )}
                    <label className="file-drop">
                      <span>Replace poster</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        disabled={busy}
                        onChange={(e) => {
                          const selected = e.target.files?.[0] ?? null;
                          if (selected) void replaceSeriesPoster(series, selected);
                          e.currentTarget.value = "";
                        }}
                      />
                    </label>
                    {series.banner_url && (
                      <p className="muted">
                        <a href={series.banner_url} target="_blank" rel="noreferrer">
                          View current hero banner
                        </a>
                      </p>
                    )}
                    <label className="file-drop">
                      <span>{series.banner_url ? "Replace hero banner" : "Upload hero banner"}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        disabled={busy}
                        onChange={(e) => {
                          const selected = e.target.files?.[0] ?? null;
                          if (selected) void replaceSeriesBanner(series, selected);
                          e.currentTarget.value = "";
                        }}
                      />
                    </label>
                    {editingSeriesId === series.id && (
                      <form
                        className="stack-form"
                        onSubmit={(e) => { e.preventDefault(); void saveSeriesEdits(series); }}
                      >
                        <label>Series title<input required value={editSeriesTitle} onChange={(e) => setEditSeriesTitle(e.target.value)} disabled={busy} /></label>
                        <label>URL slug<input required value={editSeriesSlug} onChange={(e) => setEditSeriesSlug(e.target.value)} disabled={busy} /></label>
                        <label>Description<textarea rows={3} value={editSeriesDescription} onChange={(e) => setEditSeriesDescription(e.target.value)} disabled={busy} /></label>
                        <div className="two-fields">
                          <label>Release year<input type="number" min="1900" max="2100" value={editSeriesYear} onChange={(e) => setEditSeriesYear(e.target.value)} disabled={busy} /></label>
                          <label>Language<input required value={editSeriesLanguage} onChange={(e) => setEditSeriesLanguage(e.target.value)} disabled={busy} /></label>
                        </div>
                        <fieldset className="genre-picker" disabled={busy}>
                          <legend>Genres</legend>
                          <p className="muted">Choose one or more genres.</p>
                          <div className="genre-options">
                            {GENRE_OPTIONS.map((genre) => (
                              <label key={genre} className="genre-option">
                                <input
                                  type="checkbox"
                                  checked={editSeriesGenres.includes(genre)}
                                  onChange={(e) =>
                                    setEditSeriesGenres((current) =>
                                      e.target.checked
                                        ? [...current, genre]
                                        : current.filter((item) => item !== genre)
                                    )
                                  }
                                />
                                {genre}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <div className="inline-form">
                          <button className="primary-button" disabled={busy}><Save size={16} /> Save changes</button>
                          <button type="button" className="secondary-button" onClick={() => setEditingSeriesId(null)} disabled={busy}><X size={16} /> Cancel</button>
                        </div>
                      </form>
                    )}
                  </div>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => editingSeriesId === series.id ? setEditingSeriesId(null) : beginEditSeries(series)}
                    disabled={busy}
                    title="Edit cartoon details"
                  >
                    <Pencil size={16} /> {editingSeriesId === series.id ? "Close edit" : "Edit"}
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => selectSeries(series.id)}
                    title="Manage this cartoon"
                  >
                    Manage
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => toggleSeriesStatus(series)}
                    title={
                      series.status === "published"
                        ? "Unpublish cartoon"
                        : "Publish cartoon"
                    }
                  >
                    {series.status === "published" ? (
                      <EyeOff size={16} />
                    ) : (
                      <Eye size={16} />
                    )}
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void deleteSeries(series)}
                    disabled={busy}
                    title="Delete this cartoon and its seasons/episodes"
                    aria-label={`Delete ${series.title}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="form-card stack-form">
          <h2>
            <Layers /> Seasons and episodes
          </h2>

          <label>
            Choose cartoon
            <select
              value={seriesId}
              onChange={(e) => selectSeries(e.target.value)}
            >
              <option value="">Choose series</option>
              {seriesRows.map((series) => (
                <option key={series.id} value={series.id}>
                  {series.title}
                </option>
              ))}
            </select>
          </label>

          <div className="inline-form">
            <label className="grow">
              Choose season
              <select
                value={seasonId}
                onChange={(e) => selectSeason(e.target.value)}
                disabled={!seriesId}
              >
                <option value="">Choose season</option>
                {seasonRows.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.title}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="secondary-button"
              onClick={createSeason}
              disabled={busy || !seriesId}
            >
              + Season
            </button>
          </div>

          {seasonId && (
            <div className="admin-list">
              <h3>Episodes in selected season</h3>
              {episodeRows.length === 0 ? (
                <p className="muted">No episodes in this season yet.</p>
              ) : (
                episodeRows.map((episode) => (
                  <div className="admin-list-item" key={episode.id}>
                    <div className="grow">
                      <strong>
                        E{episode.episode_number}: {episode.title}
                      </strong>
                      <p className="muted">
                        {episode.is_published ? "Published" : "Unpublished"}
                      </p>
                      {editingEpisodeId === episode.id && (
                        <form
                          className="stack-form"
                          onSubmit={(e) => { e.preventDefault(); void saveEpisodeEdits(episode); }}
                        >
                          <label>Episode title<input required value={editEpisodeTitle} onChange={(e) => setEditEpisodeTitle(e.target.value)} disabled={busy} /></label>
                          <label>Episode number<input required min="1" type="number" value={editEpisodeNumber} onChange={(e) => setEditEpisodeNumber(e.target.value)} disabled={busy} /></label>
                          <label>YouTube URL or existing storage path<input required value={editEpisodeUrl} onChange={(e) => setEditEpisodeUrl(e.target.value)} disabled={busy} /><span className="muted">Keep the current path for uploaded files, or enter a valid YouTube URL.</span></label>
                          <div className="inline-form">
                            <button type="button" className="primary-button" disabled={busy} onClick={() => void saveEpisodeEdits(episode)}><Save size={16} /> {busy ? "Saving..." : "Save changes"}</button>
                            <button type="button" className="secondary-button" onClick={() => setEditingEpisodeId(null)} disabled={busy}><X size={16} /> Cancel</button>
                          </div>
                        </form>
                      )}
                    </div>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => editingEpisodeId === episode.id ? setEditingEpisodeId(null) : beginEditEpisode(episode)}
                      disabled={busy}
                      title="Edit episode details"
                    >
                      <Pencil size={16} /> {editingEpisodeId === episode.id ? "Close edit" : "Edit"}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => toggleEpisodeStatus(episode)}
                      disabled={busy}
                      title={episode.is_published ? "Unpublish episode" : "Publish episode"}
                    >
                      {episode.is_published ? (
                        <EyeOff size={16} />
                      ) : (
                        <Eye size={16} />
                      )}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void deleteEpisode(episode)}
                      disabled={busy}
                      title="Delete this episode"
                      aria-label={`Delete episode ${episode.title}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        <form className="form-card stack-form" onSubmit={createEpisode}>
          <h2>
            <UploadCloud /> Add episode
          </h2>

          <p className="muted">
            Select a cartoon and season above first. Then provide a YouTube
            URL or upload a small video file.
          </p>

          <label>
            Episode title
            <input
              required
              value={episodeTitle}
              onChange={(e) => setEpisodeTitle(e.target.value)}
              placeholder="Episode 1"
            />
          </label>

          <label>
            Episode number
            <input
              required
              min="1"
              type="number"
              value={episodeNumber}
              onChange={(e) => setEpisodeNumber(e.target.value)}
            />
          </label>

          <label>
            YouTube video URL
            <span className="muted">
              Use a video you own or are authorized to embed.
            </span>
            <div className="input-with-icon">
              <LinkIcon size={18} />
              <input
                type="url"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                disabled={Boolean(file)}
              />
            </div>
          </label>

          <p className="muted">— OR upload a video file —</p>

          <label className="file-drop">
            <UploadCloud size={22} />
            <span>
              {file ? file.name : "Choose MP4, WebM or OGG (max 100 MB)"}
            </span>
            <input
              type="file"
              accept="video/mp4,video/webm,video/ogg"
              onChange={(e) => {
                const selected = e.target.files?.[0] ?? null;
                setFile(selected);
                if (selected) setYoutubeUrl("");
              }}
              disabled={Boolean(youtubeUrl.trim())}
            />
          </label>

          <button
            className="primary-button"
            disabled={busy || !seasonId}
          >
            {busy ? "Saving episode..." : "Add & publish episode"}
          </button>
        </form>
        </>}
      </div>
    </main>
  );
}

