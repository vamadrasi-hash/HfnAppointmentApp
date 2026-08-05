/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** Optional. Without it the app falls back to pasted Google Maps links. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
  /**
   * Optional. The public half of a VAPID key pair. Without it the app
   * still raises pop-ups while it is open; with it, and the `send-push`
   * edge function deployed, it reaches a device with the app closed.
   */
  readonly VITE_VAPID_PUBLIC_KEY?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
