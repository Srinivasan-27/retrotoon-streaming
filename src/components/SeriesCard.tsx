import { Check, Play, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import type { Series } from "../types";

export default function SeriesCard({ series, onAdd, saved }: { series: Series; onAdd?: (id: string) => void; saved?: boolean }) {
  return <article className="series-card">
    <Link to={`/series/${series.slug}`} className="poster">
      {series.poster_path ? <img src={series.poster_path} alt={`${series.title} poster`} loading="lazy"/> : <div className="poster-art"><span className="poster-mark">RT</span><span className="poster-year">{series.release_year ?? "CLASSIC"}</span></div>}
      <span className="poster-play"><Play fill="currentColor" size={20}/></span>
      <span className="poster-label">{series.language || "Classic"}</span>
    </Link>
    <div className="card-info"><div><h3>{series.title}</h3><p>{series.release_year ?? "Retro collection"} · Series</p></div>
      {onAdd && <button className={`mini-add ${saved ? "saved" : ""}`} onClick={() => onAdd(series.id)} title={saved ? "Remove from My List" : "Add to My List"}>{saved ? <Check size={17}/> : <Plus size={17}/>}</button>}
    </div>
  </article>;
}