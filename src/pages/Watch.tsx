
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Clock3,
  ChevronLeft,
  ChevronRight,
  ListVideo,
  Play,
  RotateCcw,
} from "lucide-react";
import { supabase, supabaseReady } from "../lib/supabase";
import type { Episode, Season } from "../types";

type SeriesInfo = {
  title: string;
  slug: string;
};

type SeasonInfo = Season & {
  cartoon_series: SeriesInfo | null;
};

type WatchHistory = {
  progress_seconds: number;
  completed: boolean;
};

type YouTubePlayer = {
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  destroy: () => void;
};

type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars?: Record<string, string | number>;
      events: {
        onReady: (event: { target: YouTubePlayer }) => void;
        onStateChange: (event: { target: YouTubePlayer; data: number }) => void;
      };
    }
  ) => YouTubePlayer;
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
};

type YouTubeWindow = Window & {
  YT?: YouTubeApi;
  onYouTubeIframeAPIReady?: () => void;
};

function getYouTubeEmbedUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    let videoId = "";

    if (host === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] ?? "";
    } else if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtube-nocookie.com"
    ) {
      if (url.pathname === "/watch") {
        videoId = url.searchParams.get("v") ?? "";
      } else {
        const parts = url.pathname.split("/").filter(Boolean);
        if (["embed", "shorts", "live"].includes(parts[0] ?? "")) {
          videoId = parts[1] ?? "";
        }
      }
    }

    return /^[\w-]{11}$/.test(videoId)
      ? `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}&rel=0&modestbranding=1&playsinline=1`
      : null;
  } catch {
    return null;
  }
}

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(
      remainingSeconds
    ).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export default function Watch() {
  const { episodeId } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const youtubeContainerRef = useRef<HTMLDivElement>(null);
  const videoFrameRef = useRef<HTMLDivElement>(null);
  const youtubePlayerRef = useRef<YouTubePlayer | null>(null);
  const lastSavedAtRef = useRef(0);
  const resumeDecisionDoneRef = useRef(false);
  const pendingResumeRef = useRef<number | null>(null);
  const saveProgressRef = useRef<() => Promise<void>>(async () => {});

  const [episode, setEpisode] = useState<Episode | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [seriesTitle, setSeriesTitle] = useState("");
  const [seasonTitle, setSeasonTitle] = useState("");
  const [playbackUrl, setPlaybackUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [notice, setNotice] = useState(
    "Connect Supabase and add a published episode to enable playback."
  );
  const [userId, setUserId] = useState<string | null>(null);
  const youtubeSecondsRef = useRef(0);
  const youtubeDurationRef = useRef(0);

  const [resumePrompt, setResumePrompt] = useState(false);
  const [savedSeconds, setSavedSeconds] = useState(0);
  const [resumeReady, setResumeReady] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const [nextPrompt, setNextPrompt] = useState(false);
  const [nextCountdown, setNextCountdown] = useState(8);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 3000);
  }, []);

  useEffect(() => {
    if (nextPrompt || resumePrompt) {
      setControlsVisible(true);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      return;
    }
    revealControls();
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [episodeId, nextPrompt, resumePrompt, revealControls]);

  useEffect(() => {
    let active = true;

    async function load() {
      setPlaybackUrl("");
      setYoutubeUrl("");
      setEpisode(null);
      setEpisodes([]);
      setSeasonId("");
      setSeasonTitle("");
      setSeriesTitle("");
      setNotice("");
      setResumePrompt(false);
      setSavedSeconds(0);
      setResumeReady(false);
      setProgressMessage("");
      setNextPrompt(false);
      setNextCountdown(8);
      youtubeSecondsRef.current = 0;
      youtubeDurationRef.current = 0;
      lastSavedAtRef.current = 0;
      resumeDecisionDoneRef.current = false;
      pendingResumeRef.current = null;

      if (!supabaseReady || !episodeId) {
        setNotice("Connect Supabase and select a published episode.");
        return;
      }

      const { data: auth } = await supabase.auth.getUser();
      if (!active) return;

      const currentUserId = auth.user?.id ?? null;
      setUserId(currentUserId);

      const { data, error } = await supabase
        .from("episodes")
        .select("*, seasons(title, series_id, cartoon_series(title, slug))")
        .eq("id", episodeId)
        .eq("is_published", true)
        .maybeSingle();

      if (error || !data) {
        if (active) {
          setNotice(
            "Episode not found, unpublished, or database not configured."
          );
        }
        return;
      }

      if (!active) return;

      const currentEpisode = data as unknown as Episode;
      const season = data.seasons as unknown as SeasonInfo | null;

      setEpisode(currentEpisode);
      setSeriesTitle(season?.cartoon_series?.title ?? "Now playing");
      setSeasonTitle(season?.title ?? "Episodes");
      setSeasonId(currentEpisode.season_id);

      const { data: episodeRows, error: episodeError } = await supabase
        .from("episodes")
        .select("*")
        .eq("season_id", currentEpisode.season_id)
        .eq("is_published", true)
        .order("episode_number", { ascending: true });

      if (!active) return;

      if (!episodeError && episodeRows) {
        setEpisodes(episodeRows as Episode[]);
      }

      // Load saved progress for this user and episode.
      if (currentUserId) {
        const { data: history, error: historyError } = await supabase
          .from("watch_history")
          .select("progress_seconds, completed")
          .eq("user_id", currentUserId)
          .eq("episode_id", currentEpisode.id)
          .maybeSingle();

        if (!active) return;

        if (!historyError && history) {
          const saved = history as WatchHistory;
          const seconds = Math.max(0, saved.progress_seconds ?? 0);

          // Offer resume only if the episode is unfinished and has
          // enough saved progress to make resuming useful.
          if (!saved.completed && seconds >= 10) {
            setSavedSeconds(seconds);
            setResumePrompt(true);
          } else {
            resumeDecisionDoneRef.current = true;
            setResumeReady(true);
          }
        } else {
          resumeDecisionDoneRef.current = true;
          setResumeReady(true);
        }
      } else {
        resumeDecisionDoneRef.current = true;
        setResumeReady(true);
      }

      const path = currentEpisode.storage_path?.trim() ?? "";

      if (!path) {
        setNotice("This episode has no video source yet.");
        return;
      }

      const embedUrl = getYouTubeEmbedUrl(path);

      if (embedUrl) {
        setYoutubeUrl(embedUrl);
        return;
      }

      const { data: signed, error: signError } = await supabase.storage
        .from("episodes")
        .createSignedUrl(path, 3600);

      if (!active) return;

      if (signed && !signError) {
        setPlaybackUrl(signed.signedUrl);
      } else {
        setNotice(
          "Could not open this video. Check the Supabase Storage bucket and file path."
        );
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [episodeId]);

  
  const saveProgress = useCallback(async () => {
    if (
      !episode ||
      !userId ||
      !supabaseReady ||
      !resumeDecisionDoneRef.current
    ) {
      return;
    }

    const isYouTube = Boolean(youtubeUrl);
    const video = videoRef.current;
    const currentTime = isYouTube
      ? youtubeSecondsRef.current
      : video?.currentTime ?? 0;
    const duration = isYouTube
      ? youtubeDurationRef.current
      : video?.duration ?? 0;

    if (
      !Number.isFinite(currentTime) ||
      !Number.isFinite(duration) ||
      currentTime < 0 ||
      (currentTime === 0 && duration === 0)
    ) {
      return;
    }

    const completed = duration > 0 && currentTime / duration >= 0.92;
    const { error } = await supabase.from("watch_history").upsert(
      
      {
        user_id: userId,
        episode_id: episode.id,
        progress_seconds: completed ? 0 : Math.floor(currentTime),
        duration_seconds:
         Number.isFinite(duration) && duration > 0
            ? Math.floor(duration)
            : null,
        completed,
        updated_at: new Date().toISOString(),
      },

      { onConflict: "user_id,episode_id" }
    );

    if (error) {
      console.error("Could not save watch progress:", error.message);
      setProgressMessage("Progress could not be saved. Check your connection.");
    } else {
      setProgressMessage("Progress saved");
    }
  }, [episode, userId, youtubeUrl]);

  useEffect(() => {
    saveProgressRef.current = saveProgress;
  }, [saveProgress]);

  
  useEffect(() => {
    if (!youtubeUrl || !episodeId || !youtubeContainerRef.current) {
      return;
    }

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let player: YouTubePlayer | null = null;
    const w = window as YouTubeWindow;
    let videoId = "";
    try {
      videoId = new URL(youtubeUrl).pathname.split("/").filter(Boolean).pop() ?? "";
    } catch {
      return;
    }

    const startTracking = () => {
      if (cancelled || !w.YT?.Player || !youtubeContainerRef.current || player) {
        return;
      }

      player = new w.YT.Player(youtubeContainerRef.current, {
        videoId,
        playerVars: {
          enablejsapi: 1,
          controls: 1,
          fs: 1,
          rel: 0,
          modestbranding: 1,
          origin: window.location.origin,
          playsinline: 1,
        },
        events: {
          onReady: (event) => {
            if (cancelled) return;
            player = event.target;
            youtubePlayerRef.current = event.target;
            youtubeDurationRef.current = event.target.getDuration();

            if (pendingResumeRef.current !== null) {
              const resumeAt = pendingResumeRef.current;
              event.target.seekTo(resumeAt, true);
              youtubeSecondsRef.current = resumeAt;
              pendingResumeRef.current = null;
            }
          },
          onStateChange: (event) => {
            if (cancelled || !w.YT) return;
            const seconds = event.target.getCurrentTime();
            const duration = event.target.getDuration();
            youtubeSecondsRef.current = Number.isFinite(seconds) ? seconds : 0;
            youtubeDurationRef.current = Number.isFinite(duration) ? duration : 0;

            if (event.data === w.YT.PlayerState.PAUSED) {
              void saveProgressRef.current();
            }

            if (event.data === w.YT.PlayerState.ENDED) {
              void saveProgressRef.current();
              handleEpisodeEnded();
            }
          },
        },
      });

      intervalId = setInterval(() => {
        if (cancelled || !player || !w.YT) return;
        if (player.getPlayerState() !== w.YT.PlayerState.PLAYING) return;

        const seconds = player.getCurrentTime();
        const duration = player.getDuration();
        if (Number.isFinite(seconds)) youtubeSecondsRef.current = seconds;
        if (Number.isFinite(duration)) youtubeDurationRef.current = duration;

        const currentSecond = Math.floor(youtubeSecondsRef.current);
        if (currentSecond > 0 && currentSecond !== lastSavedAtRef.current) {
          lastSavedAtRef.current = currentSecond;
          void saveProgressRef.current();
        }
      }, 15000);
    };

    if (w.YT?.Player) {
      startTracking();
    } else {
      const previousCallback = w.onYouTubeIframeAPIReady;
      w.onYouTubeIframeAPIReady = () => {
        previousCallback?.();
        startTracking();
      };

      const existingScript = document.querySelector(
        'script[src="https://www.youtube.com/iframe_api"]'
      );
      if (!existingScript) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (youtubePlayerRef.current === player) youtubePlayerRef.current = null;
      // The YouTube IFrame API mutates its player DOM. Keep React in charge of
      // the stable container and remove generated iframe children only after
      // detaching the API callbacks, avoiding React removeChild conflicts.
      try {
        player?.destroy();
      } catch {
        // Ignore cleanup errors if the YouTube API already removed its iframe.
      }
      if (youtubeContainerRef.current) {
        youtubeContainerRef.current.replaceChildren();
      }
    };
  }, [youtubeUrl, userId, episodeId]);


  // Save the latest progress when leaving this episode.
  useEffect(() => {
    const handleBeforeUnload = () => {
      void saveProgressRef.current();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      void saveProgressRef.current();
    };
  }, [episodeId]);

  function chooseResume(resume: boolean) {
    const seconds = resume ? savedSeconds : 0;
    resumeDecisionDoneRef.current = true;
    setResumePrompt(false);

    if (youtubeUrl) {
      const player = youtubePlayerRef.current;
      if (player) {
        player.seekTo(seconds, true);
        youtubeSecondsRef.current = seconds;
        youtubeDurationRef.current = player.getDuration();
      } else {
        pendingResumeRef.current = seconds;
      }
    } else {
      pendingResumeRef.current = seconds;
      const video = videoRef.current;
      if (video && video.readyState >= 1) {
        video.currentTime = Math.min(
          seconds,
          Number.isFinite(video.duration) ? video.duration : seconds
        );
        pendingResumeRef.current = null;
      }
    }

    if (!resume) {
      setProgressMessage("Starting from the beginning");
      void saveProgressRef.current();
    }
  }

  function handleLoadedMetadata() {
    const video = videoRef.current;
    if (!video || pendingResumeRef.current === null) return;

    video.currentTime = Math.min(
      pendingResumeRef.current,
      Number.isFinite(video.duration) ? video.duration : pendingResumeRef.current
    );

    pendingResumeRef.current = null;
  }

  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video || !resumeDecisionDoneRef.current) return;

    const currentSecond = Math.floor(video.currentTime);

    if (
      userId &&
      currentSecond > 0 &&
      currentSecond % 15 === 0 &&
      currentSecond !== lastSavedAtRef.current
    ) {
      lastSavedAtRef.current = currentSecond;
      void saveProgressRef.current();
    }
  }


  // Prefer landscape when the player enters fullscreen on mobile. Browser support
  // varies: Android Chrome generally supports this in fullscreen; iOS may ignore it.
  useEffect(() => {
    const tryLockLandscape = async () => {
      try {
        if (document.fullscreenElement && screen.orientation && "lock" in screen.orientation) {
          const orientation = screen.orientation as unknown as {
            lock?: (orientation: "landscape") => Promise<void>;
          };

          if (typeof orientation.lock === "function") {
            await orientation.lock("landscape");
          }
        }
      } catch {
        // Orientation locking is browser/device controlled and may be unavailable.
      }
    };

    const unlockOrientation = () => {
      if (!document.fullscreenElement) {
        try {
          screen.orientation?.unlock?.();
        } catch {
          // Ignore unsupported orientation unlock.
        }
      } else {
        void tryLockLandscape();
      }
    };

    document.addEventListener("fullscreenchange", unlockOrientation);
    document.addEventListener("webkitfullscreenchange", unlockOrientation as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", unlockOrientation);
      document.removeEventListener("webkitfullscreenchange", unlockOrientation as EventListener);
      try {
        screen.orientation?.unlock?.();
      } catch {
        // Ignore unsupported orientation unlock.
      }
    };
  }, []);

  const currentIndex = episodes.findIndex((item) => item.id === episodeId);
  const previousEpisode = currentIndex > 0 ? episodes[currentIndex - 1] : null;
  const nextEpisode =
    currentIndex >= 0 && currentIndex < episodes.length - 1
      ? episodes[currentIndex + 1]
      : null;

  function openEpisode(id: string) {
    setNextPrompt(false);
    void saveProgressRef.current();
    navigate(`/watch/${id}`);
  }

  function handleEpisodeEnded() {
    if (nextEpisode) {
      setNextCountdown(8);
      setNextPrompt(true);
    }
  }


  useEffect(() => {
    if (!nextPrompt || !nextEpisode) return;
    if (nextCountdown <= 0) {
      openEpisode(nextEpisode.id);
      return;
    }

    const timer = window.setTimeout(() => {
      setNextCountdown((current) => current - 1);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [nextPrompt, nextCountdown, nextEpisode?.id]);

  return (
    <main className="page-shell watch-page">
      <Link to="/" className="back-link">
        <ArrowLeft size={16} /> Back to discover
      </Link>

      <div className="watch-header">
        <div>
          <span className="eyebrow">NOW PLAYING</span>
          <h1>{episode?.title ?? "Episode player"}</h1>
          <p className="muted">
            {seriesTitle}
            {seasonTitle ? ` · ${seasonTitle}` : ""}
          </p>
        </div>

        <span className="watch-chip">
          <Clock3 size={14} /> {userId ? "Progress sync enabled" : "Sign in to save progress"}
        </span>
      </div>

      <div
        ref={videoFrameRef}
        className={`video-frame${controlsVisible ? " watch-controls-visible" : " watch-controls-hidden"}`}
        onMouseMove={revealControls}
        onMouseEnter={revealControls}
        onTouchStart={revealControls}
        onClick={revealControls}
        style={{ position: "relative" }}
      >
        {youtubeUrl ? (
          <div
            ref={youtubeContainerRef}
            className="youtube-player-container"
            aria-label={`${episode?.title ?? "Cartoon episode"} video player`}
            style={{ width: "100%", height: "100%", minHeight: 0 }}
          />
        ) : playbackUrl ? (
          <video
            key={playbackUrl}
            ref={videoRef}
            src={playbackUrl}
            controls
            playsInline
            preload="metadata"
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onPause={() => void saveProgress()}
            onEnded={() => {
              void saveProgress();
              handleEpisodeEnded();
            }}
          />
        ) : (
          <div className="player-placeholder">
            <span className="player-logo">RT</span>
            <p>{notice || "Loading episode..."}</p>
          </div>
        )}


        {nextPrompt && nextEpisode && (
          <div className="resume-overlay next-episode-overlay" role="dialog" aria-modal="true" aria-label="Next episode">
            <div className="resume-card">
              <span className="eyebrow">UP NEXT</span>
              <h2>{nextEpisode.title}</h2>
              <p>Playing in {nextCountdown} second{nextCountdown === 1 ? "" : "s"}.</p>
              <div className="resume-actions">
                <button type="button" className="primary-button" onClick={() => openEpisode(nextEpisode.id)}>
                  <Play size={16} /> Play now
                </button>
                <button type="button" className="secondary-button" onClick={() => setNextPrompt(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {resumePrompt && (playbackUrl || youtubeUrl) && (
          <div className="resume-overlay continue-overlay" role="dialog" aria-modal="true" aria-label="Continue watching">
            <div className="resume-card">
              <span className="eyebrow">WELCOME BACK</span>
              <h2>Continue watching?</h2>
              <p>
                You stopped at <strong>{formatTime(savedSeconds)}</strong>.
                Would you like to continue from there?
              </p>
              <div className="resume-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => chooseResume(true)}
                >
                  <Play size={16} /> Resume
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => chooseResume(false)}
                >
                  <RotateCcw size={16} /> Start over
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {notice && <p className="notice">{notice}</p>}

      {progressMessage && (
        <p className="muted progress-message" role="status">
          {progressMessage}
        </p>
      )}

      {userId && playbackUrl && !resumePrompt && !resumeReady && (
        <p className="muted">Checking saved progress...</p>
      )}

      <div className="episode-navigation">
        <button
          type="button"
          className="secondary-button"
          disabled={!previousEpisode}
          onClick={() => previousEpisode && openEpisode(previousEpisode.id)}
        >
          <ChevronLeft size={18} />
          Previous Episode
        </button>

        <button
          type="button"
          className="primary-button"
          disabled={!nextEpisode}
          onClick={() => nextEpisode && openEpisode(nextEpisode.id)}
        >
          Next Episode
          <ChevronRight size={18} />
        </button>
      </div>

      <section className="episode-section">
        <div className="episode-section-heading">
          <div>
            <span className="eyebrow">
              <ListVideo size={15} /> EPISODE GUIDE
            </span>
            <h2>{seasonTitle || "Season Episodes"}</h2>
          </div>
          <span className="muted">{episodes.length} episodes</span>
        </div>

        {episodes.length > 0 ? (
          <div className="episode-list">
            {episodes.map((item) => {
              const isCurrent = item.id === episodeId;

              return (
                <button
                  type="button"
                  key={item.id}
                  className={`episode-item ${isCurrent ? "active" : ""}`}
                  aria-current={isCurrent ? "true" : undefined}
                  onClick={() => openEpisode(item.id)}
                >
                  <span className="episode-number">
                    {String(item.episode_number).padStart(2, "0")}
                  </span>

                  <span className="episode-item-details">
                    <strong>{item.title}</strong>
                    <span>
                      Episode {item.episode_number}
                      {isCurrent ? " · Now playing" : ""}
                    </span>
                  </span>

                  <span className="episode-play-indicator">
                    {isCurrent ? "Playing" : "▶"}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="muted">
            {seasonId
              ? "No published episodes were found in this season."
              : "Episode list will appear when an episode is loaded."}
          </p>
        )}
      </section>

      <p className="muted player-note">
        YouTube episodes use the official embedded player API for progress tracking.
        Resume playback works for YouTube embeds and Supabase Storage videos.
      </p>
    </main>
  );
}
