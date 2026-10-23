import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, Send, ThumbsUp, Trash2, RefreshCw, Sparkles } from "lucide-react";
import { supabase, supabaseReady } from "./lib/supabase";
import "./CommunityRequests.css";

type RequestStatus = "requested" | "under_review" | "planned" | "added" | "not_planned";
type CommunityRequest = {
  id: string;
  user_id: string;
  title: string;
  request_type: "series" | "episode";
  details: string;
  status: RequestStatus;
  created_at: string;
};
type RequestComment = {
  id: string;
  request_id: string;
  user_id: string;
  body: string;
  created_at: string;
};
type Vote = { request_id: string; user_id: string };

const statusLabels: Record<RequestStatus, string> = {
  requested: "Requested",
  under_review: "Under review",
  planned: "Planned",
  added: "Added to RetroToon",
  not_planned: "Not planned",
};
const statuses: RequestStatus[] = ["requested", "under_review", "planned", "added", "not_planned"];

export default function CommunityRequests({ isLoggedIn, isAdmin }: { isLoggedIn: boolean; isAdmin: boolean }) {
  const [requests, setRequests] = useState<CommunityRequest[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [comments, setComments] = useState<Record<string, RequestComment[]>>({});
  const [expanded, setExpanded] = useState<string[]>([]);
  const [draftComments, setDraftComments] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");
  const [requestType, setRequestType] = useState<"series" | "episode">("series");
  const [details, setDetails] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [communityOpen, setCommunityOpen] = useState(false);

  const loadRequests = useCallback(async () => {
    if (!supabaseReady) {
      setLoading(false);
      setNotice("Connect Supabase to enable community requests.");
      return;
    }
    setLoading(true);
    const [{ data: requestRows, error: requestError }, { data: voteRows, error: voteError }] = await Promise.all([
      supabase.from("series_requests").select("id,user_id,title,request_type,details,status,created_at").order("created_at", { ascending: false }).limit(100),
      supabase.from("request_votes").select("request_id,user_id"),
    ]);
    if (requestError) setNotice(requestError.message);
    else setNotice("");
    setRequests((requestRows ?? []) as CommunityRequest[]);
    setVotes(voteError ? [] : (voteRows ?? []) as Vote[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => { if (alive) setUserId(data.user?.id ?? null); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUserId(session?.user?.id ?? null));
    void loadRequests();
    return () => { alive = false; subscription.unsubscribe(); };
  }, [loadRequests]);

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId) { setNotice("Please sign in to submit a request."); return; }
    setBusy(true); setNotice("");
    const { error } = await supabase.from("series_requests").insert({
      user_id: userId, title: title.trim(), request_type: requestType, details: details.trim(), status: "requested",
    });
    if (error) setNotice(error.message);
    else { setTitle(""); setDetails(""); setRequestType("series"); setNotice("Your request has been posted!"); await loadRequests(); }
    setBusy(false);
  }

  async function toggleVote(requestId: string) {
    if (!userId) { setNotice("Please sign in to vote for a request."); return; }
    const existing = votes.some((vote) => vote.request_id === requestId && vote.user_id === userId);
    setBusy(true);
    const result = existing
      ? await supabase.from("request_votes").delete().eq("request_id", requestId).eq("user_id", userId)
      : await supabase.from("request_votes").insert({ request_id: requestId, user_id: userId });
    if (result.error) setNotice(result.error.message);
    else await loadRequests();
    setBusy(false);
  }

  async function toggleComments(requestId: string) {
    const isOpen = expanded.includes(requestId);
    setExpanded((old) => isOpen ? old.filter((id) => id !== requestId) : [...old, requestId]);
    if (!isOpen && !comments[requestId]) {
      const { data, error } = await supabase.from("request_comments").select("id,request_id,user_id,body,created_at").eq("request_id", requestId).order("created_at", { ascending: true }).limit(100);
      if (error) setNotice(error.message);
      else setComments((old) => ({ ...old, [requestId]: (data ?? []) as RequestComment[] }));
    }
  }

  async function submitComment(requestId: string) {
    const body = (draftComments[requestId] ?? "").trim();
    if (!userId) { setNotice("Please sign in to comment."); return; }
    if (!body) return;
    setBusy(true);
    const { error } = await supabase.from("request_comments").insert({ request_id: requestId, user_id: userId, body });
    if (error) setNotice(error.message);
    else {
      setDraftComments((old) => ({ ...old, [requestId]: "" }));
      const { data } = await supabase.from("request_comments").select("id,request_id,user_id,body,created_at").eq("request_id", requestId).order("created_at", { ascending: true }).limit(100);
      setComments((old) => ({ ...old, [requestId]: (data ?? []) as RequestComment[] }));
      setNotice("Comment posted.");
    }
    setBusy(false);
  }

  async function changeStatus(requestId: string, status: RequestStatus) {
    const { error } = await supabase.from("series_requests").update({ status }).eq("id", requestId);
    if (error) setNotice(error.message);
    else { setRequests((old) => old.map((item) => item.id === requestId ? { ...item, status } : item)); setNotice("Request status updated."); }
  }

  async function deleteOwnRequest(requestId: string) {
    if (!window.confirm("Delete this request?")) return;
    const { error } = await supabase.from("series_requests").delete().eq("id", requestId);
    if (error) setNotice(error.message);
    else { setRequests((old) => old.filter((item) => item.id !== requestId)); setNotice("Request deleted."); }
  }

  return (
    <section className={`community-section${communityOpen ? " community-is-open" : " community-is-collapsed"}`} id="community-requests">
      <div className="community-heading community-collapsible-heading">
        <div>
          <span className="eyebrow">YOUR VOICE, YOUR CARTOONS</span>
          <h2><Sparkles size={24} /> Community Requests</h2>
          <p>Request a classic, discuss missing episodes, and vote for what should come next.</p>
        </div>
        <div className="community-heading-actions">
          {communityOpen && <button type="button" className="community-refresh" onClick={() => void loadRequests()} aria-label="Refresh requests"><RefreshCw size={16} /> Refresh</button>}
          <button
            type="button"
            className="community-collapse-toggle"
            onClick={() => setCommunityOpen((open) => !open)}
            aria-expanded={communityOpen}
            aria-controls="community-requests-content"
          >
            {communityOpen ? "Hide community" : "Show community"}
            <span className={`community-toggle-chevron${communityOpen ? " is-open" : ""}`} aria-hidden="true">⌄</span>
          </button>
        </div>
      </div>

      {communityOpen && <div id="community-requests-content" className="community-content">
      <form className="community-form" onSubmit={submitRequest}>
        <div className="community-form-title"><strong>What should we add next?</strong><span>Share your request with the community.</span></div>
        <div className="community-form-fields">
          <select value={requestType} onChange={(event) => setRequestType(event.target.value as "series" | "episode")} aria-label="Request type">
            <option value="series">Cartoon series</option><option value="episode">Specific episode</option>
          </select>
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} minLength={2} placeholder={requestType === "series" ? "Cartoon name (e.g. Ben 10)" : "Cartoon and episode name"} required />
        </div>
        <textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={1000} rows={3} placeholder="Any season, episode, language or other details? (optional)" />
        {isLoggedIn ? <button className="community-submit" type="submit" disabled={busy || !supabaseReady}><Send size={16} /> {busy ? "Please wait…" : "Post request"}</button> : <p className="community-signin"><Link to="/auth">Sign in</Link> to post a request, comment, or vote. Everyone can browse requests.</p>}
      </form>

      {notice && <p className="community-notice" role="status">{notice}</p>}
      <div className="community-list-heading"><h3>Requested by viewers</h3><span>{requests.length} {requests.length === 1 ? "request" : "requests"}</span></div>
      {loading ? <p className="community-empty">Loading community requests…</p> : requests.length === 0 ? <div className="community-empty"><MessageCircle size={28} /><strong>Be the first to make a request!</strong><span>Your next childhood favourite could be the next addition.</span></div> : (
        <div className="community-list">
          {requests.map((request) => {
            const requestVotes = votes.filter((vote) => vote.request_id === request.id);
            const voted = !!userId && requestVotes.some((vote) => vote.user_id === userId);
            const isExpanded = expanded.includes(request.id);
            return <article className="community-request" key={request.id}>
              <div className="community-request-top"><span className={`community-type ${request.request_type}`}>{request.request_type === "series" ? "SERIES" : "EPISODE"}</span><span className={`community-status status-${request.status}`}>{statusLabels[request.status]}</span></div>
              <h4>{request.title}</h4>
              {request.details && <p className="community-details">{request.details}</p>}
              <div className="community-meta"><span>{new Date(request.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span><span>Community member</span></div>
              <div className="community-actions">
                <button type="button" className={voted ? "community-vote voted" : "community-vote"} disabled={busy || !isLoggedIn} onClick={() => void toggleVote(request.id)}><ThumbsUp size={16} /> {requestVotes.length} {requestVotes.length === 1 ? "vote" : "votes"}</button>
                <button type="button" className="community-comment-toggle" onClick={() => void toggleComments(request.id)}><MessageCircle size={16} /> {isExpanded ? "Hide comments" : `Comments${comments[request.id] ? ` (${comments[request.id].length})` : ""}`}</button>
                {userId === request.user_id && <button type="button" className="community-delete" onClick={() => void deleteOwnRequest(request.id)} aria-label="Delete your request"><Trash2 size={15} /></button>}
              </div>
              {isAdmin && <label className="community-admin-status">Admin status <select value={request.status} onChange={(event) => void changeStatus(request.id, event.target.value as RequestStatus)}>{statuses.map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}</select></label>}
              {isExpanded && <div className="community-comments"><div className="community-comments-list">{(comments[request.id] ?? []).length ? comments[request.id].map((comment) => <div className="community-comment" key={comment.id}><span>Community member · {new Date(comment.created_at).toLocaleDateString()}</span><p>{comment.body}</p>{isAdmin && <button type="button" onClick={async () => { const { error } = await supabase.from("request_comments").delete().eq("id", comment.id); if (error) setNotice(error.message); else setComments((old) => ({ ...old, [request.id]: (old[request.id] ?? []).filter((item) => item.id !== comment.id) })); }} className="community-delete-comment">Remove comment</button>}</div>) : <p className="community-no-comments">No comments yet. Start the conversation!</p>}</div>
                {isLoggedIn ? <div className="community-comment-form"><input value={draftComments[request.id] ?? ""} maxLength={1000} onChange={(event) => setDraftComments((old) => ({ ...old, [request.id]: event.target.value }))} placeholder="Write a comment…" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submitComment(request.id); } }} /><button type="button" disabled={busy || !(draftComments[request.id] ?? "").trim()} onClick={() => void submitComment(request.id)} aria-label="Post comment"><Send size={16} /></button></div> : <p className="community-signin"><Link to="/auth">Sign in</Link> to join the discussion.</p>}
              </div>}
            </article>;
          })}
        </div>
      )}
      </div>}
    </section>
  );
}
