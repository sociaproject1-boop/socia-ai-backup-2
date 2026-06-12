/**
 * CreateGroupFlow.tsx
 *
 * 3-step Messenger-style group creation sheet:
 *   Step 1 — Search & pick members
 *   Step 2 — Name the group + optional avatar
 *   Step 3 — Creating (spinner)
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, Users, Camera, ArrowLeft, Check, Loader2 } from "lucide-react";
import { searchUsers, type UserSearchResult } from "@/lib/supabase";
import { groupApi } from "@/lib/useGroupChat";

interface Props {
  myId:     string;
  onClose:  () => void;
  onCreate: (groupId: string) => void;
}

const CLOUD_NAME    = "devyx5yyk";
const UPLOAD_PRESET = "socia_upload";

async function uploadAvatar(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", UPLOAD_PRESET);
  fd.append("folder", "group_avatars");
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: fd });
  if (!res.ok) throw new Error("Avatar upload failed");
  const data = await res.json() as { secure_url: string };
  return data.secure_url;
}

export function CreateGroupFlow({ myId, onClose, onCreate }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  /* Step 1: member selection */
  const [query,      setQuery]      = useState("");
  const [results,    setResults]    = useState<UserSearchResult[]>([]);
  const [searching,  setSearching]  = useState(false);
  const [selected,   setSelected]   = useState<UserSearchResult[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Step 2: group info */
  const [groupName,   setGroupName]   = useState("");
  const [avatarFile,  setAvatarFile]  = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [creating,    setCreating]    = useState(false);
  const [createError, setCreateError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Debounced search */
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const r = await searchUsers(query);
      setResults(r.filter((u) => u.id !== myId));
      setSearching(false);
    }, 280);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, myId]);

  const toggle = useCallback((user: UserSearchResult) => {
    setSelected((prev) =>
      prev.some((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user],
    );
  }, []);

  const handleAvatarPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleCreate = async () => {
    if (!groupName.trim()) { setCreateError("Please enter a group name"); return; }
    if (selected.length < 1) { setCreateError("Add at least one member"); return; }
    setCreateError("");
    setCreating(true);
    setStep(3);
    try {
      let avatarUrl: string | undefined;
      if (avatarFile) avatarUrl = await uploadAvatar(avatarFile);
      const { group } = await groupApi.createGroup(
        groupName.trim(),
        selected.map((u) => u.id),
        avatarUrl,
      );
      onCreate(group.id);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create group");
      setCreating(false);
      setStep(2);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0f]"
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3">
        <button
          onClick={step === 2 ? () => setStep(1) : onClose}
          className="grid h-8 w-8 place-items-center rounded-full text-white/70 hover:bg-white/10"
        >
          {step === 2 ? <ArrowLeft className="h-4 w-4" /> : <X className="h-4 w-4" />}
        </button>
        <div className="flex-1">
          <h2 className="font-semibold text-white">
            {step === 1 ? "Add Members" : step === 2 ? "New Group" : "Creating…"}
          </h2>
          {step === 1 && selected.length > 0 && (
            <p className="text-xs text-white/50">{selected.length} selected</p>
          )}
        </div>
        {step === 1 && (
          <button
            disabled={selected.length === 0}
            onClick={() => setStep(2)}
            className="rounded-xl bg-purple-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Next
          </button>
        )}
        {step === 2 && (
          <button
            disabled={!groupName.trim() || creating}
            onClick={handleCreate}
            className="rounded-xl bg-purple-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Create
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {/* ── Step 1: Select members ─────────────────────────────────────── */}
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-1 flex-col overflow-hidden"
          >
            {/* Search input */}
            <div className="border-b border-white/[0.06] px-4 py-3">
              <div className="flex items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-white/40" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search people…"
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
                />
                {searching && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-white/40" />}
              </div>
            </div>

            {/* Selected chips */}
            {selected.length > 0 && (
              <div className="flex gap-2 overflow-x-auto border-b border-white/[0.06] px-4 py-3 no-scrollbar">
                {selected.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => toggle(u)}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-purple-500/40 bg-purple-600/20 px-2.5 py-1 text-xs text-[#1D9BF0]"
                  >
                    <span>{u.name || u.username}</span>
                    <X className="h-3 w-3" />
                  </button>
                ))}
              </div>
            )}

            {/* Results */}
            <ul className="flex-1 overflow-y-auto px-4 py-2">
              {results.map((user) => {
                const isSelected = selected.some((u) => u.id === user.id);
                return (
                  <motion.li
                    key={user.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <button
                      onClick={() => toggle(user)}
                      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 active:bg-white/[0.05]"
                    >
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/10">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full bg-[#1D9BF0] grid place-items-center text-sm font-bold text-white">
                            {(user.name || user.username).charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-medium text-white">{user.name || user.username}</p>
                        {user.username && <p className="truncate text-xs text-white/50">@{user.username}</p>}
                      </div>
                      <div className={
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all " +
                        (isSelected ? "bg-purple-600" : "border border-white/20")
                      }>
                        {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                      </div>
                    </button>
                  </motion.li>
                );
              })}
              {!searching && query.trim() && results.length === 0 && (
                <p className="py-10 text-center text-sm text-white/40">No users found</p>
              )}
              {!query.trim() && (
                <div className="flex flex-col items-center py-16 text-white/30">
                  <Users className="mb-3 h-10 w-10" />
                  <p className="text-sm">Search to add people</p>
                </div>
              )}
            </ul>
          </motion.div>
        )}

        {/* ── Step 2: Group name + avatar ────────────────────────────────── */}
        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-1 flex-col overflow-y-auto px-5 py-6"
          >
            {/* Avatar picker */}
            <div className="mb-8 flex flex-col items-center gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="relative h-24 w-24 overflow-hidden rounded-full border-2 border-white/20 bg-white/[0.06]"
              >
                {avatarPreview ? (
                  <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-white/40">
                    <Camera className="h-7 w-7" />
                    <span className="text-[10px]">Photo</span>
                  </div>
                )}
                <div className="absolute inset-0 rounded-full ring-2 ring-purple-500/0 transition-all group-hover:ring-purple-500/40" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} />
              <p className="text-xs text-white/40">Tap to add a group photo</p>
            </div>

            {/* Group name */}
            <div className="mb-2">
              <label className="mb-1.5 block text-xs font-medium text-white/50">GROUP NAME</label>
              <input
                autoFocus
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                maxLength={80}
                placeholder="Enter group name…"
                className="w-full rounded-2xl border border-white/[0.10] bg-white/[0.05] px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-purple-500/50 focus:outline-none focus:ring-1 focus:ring-purple-500/30"
              />
            </div>

            {/* Members preview */}
            <div className="mt-6">
              <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-white/40">
                Members ({selected.length + 1})
              </p>
              <ul className="space-y-2">
                {selected.map((u) => (
                  <li key={u.id} className="flex items-center gap-3">
                    <div className="h-8 w-8 overflow-hidden rounded-full border border-white/10">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full bg-[#1D9BF0] grid place-items-center text-xs font-bold text-white">
                          {(u.name || u.username).charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <span className="text-sm text-white/70">{u.name || u.username}</span>
                  </li>
                ))}
              </ul>
            </div>

            {createError && (
              <p className="mt-4 rounded-xl bg-red-500/15 px-4 py-2 text-xs text-red-400">{createError}</p>
            )}
          </motion.div>
        )}

        {/* ── Step 3: Creating ───────────────────────────────────────────── */}
        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-1 flex-col items-center justify-center gap-4"
          >
            <Loader2 className="h-10 w-10 animate-spin text-[#1D9BF0]" />
            <p className="text-sm text-white/60">Creating "{groupName}"…</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
