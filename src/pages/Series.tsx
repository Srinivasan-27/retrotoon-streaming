import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, PlayCircle, LockKeyhole } from "lucide-react";
import { supabase, supabaseReady } from "../lib/supabase";
import type { Episode, Season, Series as SeriesType } from "../types";
import { demoSeries } from "../data/demo";

function getGenres(series: SeriesType): string[] {
  const genres = (series as SeriesType & { genres?: unknown }).genres;
  return Array.isArray(genres) ? genres.filter((genre): genre is string => typeof genre === "string") : [];
}

export default function SeriesPage() {
  const { slug } = useParams(); const [series, setSeries] = useState<SeriesType | null>(null);
  const [seasons, setSeasons] = useState<(Season & {episodes: Episode[]})[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    async function load() {
      if (supabaseReady) {
        const { data: found } = await supabase.from("cartoon_series").select("*").eq("slug", slug).eq("status","published").maybeSingle();
        if (found && active) {
          setSeries(found);
          const { data: seasonRows } = await supabase.from("seasons").select("*, episodes(*)").eq("series_id", found.id).order("season_number");
          if (active) setSeasons((seasonRows ?? []).map((s:any) => ({...s, episodes:(s.episodes ?? []).filter((e:Episode)=>e.is_published).sort((a:Episode,b:Episode)=>a.episode_number-b.episode_number)})));
          setLoading(false); return;
        }
      }
      if (active) { setSeries(demoSeries.find(s => s.slug === slug) ?? null); setLoading(false); }
    }
    load(); return () => { active = false; };
  }, [slug]);
  if (loading) return <main className="page-shell"><p className="muted">Loading series…</p></main>;
  if (!series) return <main className="page-shell"><h1>Series not found</h1><Link to="/">Back home</Link></main>;
  return <main className="page-shell">
    <Link to="/" className="back-link"><ArrowLeft size={16}/> Back to catalogue</Link>
    <section className="detail-hero">
      <div className="detail-poster">{series.poster_path ? <img src={series.poster_path} alt=""/> : <div className="poster-art big"><span className="poster-mark">RT</span><span className="poster-year">{series.release_year ?? "CLASSIC"}</span></div>}</div>
      <div className="detail-copy"><span className="eyebrow">RETROTOON ORIGINAL COLLECTION</span><h1>{series.title}</h1><p className="meta-line">{series.release_year ?? "Classic"} <span>•</span> {series.language || "Language not set"} <span>•</span> Animation</p>
          {getGenres(series).length > 0 && (
            <div className="detail-genre-list" aria-label="Genres">
              {getGenres(series).map((genre) => <span className="detail-genre-tag" key={genre}>{genre}</span>)}
            </div>
          )}
          <p className="detail-description">{series.description}</p><a href="#episodes" className="primary-button"><PlayCircle size={18}/> Browse episodes</a></div>
    </section>
    <section id="episodes" className="episode-section"><div className="section-heading"><div><span className="eyebrow">THE COLLECTION</span><h2>Episodes</h2></div></div>
      {seasons.length ? seasons.map(season => <div key={season.id} className="season-block"><h3>{season.title}</h3>{season.episodes.length ? season.episodes.map(ep => <EpisodeRow key={ep.id} episode={ep}/>) : <p className="muted">No published episodes yet.</p>}</div>) : <div className="empty-state"><LockKeyhole size={26}/><h3>Your episode shelf is waiting</h3><p>Add authorized episodes through the admin page once Supabase is configured.</p><Link className="primary-button" to="/admin">Open admin</Link></div>}
    </section>
  </main>;
}
function EpisodeRow({episode}:{episode:Episode}) {
  return <Link className="episode-row" to={`/watch/${episode.id}`}><span className="episode-number">{String(episode.episode_number).padStart(2,"0")}</span><span className="episode-text"><strong>{episode.title}</strong><small>{episode.description || "Episode"}</small></span><PlayCircle size={22}/></Link>;
}