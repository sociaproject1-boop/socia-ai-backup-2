-- ================================================================
-- SECTION 13 of 13 — Storage: chat-images bucket policies
-- Path convention enforced: {userId}/{filename}
-- The first folder segment must equal auth.uid() so users can
-- only upload/delete files inside their own folder.
-- Safe to run multiple times (idempotent).
-- ================================================================
BEGIN;

DROP POLICY IF EXISTS "chat_images_upload_own_folder"    ON storage.objects;
DROP POLICY IF EXISTS "chat_images_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "chat_images_delete_own_folder"    ON storage.objects;

CREATE POLICY "chat_images_upload_own_folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "chat_images_select_authenticated" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-images'
  );

CREATE POLICY "chat_images_delete_own_folder" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;
