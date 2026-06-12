/**
 * GroupThread.tsx — Full group chat thread page
 *
 * Route: /groups/:id
 *
 * Features:
 *  - Real-time messages via Supabase Realtime
 *  - Image/file attachment via Cloudinary unsigned upload
 *  - Typing indicators via Supabase Presence
 *  - Infinite scroll (load older messages)
 *  - Read receipts (auto on view)
 *  - Group info + member management sheet
 *  - Leave / delete group actions
 *  - Mobile-optimised layout
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Users, Send, Paperclip, X, Loader2,
  MoreVertical, LogOut, Trash2, UserPlus, Crown, Shield,
  Image as ImageIcon, Check, CheckCheck, Search,
} from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useAppStore } from "@/lib/store";
import { useGroupMessages, useGroupTyping, groupApi, type ChatGroup, type GroupMember } from "@/lib/useGroupChat";
import { NameBadges } from "@/components/Badges";
import { searchUsers, type UserSearchResult } from "@/lib/supabase";

const CLOUD_NAME    = "devyx5yyk";
const UPLOAD_PRESET = "socia_upload";

async function uploadMedia(file: File): Promise<{ url: string; type: string; name: string; size: number }> {
  const isVideo = file.type.startsWith("video/");
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", UPLOAD_PRESET);
  fd.append("folder", "group_messages");
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${isVideo ? "video" : "image"}/upload`,
    { method: "POST", body: fd },
  );
  if (!res.ok) throw new Error("Upload failed");
  const data = await res.json() as { secure_url: string };
  return { url: data.secure_url, type: file.type, name: file.name, size: file.size };
}

function relTime(iso: string) {
  if (!iso) return "";
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60_000)     return "now";
  if (d < 3_600_000)  return Math.floor(d / 60_000) + "m";
  if (d < 86_400_000) return Math.floor(d / 3_600_000) + "h";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export default function GroupThread() {
  const { id: groupId } = useParams<{ id: string }>();
  const [, navigate]    = useLocation();
  const { supabaseUser }  = useAuth();
  const storeUser         = useAppStore((s) => s.user);
  const myId              = supabaseUser?.id ?? null;
  const myName            = storeUser?.name ?? (storeUser as any)?.username ?? "Me";

  const { messages, loading, hasMore, loadMore } = useGroupMessages(groupId ?? null, myId);
  const { typingNames, sendTyping }               = useGroupTyping(groupId ?? null, myId, myName);

  /* Group info state */
  const [group,    setGroup]   = useState<ChatGroup | null>(null);
  const [members,  setMembers] = useState<GroupMember[]>([]);
  const [myRole,   setMyRole]  = useState<"owner" | "admin" | "member">("member");

  /* Sheet state */
  const [infoOpen,    setInfoOpen]    = useState(false);
  const [addingOpen,  setAddingOpen]  = useState(false);
  const [menuOpen,    setMenuOpen]    = useState(false);

  /* Add-member search */
  const [addQuery,    setAddQuery]    = useState("");
  const [addResults,  setAddResults]  = useState<UserSearchResult[]>([]);
  const [addLoading,  setAddLoading]  = useState(false);
  const [addSelected, setAddSelected] = useState<UserSearchResult[]>([]);
  const [addWorking,  setAddWorking]  = useState(false);

  /* Compose state */
  const [text,       setText]        = useState("");
  const [attachments, setAttachments] = useState<{ url: string; type: string; name: string; size: number }[]>([]);
  const [uploading,  setUploading]   = useState(false);
  const [sending,    setSending]     = useState(false);
  const [sendError,  setSendError]   = useState("");

  const bottomRef   = useRef<HTMLDivElement>(null);
  const fileRef     = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef     = useRef<HTMLDivElement>(null);

  /* Load group info */
  useEffect(() => {
    if (!groupId) return;
    void groupApi.getGroup(groupId).then(({ group: g, members: m }) => {
      setGroup(g);
      setMembers(m);
      const me = m.find((x) => x.user_id === myId);
      setMyRole((me?.role ?? "member") as "owner" | "admin" | "member");
    }).catch(() => navigate("/messages"));
  }, [groupId, myId, navigate]);

  /* Scroll to bottom on new messages */
  useEffect(() => {
    if (!loading) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  /* Debounced add-member search */
  useEffect(() => {
    if (!addQuery.trim()) { setAddResults([]); return; }
    const memberIds = new Set(members.map((m) => m.user_id));
    setAddLoading(true);
    const t = setTimeout(async () => {
      const r = await searchUsers(addQuery);
      setAddResults(r.filter((u) => u.id !== myId && !memberIds.has(u.id)));
      setAddLoading(false);
    }, 280);
    return () => clearTimeout(t);
  }, [addQuery, members, myId]);

  /* Typing indicator */
  const handleInput = (val: string) => {
    setText(val);
    sendTyping(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => sendTyping(false), 2000);
  };

  /* File upload */
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const att = await uploadMedia(file);
      setAttachments((prev) => [...prev, att]);
    } catch { setSendError("Upload failed"); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  /* Send message */
  const handleSend = async () => {
    if (!groupId) return;
    if (!text.trim() && !attachments.length) return;
    setSending(true);
    setSendError("");
    sendTyping(false);
    try {
      await groupApi.sendMessage(groupId, text.trim(), attachments.length ? attachments : undefined);
      setText("");
      setAttachments([]);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Send failed");
    }
    setSending(false);
  };

  /* Leave group */
  const handleLeave = async () => {
    if (!groupId) return;
    if (!confirm("Leave this group?")) return;
    try { await groupApi.leaveGroup(groupId); navigate("/messages"); } catch { /* ignore */ }
  };

  /* Delete group */
  const handleDelete = async () => {
    if (!groupId) return;
    if (!confirm("Delete this group and all messages? This cannot be undone.")) return;
    try { await groupApi.deleteGroup(groupId); navigate("/messages"); } catch { /* ignore */ }
  };

  /* Add members submit */
  const handleAddMembers = async () => {
    if (!groupId || !addSelected.length) return;
    setAddWorking(true);
    try {
      await groupApi.addMembers(groupId, addSelected.map((u) => u.id));
      const { members: m } = await groupApi.getGroup(groupId);
      setMembers(m);
      setAddSelected([]);
      setAddQuery("");
      setAddingOpen(false);
    } catch { /* ignore */ }
    setAddWorking(false);
  };

  /* Remove member */
  const handleRemove = async (userId: string) => {
    if (!groupId) return;
    if (!confirm("Remove this member?")) return;
    try {
      await groupApi.removeMember(groupId, userId);
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } catch { /* ignore */ }
  };

  /* Group date separators */
  const lastDate = useRef<string | null>(null);

  if (!groupId) return null;

  const canManage = myRole === "owner" || myRole === "admin";

  return (
    <div className="flex h-[100dvh] flex-col bg-[#0a0a0f]">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3 shrink-0">
        <button
          onClick={() => navigate("/messages")}
          className="grid h-8 w-8 place-items-center rounded-full text-white/70 hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <button onClick={() => setInfoOpen(true)} className="flex flex-1 items-center gap-3 min-w-0">
          {/* Group avatar */}
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/10">
            {group?.avatar_url ? (
              <img src={group.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-[#1D9BF0] grid place-items-center">
                <Users className="h-5 w-5 text-white" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{group?.name ?? "…"}</p>
            <p className="text-[11px] text-white/45">
              {group ? `${group.member_count ?? members.length} members` : "Loading…"}
            </p>
          </div>
        </button>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="grid h-8 w-8 place-items-center rounded-full text-white/60 hover:bg-white/10"
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: -4 }}
                className="absolute right-0 top-10 z-50 w-48 overflow-hidden rounded-2xl border border-white/[0.10] bg-[#141418] shadow-2xl"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <button
                  onClick={() => { setInfoOpen(true); setMenuOpen(false); }}
                  className="flex w-full items-center gap-2.5 px-4 py-3 text-sm text-white/80 hover:bg-white/[0.06]"
                >
                  <Users className="h-4 w-4" /> Group info
                </button>
                {canManage && (
                  <button
                    onClick={() => { setAddingOpen(true); setMenuOpen(false); }}
                    className="flex w-full items-center gap-2.5 px-4 py-3 text-sm text-white/80 hover:bg-white/[0.06]"
                  >
                    <UserPlus className="h-4 w-4" /> Add members
                  </button>
                )}
                {myRole !== "owner" && (
                  <button
                    onClick={() => { setMenuOpen(false); void handleLeave(); }}
                    className="flex w-full items-center gap-2.5 px-4 py-3 text-sm text-orange-400 hover:bg-orange-500/10"
                  >
                    <LogOut className="h-4 w-4" /> Leave group
                  </button>
                )}
                {myRole === "owner" && (
                  <button
                    onClick={() => { setMenuOpen(false); void handleDelete(); }}
                    className="flex w-full items-center gap-2.5 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" /> Delete group
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Message list ─────────────────────────────────────────────────── */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {/* Load more */}
        {hasMore && (
          <div className="flex justify-center py-2">
            <button
              onClick={() => void loadMore()}
              className="rounded-full border border-white/[0.10] px-4 py-1.5 text-xs text-white/50 hover:bg-white/[0.06]"
            >
              Load older messages
            </button>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-[#1D9BF0]/60" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center py-16 text-white/30">
            <Users className="mb-3 h-12 w-12" />
            <p className="text-sm font-medium">No messages yet</p>
            <p className="mt-1 text-xs">Say hello to the group!</p>
          </div>
        )}

        {messages.map((msg, i) => {
          const isMine  = msg.sender_id === myId;
          const prevMsg = messages[i - 1];
          const sameAuthor = prevMsg?.sender_id === msg.sender_id &&
            Date.now() - new Date(prevMsg.created_at).getTime() < 300_000; // 5-min cluster

          /* Date separator */
          const msgDate = fmtDate(msg.created_at);
          const showDate = msgDate !== lastDate.current;
          if (showDate) lastDate.current = msgDate;

          return (
            <div key={msg.id}>
              {showDate && (
                <div className="flex items-center gap-2 py-3">
                  <div className="flex-1 border-t border-white/[0.06]" />
                  <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[10px] text-white/40">{msgDate}</span>
                  <div className="flex-1 border-t border-white/[0.06]" />
                </div>
              )}
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-2.5 ${isMine ? "flex-row-reverse" : ""} ${sameAuthor ? "mt-0.5" : "mt-3"}`}
              >
                {/* Avatar (only for others; hide when same author cluster) */}
                {!isMine && (
                  <div className={`h-7 w-7 shrink-0 overflow-hidden rounded-full border border-white/10 mt-1 ${sameAuthor ? "opacity-0" : ""}`}>
                    {msg.sender?.avatar_url ? (
                      <img src={msg.sender.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full bg-[#1D9BF0] grid place-items-center text-[10px] font-bold text-white">
                        {(msg.sender?.name ?? "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                )}

                <div className={`flex max-w-[78%] flex-col ${isMine ? "items-end" : "items-start"}`}>
                  {/* Sender name (others only, first in cluster) */}
                  {!isMine && !sameAuthor && (
                    <span className="mb-0.5 ml-1 flex items-center gap-1 text-[11px] text-white/50">
                      {msg.sender?.name ?? "Unknown"}
                      <NameBadges isOwner={!!(msg.sender as any)?.is_owner} isVerified={!!(msg.sender as any)?.is_verified} size="sm" />
                    </span>
                  )}

                  {/* Bubble */}
                  <div
                    className={
                      "rounded-2xl px-3.5 py-2.5 " +
                      (isMine
                        ? "rounded-tr-sm bg-[#1D9BF0] text-white"
                        : "rounded-tl-sm bg-white/[0.08] text-white/90")
                    }
                  >
                    {/* Attachments */}
                    {msg.attachments.map((att, j) => (
                      <div key={j} className="mb-1.5">
                        {att.type.startsWith("image/") ? (
                          <img
                            src={att.url} alt=""
                            className="max-h-52 max-w-full rounded-xl object-cover"
                          />
                        ) : att.type.startsWith("video/") ? (
                          <video src={att.url} controls className="max-h-52 max-w-full rounded-xl" />
                        ) : (
                          <a href={att.url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs">
                            <Paperclip className="h-3.5 w-3.5" />
                            <span className="truncate">{att.name || "File"}</span>
                          </a>
                        )}
                      </div>
                    ))}

                    {/* Text */}
                    {msg.content && (
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{msg.content}</p>
                    )}
                  </div>

                  {/* Timestamp */}
                  <span className="mt-0.5 px-1 text-[10px] text-white/30">{relTime(msg.created_at)}</span>
                </div>
              </motion.div>
            </div>
          );
        })}

        {/* Typing indicator */}
        <AnimatePresence>
          {typingNames.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="flex items-center gap-2 px-1 pt-1"
            >
              <span className="text-xs text-white/40">
                {typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing…
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* ── Send error ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {sendError && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mx-4 mb-1 rounded-xl bg-red-500/15 px-3 py-1.5 text-xs text-red-400"
          >
            {sendError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Pending attachments ──────────────────────────────────────────── */}
      {attachments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-t border-white/[0.06] px-4 py-2 no-scrollbar">
          {attachments.map((att, i) => (
            <div key={i} className="relative shrink-0">
              {att.type.startsWith("image/") ? (
                <img src={att.url} alt="" className="h-16 w-16 rounded-xl object-cover" />
              ) : (
                <div className="flex h-16 w-32 items-center justify-center rounded-xl bg-white/[0.06] px-2">
                  <span className="truncate text-xs text-white/60">{att.name}</span>
                </div>
              )}
              <button
                onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[#0a0a0f] border border-white/20 text-white/60"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Compose bar ─────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-white/[0.08] px-4 py-3">
        <div className="flex items-end gap-2">
          <button
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="mb-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/50 hover:bg-white/10 disabled:opacity-40"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*,video/*,application/pdf" className="hidden" onChange={handleFile} />

          <div className="flex flex-1 items-end rounded-3xl border border-white/[0.10] bg-white/[0.05] px-4 py-2">
            <textarea
              value={text}
              onChange={(e) => handleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); }
              }}
              placeholder="Message…"
              rows={1}
              className="max-h-32 w-full resize-none bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
              style={{ scrollbarWidth: "none" }}
            />
          </div>

          <motion.button
            whileTap={{ scale: 0.88 }}
            disabled={sending || (!text.trim() && !attachments.length)}
            onClick={() => void handleSend()}
            className="mb-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-purple-600 text-white shadow-md disabled:opacity-40"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </motion.button>
        </div>
      </div>

      {/* ── Group Info Sheet ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {infoOpen && (
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="fixed inset-0 z-50 flex flex-col bg-[#0e0e14] overflow-y-auto"
          >
            <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3 sticky top-0 bg-[#0e0e14] z-10">
              <button onClick={() => setInfoOpen(false)} className="grid h-8 w-8 place-items-center rounded-full text-white/70 hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
              <h2 className="font-semibold text-white">Group Info</h2>
            </div>

            {/* Group header */}
            <div className="flex flex-col items-center py-8 px-5">
              <div className="h-20 w-20 overflow-hidden rounded-full border-2 border-white/10 mb-4">
                {group?.avatar_url ? (
                  <img src={group.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-[#1D9BF0] grid place-items-center">
                    <Users className="h-8 w-8 text-white" />
                  </div>
                )}
              </div>
              <h3 className="text-xl font-bold text-white">{group?.name}</h3>
              <p className="mt-1 text-sm text-white/50">{members.length} members</p>
            </div>

            {/* Members list */}
            <div className="px-5 pb-8">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-white/40">Members</p>
              <ul className="space-y-1">
                {members.map((m) => (
                  <li key={m.user_id} className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
                    <div className="h-10 w-10 overflow-hidden rounded-full border border-white/10 shrink-0">
                      {m.user.avatar_url ? (
                        <img src={m.user.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full bg-[#1D9BF0] grid place-items-center text-sm font-bold text-white">
                          {m.user.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{m.user.name}</p>
                      <p className="truncate text-xs text-white/45">@{m.user.username}</p>
                    </div>
                    {/* Role badge */}
                    {m.role === "owner" && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-400" />}
                    {m.role === "admin" && <Shield className="h-3.5 w-3.5 shrink-0 text-blue-400" />}
                    {/* Remove button (admins can remove non-owner members) */}
                    {canManage && m.user_id !== myId && m.role !== "owner" && (
                      <button
                        onClick={() => void handleRemove(m.user_id)}
                        className="ml-1 grid h-6 w-6 place-items-center rounded-full text-red-400/70 hover:bg-red-500/10"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              {canManage && (
                <button
                  onClick={() => { setInfoOpen(false); setAddingOpen(true); }}
                  className="mt-4 flex w-full items-center gap-2 rounded-2xl border border-white/[0.10] px-4 py-3 text-sm text-white/70 hover:bg-white/[0.05]"
                >
                  <UserPlus className="h-4 w-4" />
                  Add members
                </button>
              )}

              {/* Leave / delete */}
              <div className="mt-8 space-y-2">
                {myRole !== "owner" && (
                  <button
                    onClick={() => { setInfoOpen(false); void handleLeave(); }}
                    className="flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-sm text-orange-400 hover:bg-orange-500/10"
                  >
                    <LogOut className="h-4 w-4" /> Leave group
                  </button>
                )}
                {myRole === "owner" && (
                  <button
                    onClick={() => { setInfoOpen(false); void handleDelete(); }}
                    className="flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-sm text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" /> Delete group
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Add Members Sheet ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {addingOpen && (
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="fixed inset-0 z-50 flex flex-col bg-[#0e0e14]"
          >
            <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3">
              <button onClick={() => setAddingOpen(false)} className="grid h-8 w-8 place-items-center rounded-full text-white/70 hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
              <h2 className="flex-1 font-semibold text-white">Add Members</h2>
              <button
                disabled={!addSelected.length || addWorking}
                onClick={() => void handleAddMembers()}
                className="rounded-xl bg-purple-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {addWorking ? "Adding…" : "Add"}
              </button>
            </div>
            <div className="border-b border-white/[0.06] px-4 py-3">
              <div className="flex items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-white/40" />
                <input
                  autoFocus
                  value={addQuery}
                  onChange={(e) => setAddQuery(e.target.value)}
                  placeholder="Search people to add…"
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
                />
                {addLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40" />}
              </div>
            </div>
            {addSelected.length > 0 && (
              <div className="flex gap-2 overflow-x-auto border-b border-white/[0.06] px-4 py-2 no-scrollbar">
                {addSelected.map((u) => (
                  <button key={u.id} onClick={() => setAddSelected((p) => p.filter((x) => x.id !== u.id))}
                    className="flex shrink-0 items-center gap-1 rounded-full border border-purple-500/40 bg-purple-600/20 px-2.5 py-1 text-xs text-[#1D9BF0]">
                    {u.name || u.username}<X className="h-3 w-3 ml-0.5" />
                  </button>
                ))}
              </div>
            )}
            <ul className="flex-1 overflow-y-auto px-4 py-2">
              {addResults.map((u) => {
                const sel = addSelected.some((x) => x.id === u.id);
                return (
                  <li key={u.id}>
                    <button onClick={() => setAddSelected((p) => sel ? p.filter((x) => x.id !== u.id) : [...p, u])}
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 active:bg-white/[0.05]">
                      <div className="h-10 w-10 overflow-hidden rounded-full border border-white/10 shrink-0">
                        {u.avatar_url ? <img src={u.avatar_url} alt="" className="h-full w-full object-cover" /> :
                          <div className="h-full w-full bg-[#1D9BF0] grid place-items-center text-sm font-bold text-white">
                            {(u.name || u.username).charAt(0).toUpperCase()}
                          </div>}
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-medium text-white">{u.name || u.username}</p>
                        {u.username && <p className="truncate text-xs text-white/50">@{u.username}</p>}
                      </div>
                      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all ${sel ? "bg-purple-600" : "border border-white/20"}`}>
                        {sel && <Check className="h-3.5 w-3.5 text-white" />}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
