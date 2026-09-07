import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
} from 'react'
import { Menu, X } from 'lucide-react'
import { Button } from './button'
import { cn } from '@/lib/utils'

const SIDEBAR_COOKIE_NAME = 'sidebar_state'
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const MOBILE_BREAKPOINT = '(max-width: 767px)'

type SidebarState = 'expanded' | 'collapsed'
type SidebarContextValue = {
  state: SidebarState
  open: boolean
  setOpen: (open: boolean | ((open: boolean) => boolean)) => void
  openMobile: boolean
  setOpenMobile: (open: boolean | ((open: boolean) => boolean)) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

function readPersistedOpen() {
  if (typeof document === 'undefined') return undefined
  const value = document.cookie.split('; ').find((cookie) => cookie.startsWith(`${SIDEBAR_COOKIE_NAME}=`))
  if (!value) return undefined
  return value.split('=')[1] !== 'false'
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mediaQuery = window.matchMedia(MOBILE_BREAKPOINT)
    const update = () => setIsMobile(mediaQuery.matches)
    update()
    mediaQuery.addEventListener?.('change', update)
    return () => mediaQuery.removeEventListener?.('change', update)
  }, [])

  return isMobile
}

export interface SidebarProviderProps extends ComponentProps<'div'> {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function SidebarProvider({
  defaultOpen,
  open: openProp,
  onOpenChange,
  className,
  children,
  ...props
}: SidebarProviderProps) {
  const [openState, setOpenState] = useState(() => defaultOpen ?? readPersistedOpen() ?? true)
  const open = openProp ?? openState
  const [openMobile, setOpenMobile] = useState(false)
  const isMobile = useIsMobile()

  const setOpen = useCallback<SidebarContextValue['setOpen']>((value) => {
    const nextOpen = typeof value === 'function' ? value(open) : value
    if (onOpenChange) onOpenChange(nextOpen)
    else setOpenState(nextOpen)
    document.cookie = `${SIDEBAR_COOKIE_NAME}=${nextOpen}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
  }, [onOpenChange, open])

  const toggleSidebar = useCallback(() => {
    if (isMobile) setOpenMobile((current) => !current)
    else setOpen((current) => !current)
  }, [isMobile, setOpen])

  const contextValue = useMemo<SidebarContextValue>(() => ({
    state: open ? 'expanded' : 'collapsed',
    open,
    setOpen,
    openMobile,
    setOpenMobile,
    isMobile,
    toggleSidebar,
  }), [isMobile, open, openMobile, setOpen, toggleSidebar])

  return (
    <SidebarContext.Provider value={contextValue}>
      <div data-slot="sidebar-wrapper" className={cn('group/sidebar-wrapper flex min-h-svh w-full', className)} {...props}>
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) throw new Error('useSidebar must be used within a SidebarProvider')
  return context
}

export type SidebarProps = ComponentProps<'aside'> & {
  side?: 'left' | 'right'
  variant?: 'sidebar' | 'floating' | 'inset'
  collapsible?: 'offcanvas' | 'icon' | 'none'
}

export function Sidebar({
  side = 'left',
  variant = 'sidebar',
  collapsible = 'offcanvas',
  className,
  children,
  'aria-label': ariaLabel = 'Sidebar',
  ...props
}: SidebarProps) {
  const { state, isMobile, openMobile, setOpenMobile } = useSidebar()

  useEffect(() => {
    if (!isMobile || !openMobile) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMobile(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [isMobile, openMobile, setOpenMobile])

  const content = (
    <>
      {children}
      {isMobile && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          onClick={() => setOpenMobile(false)}
        >
          <X className="size-4" />
        </button>
      )}
    </>
  )

  if (isMobile) {
    return (
      <>
        <button
          type="button"
          aria-label="Close sidebar"
          aria-hidden={!openMobile}
          tabIndex={openMobile ? 0 : -1}
          className={cn('fixed inset-0 z-40 bg-black/50 transition-opacity md:hidden', openMobile ? 'opacity-100' : 'pointer-events-none opacity-0')}
          onClick={() => setOpenMobile(false)}
        />
        <aside
          data-slot="sidebar"
          data-mobile="true"
          data-state={openMobile ? 'expanded' : 'collapsed'}
          data-side={side}
          data-variant={variant}
          aria-label={ariaLabel}
          aria-hidden={!openMobile}
          className={cn(
            'group/sidebar fixed inset-y-0 z-50 flex h-svh w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground shadow-xl transition-transform duration-200 md:hidden',
            side === 'left' ? 'left-0' : 'right-0',
            openMobile ? 'translate-x-0' : side === 'left' ? '-translate-x-full' : 'translate-x-full',
            className,
          )}
          {...props}
        >
          {content}
        </aside>
      </>
    )
  }

  return (
    <aside
      data-slot="sidebar"
      data-mobile="false"
      data-state={collapsible === 'none' ? 'expanded' : state}
      data-collapsible={collapsible === 'none' ? undefined : state === 'collapsed' ? collapsible : ''}
      data-side={side}
      data-variant={variant}
      aria-label={ariaLabel}
      className={cn(
        'group/sidebar sticky top-0 flex h-svh shrink-0 flex-col border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-linear',
        side === 'left' ? 'border-r' : 'border-l',
        state === 'expanded' || collapsible === 'none' ? 'w-64' : collapsible === 'icon' ? 'w-12' : 'w-0 overflow-hidden border-0',
        variant === 'floating' && 'm-2 h-[calc(100svh-1rem)] rounded-lg border shadow-sm',
        variant === 'inset' && 'border-none',
        className,
      )}
      {...props}
    >
      {content}
    </aside>
  )
}

export function SidebarTrigger({ className, onClick, ...props }: ComponentProps<typeof Button>) {
  const { isMobile, open, openMobile, toggleSidebar } = useSidebar()
  return (
    <Button
      data-slot="sidebar-trigger"
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Toggle sidebar"
      aria-expanded={isMobile ? openMobile : open}
      className={cn('size-8', className)}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <Menu className="size-4" />
      <span className="sr-only">Toggle sidebar</span>
    </Button>
  )
}

export function SidebarRail({ className, ...props }: ComponentProps<'button'>) {
  const { toggleSidebar } = useSidebar()
  return (
    <button
      type="button"
      data-slot="sidebar-rail"
      aria-label="Toggle sidebar"
      tabIndex={-1}
      className={cn('absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear after:absolute after:inset-y-0 after:left-1/2 after:w-px hover:after:bg-sidebar-border md:flex', className)}
      onClick={toggleSidebar}
      {...props}
    />
  )
}

export function SidebarInset({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="sidebar-inset" className={cn('relative flex min-h-svh min-w-0 flex-1 flex-col bg-background', className)} {...props} />
}

export function SidebarHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="sidebar-header" className={cn('flex flex-col gap-2 p-2', className)} {...props} />
}

export function SidebarContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="sidebar-content" className={cn('flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-2', className)} {...props} />
}

export function SidebarFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="sidebar-footer" className={cn('flex flex-col gap-2 p-2', className)} {...props} />
}

export type SidebarMenuProps = ComponentProps<'ul'>

export function SidebarMenu({ className, ...props }: SidebarMenuProps) {
  return <ul data-slot="sidebar-menu" className={cn('flex w-full min-w-0 flex-col gap-1', className)} {...props} />
}

export function SidebarMenuItem({ className, ...props }: ComponentProps<'li'>) {
  return <li data-slot="sidebar-menu-item" className={cn('group/menu-item relative', className)} {...props} />
}
