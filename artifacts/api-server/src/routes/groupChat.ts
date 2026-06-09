/**
 * groupChat.ts -- Group Chat REST API (isolated from DMs)
 *
 * POST   /api/groups
 * GET    /api/groups
 * GET    /api/groups/:id
 * GET    /api/groups/:id/messages
 * POST   /api/groups/:id/messages
 * POST   /api/groups/:id/read
 * PATCH  /api/groups/:id
 * DELETE /api/groups/:id
 * POST   /api/groups/:id/leave
 * POST   /api/groups/:id/members
 * DELETE /api/groups/:id/members/:uid
 * PATCH  /api/groups/:id/transfer
 */
import { Router } from "express";
import { requireAuth, getAuthedUser } from "../lib/replitAuth.js";
import { getServiceClient } from "../lib/adminAuth.js";
import { logger } from "../lib/logger.js";

const router  = Router();
const MAX_MSG = 4_000;
const MAX_MEM = 250;

async function memberRole(groupId: string, userId: string): Promise<string | null> {
  const svc = getServiceClient();
  const { data } = await (svc
    .from("chat_group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle() as any);
  return (data as any)?.role ?? null;
}
async function isMember(g: string, u: string) { return (await memberRole(g, u)) !== null; }

/* POST /api/groups */
router.post("/groups", requireAuth, async (req, res): Promise<void> => {
  const user = getAuthedUser(req);
  const svc  = getServiceClient();
  const { name, member_ids, avatar_url } = req.body as {
    name?: string; member_ids?: string[]; avatar_url?: string;
  };
  if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }
  if (!Array.isArray(member_ids) || !member_ids.length) {
    res.status(400).json({ error: "At least one other member required" }); return;
  }
  const others = [...new Set(member_ids.filter((id) => id !== user.id))];
  if (others.length + 1 > MAX_MEM) { res.status(400).json({ error: `Max ${MAX_MEM} members` }); return; }
  try {
    const { data: group, error: gErr } = await (svc
      .from("chat_groups")
      .insert({ name: name.trim(), owner_id: user.id, avatar_url: avatar_url ?? null } as any)
      .select("*").single() as any);
    if (gErr || !group) { res.status(500).json({ error: (gErr as any)?.message ?? "create failed" }); return; }
    const rows = [user.id, ...others].map((uid) => ({
      group_id: group.id, user_id: uid, role: uid === user.id ? "owner" : "member",
    }));
    await svc.from("chat_group_members").insert(rows as any);
    res.status(201).json({ group });
  } catch (err) { logger.error({ err }, "[groups] create"); res.status(500).json({ error: "internal_error" }); }
});

/* GET /api/groups */
router.get("/groups", requireAuth, async (req, res): Promise<void> => {
  const user = getAuthedUser(req);
  const svc  = getServiceClient();
  try {
    const { data: memberships } = await (svc.from("chat_group_members").select("group_id").eq("user_id", user.id) as any);
    const groupIds: string[] = (memberships ?? []).map((m: any) => m.group_id);
    if (!groupIds.length) { res.json({ groups: [] }); return; }

    const { data: groups, error: gErr } = await (svc
      .from("chat_groups").select("*").in("id", groupIds)
      .order("updated_at", { ascending: false }) as any);
    if (gErr) { res.status(500).json({ error: (gErr as any).message }); return; }

    const enriched = await Promise.all((groups ?? []).map(async (g: any) => {
      const [memberRes, lastMsgRes, readRes] = await Promise.all([
        svc.from("chat_group_members").select("id", { count: "exact" }).eq("group_id", g.id),
        svc.from("chat_group_messages").select("id, content, attachments, sender_id, created_at")
          .eq("group_id", g.id).order("created_at", { ascending: false }).limit(1),
        svc.from("chat_group_reads").select("last_read_message_id, updated_at")
          .eq("group_id", g.id).eq("user_id", user.id).maybeSingle(),
      ]) as any[];
      const lastMsg = (lastMsgRes as any).data?.[0] ?? null;
      const readAt  = (readRes as any).data?.updated_at ?? null;
      const readId  = (readRes as any).data?.last_read_message_id ?? null;
      let unread = 0;
      if (lastMsg && lastMsg.id !== readId) {
        const cutoff = readAt ?? "1970-01-01T00:00:00Z";
        const { count } = await (svc.from("chat_group_messages")
          .select("id", { count: "exact" }).eq("group_id", g.id).gt("created_at", cutoff) as any);
        unread = (count as number) ?? 0;
      }
      return { ...g, member_count: (memberRes as any).count ?? 0, last_message: lastMsg, unread_count: unread };
    }));
    res.json({ groups: enriched });
  } catch (err) { logger.error({ err }, "[groups] list"); res.status(500).json({ error: "internal_error" }); }
});

/* GET /api/groups/:id */
router.get("/groups/:id", requireAuth, async (req, res): Promise<void> => {
  const user = getAuthedUser(req);
  const groupId = String(req.params["id"]!);
  const svc = getServiceClient();
  try {
    if (!(await isMember(groupId, user.id))) { res.status(403).json({ error: "Not a member" }); return; }
    const { data: group, error: gErr } = await (svc.from("chat_groups").select("*").eq("id", groupId).single() as any);
    if (gErr || !group) { res.status(404).json({ error: "Group not found" }); return; }
    const { data: memberRows } = await (svc.from("chat_group_members")
      .select("user_id, role, joined_at").eq("group_id", groupId) as any);
    const userIds = (memberRows ?? []).map((m: any) => m.user_id);
    const { data: userRows } = userIds.length
      ? await (svc.from("users").select("id, name, username, avatar_url, is_verified, is_owner").in("id", userIds) as any)
      : { data: [] };
    const userMap = new Map((userRows ?? []).map((u: any) => [u.id, u]));
    const members = (memberRows ?? []).map((m: any) => ({
      ...m, user: userMap.get(m.user_id) ?? { id: m.user_id, name: "Unknown" },
    }));
    res.json({ group, members });
  } catch (err) { logger.error({ err }, "[groups/:id]"); res.status(500).json({ error: "internal_error" }); }
});

/* GET /api/groups/:id/messages */
router.get("/groups/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const user = getAuthedUser(req);
  const groupId = String(req.params["id"]!);
  const before  = req.query["before"] as string | undefined;
  const limit   = Math.min(parseInt(req.query["limit"] as string || "40"), 60);
  const svc = getServiceClient();
  try {
    if (!(await isMember(groupId, user.id))) { res.status(403).json({ error: "Not a member" }); return; }
    let q: any = svc.from("chat_group_messages").select("*").eq("group_id", groupId)
      .order("created_at", { ascending: false }).limit(limit);
    if (before) q = q.lt("created_at", before);
    const { data: messages, error: mErr } = await q;
    if (mErr) { res.status(500).json({ error: (mErr as any).message }); return; }
    const senderIds = [...new Set((messages ?? []).map((m: any) => m.sender_id))];
    const { data: senders } = senderIds.length
      ? await (svc.from("users").select("id, name, username, avatar_url, is_verified").in("id", senderIds) as any)
      : { data: [] };
    const senderMap = new Map((senders ?? []).map((u: any) => [u.id, u]));
    const enriched = (messages ?? [])
      .map((m: any) => ({ ...m, sender: senderMap.get(m.sender_id) ?? { id: m.sender_id, name: "Unknown" } }))
      .reverse();
    res.json({ messages: enriched, has_more: (messages?.length ?? 0) === limit });
  } catch (err) { logger.error({ err }, "[groups/msgs]"); res.status(500).json({ error: "internal_error" }); }
});

/* POST /api/groups/:id/messages */
router.post("/groups/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const user = getAuthedUser(req);
  const groupId = String(req.params["id"]!);
  const svc = getServiceClient();
  const { content, attachments } = req.body as { content?: string; attachments?: any[] };
  if (!content?.trim() && !attachments?.length) {
    res.status(400).json({ error: "Message needs content or attachment" }); return;
  }
  if (content && content.length > MAX_MSG) { res.status(400).json({ error: `Max ${MAX_MSG} chars` }); return; }
  try {
    if (!(await isMember(groupId, user.id))) { res.status(403).json({ error: "Not a member" }); return; }
    const { data: msg, error: mErr } = await (svc.from("chat_group_messages")
      .insert({ group_id: groupId, sender_id: user.id, content: content?.trim() ?? null, attachments: attachments ?? [] } as any)
      .select("*").single() as any);
    if (mErr || !msg) { res.status(500).json({ error: (mErr as any)?.message ?? "send failed" }); return; }
    await svc.from("chat_groups").update({ updated_at: new Date().toISOString() } as any).eq("id", groupId);
    await (svc.from("chat_group_reads").upsert(
      { group_id: groupId, user_id: user.id, last_read_message_id: (msg as any).id, updated_at: new Date().toISOString() } as any,
      { onConflict: "group_id,user_id" }
    ) as any);
    res.status(201).json({ message: msg });
  } catch (err) { logger.error({ err }, "[groups/send]"); res.status(500).json({ error: "internal_error" }); }
});

/* POST /api/groups/:id/read */
router.post("/groups/:id/read", requireAuth, async (req, res): Promise<void> => {
  const user = getAuthedUser(req);
  const groupId = String(req.params["id"]!);
  const svc = getServiceClient();
  const { message_id } = req.body as { message_id?: string };
  if (!message_id) { res.status(400).json({ error: "message_id required" }); return; }
  try {
    if (!(await isMember(groupId, user.id))) { res.status(403).json({ error: "Not a member" }); return; }
    await (svc.from("chat_group_reads").upsert(
      { group_id: groupId, user_id: user.id, last_read_message_id: message_id, updated_at: new Date().toISOString() } as any,
      { onConflict: "group_id,user_id" }
    ) as any);
    res.json({ ok: true });
  } catch (err) { logger.error({ err }, "[groups/read]"); res.status(500).json({ error: "internal_error" }); }
});

/* PATCH /api/groups/:id */
router.patch("/groups/:id", requireAuth, async (req, res): Promise<void> => {
  const user = getAuthedUser(req);
  const groupId = String(req.params["id"]!);
  const svc = getServiceClient();
  const { name, avatar_url } = req.body as { name?: string; avatar_url?: string };
  try {
    const role = await memberRole(groupId, user.id);
    if (!role || role === "member") { res.status(403).json({ error: "Only admins can edit" }); return; }
    const updates: Record<string, unknown> = {};
    if (name?.trim()) updates["name"] = name.trim();
    if (avatar_url !== undefined) updates["avatar_url"] = avatar_url;
    if (!Object.keys(updates).length) { res.status(400).json({ error: "Nothing to update" }); return; }
    const { data, error } = await (svc.from("chat_groups").update(updates as any).eq("id", groupId).select("*").single() as any);
    if (error) { res.status(500).json({ error: (error as any).message }); return; }
    res.json({ group: data });
  } catch (err) { logger.error({ err }, "[groups/patch]"); res.status(500).json({ error: "internal_error" }); }
});

/* DELETE /api/groups/:id */
router.delete("/groups/:id", requireAuth, async (req, res): Promise<void> => {
  const user = getAuthedUser(req);
  const groupId = String(req.params["id"]!);
  const svc = getServiceClient();
  try {
    const { data: g } = await (svc.from("chat_groups").select("owner_id").eq("id", groupId).single() as any);
    if (!g) { res.status(404).json({ error: "Not found" }); return; }
    if ((g as any).owner_id !== user.id) { res.status(403).json({ error: "Only owner can delete" }); return; }
    await svc.from("chat_group_reads").delete().eq("group_id", groupId);
    await svc.from("chat_group_messages").delete().eq("group_id", groupId);
    await svc.from("chat_group_members").delete().eq("group_id", groupId);
    await svc.from("chat_groups").delete().eq("id", groupId);
    res.json({ ok: true });
  } catch (err) { logger.error({ err }, "[groups/delete]"); res.status(500).json({ error: "internal_error" }); }
});

/* POST /api/groups/:id/leave */
router.post("/groups/:id/leave", requireAuth, async (req, res): Promise<void> => {
  const user = getAuthedUser(req);
  const groupId = String(req.params["id"]!);
  const svc = getServiceClient();
  try {
    const { data: g } = await (svc.from("chat_groups").select("owner_id").eq("id", groupId).single() as any);
    if (!g) { res.status(404).json({ error: "Not found" }); return; }
    if ((g as any).owner_id === user.id) { res.status(400).json({ error: "Transfer ownership first" }); return; }
    await svc.from("chat_group_members").delete().eq("group_id", groupId).eq("user_id", user.id);
    res.json({ ok: true });
  } catch (err) { logger.error({ err }, "[groups/leave]"); res.status(500).json({ error: "internal_error" }); }
});

/* POST /api/groups/:id/members */
router.post("/groups/:id/members", requireAuth, async (req, res): Promise<void> => {
  const user = getAuthedUser(req);
  const groupId = String(req.params["id"]!);
  const svc = getServiceClient();
  const { user_ids } = req.body as { user_ids?: string[] };
  if (!Array.isArray(user_ids) || !user_ids.length) { res.status(400).json({ error: "user_ids required" }); return; }
  try {
    const role = await memberRole(groupId, user.id);
    if (!role || role === "member") { res.status(403).json({ error: "Only admins can add members" }); return; }
    const { count } = await (svc.from("chat_group_members").select("id", { count: "exact" }).eq("group_id", groupId) as any);
    if (((count as number) ?? 0) + user_ids.length > MAX_MEM) {
      res.status(400).json({ error: `Max ${MAX_MEM} members` }); return;
    }
    const rows = user_ids.map((uid) => ({ group_id: groupId, user_id: uid, role: "member" }));
    await (svc.from("chat_group_members").upsert(rows as any, { onConflict: "group_id,user_id", ignoreDuplicates: true }) as any);
    res.json({ ok: true });
  } catch (err) { logger.error({ err }, "[groups/add-members]"); res.status(500).json({ error: "internal_error" }); }
});

/* DELETE /api/groups/:id/members/:uid */
router.delete("/groups/:id/members/:uid", requireAuth, async (req, res): Promise<void> => {
  const user = getAuthedUser(req);
  const groupId  = String(req.params["id"]!);
  const targetId = String(req.params["uid"]!);
  const svc = getServiceClient();
  try {
    const { data: g } = await (svc.from("chat_groups").select("owner_id").eq("id", groupId).single() as any);
    if (!g) { res.status(404).json({ error: "Not found" }); return; }
    const role = await memberRole(groupId, user.id);
    if (!role || role === "member") { res.status(403).json({ error: "Only admins can remove members" }); return; }
    if (targetId === (g as any).owner_id) { res.status(400).json({ error: "Cannot remove owner" }); return; }
    await svc.from("chat_group_members").delete().eq("group_id", groupId).eq("user_id", targetId);
    res.json({ ok: true });
  } catch (err) { logger.error({ err }, "[groups/rm-member]"); res.status(500).json({ error: "internal_error" }); }
});

/* PATCH /api/groups/:id/transfer */
router.patch("/groups/:id/transfer", requireAuth, async (req, res): Promise<void> => {
  const user = getAuthedUser(req);
  const groupId = String(req.params["id"]!);
  const svc = getServiceClient();
  const { new_owner_id } = req.body as { new_owner_id?: string };
  if (!new_owner_id) { res.status(400).json({ error: "new_owner_id required" }); return; }
  try {
    const { data: g } = await (svc.from("chat_groups").select("owner_id").eq("id", groupId).single() as any);
    if (!g) { res.status(404).json({ error: "Not found" }); return; }
    if ((g as any).owner_id !== user.id) { res.status(403).json({ error: "Only owner can transfer" }); return; }
    if (!(await isMember(groupId, new_owner_id))) { res.status(400).json({ error: "New owner must be a member" }); return; }
    await svc.from("chat_groups").update({ owner_id: new_owner_id } as any).eq("id", groupId);
    await svc.from("chat_group_members").update({ role: "owner" } as any).eq("group_id", groupId).eq("user_id", new_owner_id);
    await svc.from("chat_group_members").update({ role: "admin" } as any).eq("group_id", groupId).eq("user_id", user.id);
    res.json({ ok: true });
  } catch (err) { logger.error({ err }, "[groups/transfer]"); res.status(500).json({ error: "internal_error" }); }
});

export default router;
