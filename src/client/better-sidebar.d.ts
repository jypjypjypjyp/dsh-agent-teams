/**
 * Structural client-side mirror of dsh-better-sidebar's service. This
 * package deliberately does NOT import the host plugin so it stays optional;
 * values are only accessed through `ctx.get('betterSidebar')` at runtime.
 *
 * Declared as an optional member on the Cordis Context used by
 * `@deepseek-ai/dsh-client-runtime/client` (`ClientContext = Context`), so
 * consuming code can reference `ctx.betterSidebar` when present. The runtime
 * value is still probed via `ctx.get(...)` (or the declared member) and every
 * call site guards against `undefined`.
 */
import type { ReactNode } from 'react'

/** Minimal structural mirror of the host service (v0.13.0 surface). */
export interface BetterSidebarService {
  registerTab(descriptor: BetterSidebarTabDescriptor): () => void
  openTab(
    seed: { type: string; title?: string; id?: string; path?: string; url?: string; meta?: unknown },
    scope?: { sessionId: string; cwd?: string },
  ): void
  isTabEnabled(id: string): boolean
  getTabs(): readonly BetterSidebarTabDescriptor[]
  getTab(id: string): BetterSidebarTabDescriptor | undefined
  getSnapshot(): { sessionId: string | undefined; state: { panelOpen: boolean } | undefined }
  subscribe(listener: () => void): () => void
  subscribeState(listener: () => void): () => void
  version: string
  features: readonly string[]
}

/** One tab descriptor accepted by the host registry. */
export interface BetterSidebarTabDescriptor {
  id: string
  title: string | (() => string)
  icon?: ReactNode | ((size: number) => ReactNode)
  order?: number
  hidden?: boolean
  single?: boolean
  badge?: (
    ctx: unknown,
    scope: { sessionId: string; cwd?: string },
    state: unknown,
  ) => string | number | null | undefined
  component: (props: {
    ctx: unknown
    store: unknown
    scope: { sessionId: string; cwd?: string }
    tab: { id: string; type: string; title: string; meta?: unknown }
    visible: boolean
  }) => ReactNode
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Present only when dsh-better-sidebar is loaded. */
    betterSidebar?: BetterSidebarService
  }
}
