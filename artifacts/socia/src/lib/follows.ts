import { supabase, fetchProfile, type DbUser } from "./supabase";

export interface FollowResult {
  success: boolean;
  profile?: DbUser | null;
  error?: string | null;
}

export async function followUser(targetId: string): Promise<FollowResult> {
  try {
    const res = await supabase.rpc("follow_user", { target_id: targetId });
    if (res.error) return { success: false, error: res.error.message };
    // Re-fetch target profile counts to get authoritative followers/following
    const profile = await fetchProfile(targetId);
    return { success: true, profile: profile ?? null };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function unfollowUser(targetId: string): Promise<FollowResult> {
  try {
    const res = await supabase.rpc("unfollow_user", { target_id: targetId });
    if (res.error) return { success: false, error: res.error.message };
    const profile = await fetchProfile(targetId);
    return { success: true, profile: profile ?? null };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}
