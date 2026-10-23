export type Series = {
  id: string; title: string; slug: string; description: string;
  poster_path: string | null; banner_url: string | null;
  release_year: number | null; language: string; status: "draft" | "published";
};
export type Episode = {
  id: string; season_id: string; episode_number: number; title: string;
  description: string; duration_seconds: number | null; storage_path: string | null;
  is_published: boolean;
};
export type Season = { id: string; series_id: string; season_number: number; title: string; episodes?: Episode[] };
