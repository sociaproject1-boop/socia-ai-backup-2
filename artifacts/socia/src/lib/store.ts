import { create } from 'zustand';

export interface PrivacySettings {
  postsVisibility?: string;
  whoCanMessage?:   string;
  showLocation?:    boolean;
  showBirthday?:    boolean;
  showRelationship?: boolean;
  showGender?:      boolean;
  showContact?:     boolean;
}

export interface User {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  bio: string;
  followers: number;
  following: number;
  plan?: 'free' | 'premium';
  /* Profile extensions (schema §13/§14) */
  isOwner?:    boolean;
  isVerified?: boolean;
  isOnline?:   boolean;
  social?: {
    facebook?:  string;
    instagram?: string;
    tiktok?:    string;
    x?:         string;
    youtube?:   string;
    linkedin?:  string;
  };
  /* Extended profile fields */
  website?:           string;
  location?:          string;
  gender?:            string;
  birthday?:          string;
  relationshipStatus?: string;
  work?:              string;
  workPrevious?:      string;
  education?:         string;
  school?:            string;
  college?:           string;
  public_email?:      string;
  public_phone?:      string;
  privacySettings?:   PrivacySettings;
}

export interface Post {
  id: string;
  authorId: string;
  imageUrl: string;
  videoUrl?: string;
  prompt: string;
  type: 'image' | 'video';
  duration?: string;
  likes: number;
  hasLiked?: boolean;
  createdAt: string;
}

export interface Message {
  id: string;
  senderId: string;
  text?: string;
  generation?: { imageUrl: string; prompt: string };
  timestamp: string;
}

export interface Chat {
  id: string;
  participant: User;
  messages: Message[];
  unread: boolean;
}

interface AppState {
  isAuthenticated: boolean;
  user: User | null;
  posts: Post[];
  chats: Chat[];
  savedPrompts: string[];
  savedPostIds: string[];
  followedUserIds: string[];
  activePrompt: string;
  unreadMessageCount: number;

  login: () => void;
  logout: () => void;
  setUser: (user: User) => void;
  setActivePrompt: (prompt: string) => void;
  setUnreadMessageCount: (n: number) => void;
  toggleLike: (postId: string) => void;
  toggleSavePost: (postId: string) => void;
  setFollowedUserIds: (ids: string[]) => void;
  toggleFollowUser: (userId: string) => void;
  sendMessage: (chatId: string, message: Partial<Message>) => void;
  addPost: (post: Omit<Post, 'id' | 'likes' | 'createdAt'>) => void;
  markChatRead: (chatId: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isAuthenticated: false,
  user: null,
  posts: [],
  chats: [],
  savedPrompts: [],
  savedPostIds: [],
  followedUserIds: [],
  activePrompt: '',
  unreadMessageCount: 0,

  login: () => set({ isAuthenticated: true }),
  logout: () => set({ isAuthenticated: false, user: null, posts: [], chats: [], savedPrompts: [], savedPostIds: [], followedUserIds: [], activePrompt: '', unreadMessageCount: 0 }),
  setUser: (user) => set({ user }),
  setActivePrompt: (prompt) => set({ activePrompt: prompt }),
  setUnreadMessageCount: (n) => set({ unreadMessageCount: n }),

  toggleLike: (postId) => set((state) => ({
    posts: state.posts.map(p => {
      if (p.id !== postId) return p;
      const hasLiked = !p.hasLiked;
      return { ...p, hasLiked, likes: p.likes + (hasLiked ? 1 : -1) };
    }),
  })),

  toggleSavePost: (postId) => set((state) => ({
    savedPostIds: state.savedPostIds.includes(postId)
      ? state.savedPostIds.filter(id => id !== postId)
      : [...state.savedPostIds, postId],
  })),

  setFollowedUserIds: (ids) => set({ followedUserIds: ids }),

  toggleFollowUser: (userId) => set((state) => {
    const following = state.followedUserIds.includes(userId)
      ? state.followedUserIds.filter(id => id !== userId)
      : [...state.followedUserIds, userId];
    return {
      followedUserIds: following,
      user: state.user ? { ...state.user, following: following.length } : null,
    };
  }),

  sendMessage: (chatId, message) => set((state) => ({
    chats: state.chats.map(chat => {
      if (chat.id !== chatId) return chat;
      return {
        ...chat,
        messages: [...chat.messages, {
          id: Date.now().toString(),
          senderId: state.user?.id || 'me',
          timestamp: new Date().toISOString(),
          ...message,
        } as Message],
      };
    }),
  })),

  addPost: (post) => set((state) => ({
    posts: [{
      ...post,
      id: Date.now().toString(),
      likes: 0,
      createdAt: new Date().toISOString(),
    }, ...state.posts],
  })),

  markChatRead: (chatId) => set((state) => {
    const target = state.chats.find(c => c.id === chatId);
    if (!target?.unread) return state;
    return { chats: state.chats.map(c => c.id === chatId ? { ...c, unread: false } : c) };
  }),
}));
