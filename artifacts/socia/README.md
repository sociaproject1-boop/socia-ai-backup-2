# Socia

A premium mobile-first social network for AI-generated visual content. Dark, neon, native-feeling.

## Stack

- React + Vite + TypeScript
- Tailwind CSS (dark mode, neon gradient palette)
- Framer Motion for transitions and micro-interactions
- Wouter for routing
- Zustand for app state (auth flag, posts, chats, saved prompts)
- Lucide for iconography

## Folder Structure

```
src/
  components/
    shell/        AppShell, TopBar, BottomNav
    feed/         FeedCard
    create/       Generator (shared by all 4 modes)
    ui/           shadcn-style primitives (kept for future use)
  pages/          Route components
  lib/
    ai.ts         Generation API (currently mock; swap in Replicate)
    store.ts      Zustand store + types
    mockData.ts   Seed users, posts, chats, prompts
    utils.ts      cn() helper
  assets/feed/    Generated AI artwork bank used across the app
```

## Wiring up Firebase later

Auth + chat are wired through `src/lib/store.ts`. To swap mock state for Firebase:

1. Add deps:
   ```
   pnpm --filter @workspace/socia add firebase
   ```
2. Add a `.env` with the standard Firebase config (use Vite's `VITE_` prefix):
   ```
   VITE_FIREBASE_API_KEY=
   VITE_FIREBASE_AUTH_DOMAIN=
   VITE_FIREBASE_PROJECT_ID=
   VITE_FIREBASE_STORAGE_BUCKET=
   VITE_FIREBASE_MESSAGING_SENDER_ID=
   VITE_FIREBASE_APP_ID=
   ```
3. Create `src/lib/firebase.ts` that initializes `initializeApp`, `getAuth`, and `getFirestore`.
4. Inside `src/lib/store.ts`:
   - Replace `login` / `logout` with `signInWithEmailAndPassword` / `signOut`. Subscribe to `onAuthStateChanged` and update `isAuthenticated` and `user`.
   - Replace the `chats` slice with a Firestore listener (`onSnapshot` over a `chats` collection where `participants` includes the current user).
   - In `sendMessage`, write to `chats/{id}/messages` instead of mutating local state.
   - In `addPost`, write to a `posts` collection.

## Wiring up Replicate (or any image/video model)

Generation goes through `src/lib/ai.ts`. The four exposed functions are:

- `generateImage(prompt, opts)`
- `generateVideo(prompt, opts)`
- `imageToVideo(image, prompt, opts)`
- `framesToVideo(start, end, prompt, opts)`

Each returns `Promise<{ url, type, durationSec?, prompt }>`.

To plug in Replicate:

1. Add a `.env` with `REPLICATE_API_TOKEN` on a server you control (never ship Replicate tokens to the browser).
2. Add a small server route at `/api/generate` (e.g. in `artifacts/api-server`) that accepts `{ mode, prompt, image?, startFrame?, endFrame?, opts }`, calls Replicate, polls for completion, and returns `{ url, type, durationSec? }`.
3. In each function in `src/lib/ai.ts`, replace the body with a `fetch('/api/generate', { method: 'POST', body: JSON.stringify({...}) })` call.

## Run

This artifact is wired into the workspace's preview routing — there's no need to run anything by hand. The preview pane will show it at the project root.
