import { useState } from 'react'
import { useClerk } from '@clerk/react'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  BarChart2,
  Bot,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Package,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Star,
  Sword,
  Wallet,
  X,
} from 'lucide-react'
import { type ReactNode } from 'react'
import { AvatarBadge } from '@/components/common/AvatarBadge'
import { type CharacterType } from '@/data/characterSpriteMap'

interface NavItem {
  label: string
  icon: React.ElementType
  to?: string
  soon?: boolean
}

const VENDOR_NAV: NavItem[] = [
  { label: 'Dashboard',    icon: LayoutDashboard, to: '/vendor/dashboard' },
  { label: 'Catalog',      icon: Package,         to: '/vendor/catalog' },
  { label: 'My Agent',     icon: Bot,             to: '/vendor/agent/train' },
  { label: 'Reports',      icon: BarChart2,       to: '/vendor/reports' },
  { label: 'Transactions', icon: Receipt,         to: '/vendor/transactions' },
  { label: 'Wallet',       icon: Wallet,          soon: true },
]

const CONSUMER_NAV: NavItem[] = [
  { label: 'Hub',          icon: LayoutDashboard, to: '/consumer/hub' },
  { label: 'Marketplace',  icon: ShoppingBag,     to: '/consumer/marketplace' },
  { label: 'My Agent',     icon: Bot,             to: '/consumer/agent/train' },
  { label: 'Simulation',   icon: Sword,           to: '/consumer/mission/new' },
  { label: 'Basket',       icon: ShoppingCart,    to: '/consumer/basket' },
  { label: 'Transactions', icon: Receipt,         to: '/consumer/transactions' },
  { label: 'Ratings',      icon: Star,            to: '/consumer/ratings' },
  { label: 'Wallet',       icon: Wallet,          soon: true },
  { label: 'Scout Zones',  icon: MapPin,          soon: true },
]

interface AppShellProps {
  role: 'vendor' | 'consumer'
  characterType?: CharacterType
  displayName?: string
  children: ReactNode
}

function SidebarContent({
  role,
  characterType,
  displayName,
  onNavClick,
}: {
  role: 'vendor' | 'consumer'
  characterType?: CharacterType
  displayName?: string
  onNavClick?: () => void
}) {
  const { signOut } = useClerk()
  const { location } = useRouterState()
  const navItems = role === 'vendor' ? VENDOR_NAV : CONSUMER_NAV

  return (
    <div className="flex flex-col h-full">
      {/* User identity */}
      <div className="p-4 border-b-2 border-accent-dark flex items-center gap-3 shrink-0">
        {characterType ? (
          <AvatarBadge characterType={characterType} size="lg" />
        ) : (
          <div className="w-12 h-12 rounded-sm border-2 border-accent-dark bg-zinc-800 flex items-center justify-center shrink-0">
            <span className="font-pixel text-lg text-zinc-600 select-none">?</span>
          </div>
        )}
        <div className="min-w-0">
          <p className="font-pixel text-xs text-white truncate">{displayName ?? 'Agent'}</p>
          <span className={`badge-pixel ${role === 'vendor' ? 'badge-pixel-primary' : 'badge-pixel-secondary'} mt-1`}>
            {role}
          </span>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-3 flex flex-col gap-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = item.to ? location.pathname === item.to : false

          if (item.soon) {
            return (
              <div
                key={item.label}
                className="flex items-center gap-2 px-3 py-2.5 mx-2 rounded-sm opacity-40 cursor-not-allowed"
              >
                <span className="w-3 shrink-0" />
                <Icon size={14} className="text-zinc-500 shrink-0" />
                <span className="font-pixel text-[11px] text-zinc-500 flex-1">{item.label}</span>
                <span className="badge-pixel badge-pixel-warning text-[9px] px-1 py-0">Soon</span>
              </div>
            )
          }

          return (
            <Link
              key={item.label}
              to={item.to!}
              onClick={onNavClick}
              className={[
                'flex items-center gap-2 px-3 py-2.5 mx-2 rounded-sm transition-colors',
                isActive
                  ? role === 'vendor'
                    ? 'bg-primary/20 text-primary'
                    : 'bg-secondary/20 text-secondary'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5',
              ].join(' ')}
            >
              <span className={`font-pixel text-[8px] w-3 shrink-0 ${isActive ? 'opacity-100' : 'opacity-0'}`}>▶</span>
              <Icon size={14} className="shrink-0" />
              <span className="font-pixel text-[11px]">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Sign out */}
      <div className="p-3 border-t-2 border-accent-dark shrink-0">
        <button
          onClick={() => signOut()}
          className="w-full flex items-center gap-2 px-3 py-2 text-zinc-500 hover:text-red-400 transition-colors font-pixel text-[11px]"
        >
          <LogOut size={13} />
          Sign out
        </button>
      </div>
    </div>
  )
}

export function AppShell({ role, characterType, displayName, children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="flex min-h-[calc(100vh-57px)] relative">
      {/* Desktop sidebar — hidden on mobile */}
      <aside className="hidden md:flex w-56 shrink-0 border-r-2 border-accent-dark bg-panel-dark flex-col">
        <SidebarContent role={role} characterType={characterType} displayName={displayName} />
      </aside>

      {/* Mobile hamburger button */}
      <button
        onClick={() => setDrawerOpen(true)}
        className="md:hidden fixed top-[69px] left-3 z-30 panel-block p-2 text-zinc-400 hover:text-white transition-colors"
        aria-label="Open navigation"
      >
        <Menu size={16} />
      </button>

      {/* Mobile drawer backdrop */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Mobile drawer panel */}
      <aside
        className={[
          'md:hidden fixed top-0 left-0 h-full w-64 z-50 bg-panel-dark border-r-2 border-accent-dark',
          'transition-transform duration-300 ease-in-out',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-0">
          <span className="font-pixel text-sm text-primary">Agentopolis</span>
          <button
            onClick={() => setDrawerOpen(false)}
            className="text-zinc-500 hover:text-white transition-colors p-1"
            aria-label="Close navigation"
          >
            <X size={16} />
          </button>
        </div>
        <SidebarContent
          role={role}
          characterType={characterType}
          displayName={displayName}
          onNavClick={() => setDrawerOpen(false)}
        />
      </aside>

      {/* Main content — left padding on mobile to clear the hamburger */}
      <main className="flex-1 overflow-y-auto bg-[#1A1A1A] p-6 pt-14 md:pt-6 lg:p-8">
        {children}
      </main>
    </div>
  )
}
