import { useUser } from '@clerk/react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Package,
  Search,
  ShoppingBag,
  X,
  Store,
  Tag,
  Layers,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/common/EmptyState'
import { ProtectedRoute } from '@/components/common/ProtectedRoute'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { useMarketplaceFeed } from '@/hooks/useProducts'
import type { MarketplaceProduct } from '@/services/productService'
import apiClient from '@/services/api'
import { type CharacterType } from '@/data/characterSpriteMap'
import { cn } from '@/lib/utils'

// ── Constants ─────────────────────────────────────────────────────────────────

const DOMAINS = [
  { value: '', label: 'All' },
  { value: 'vegetables', label: '🥦 Vegetables' },
  { value: 'fruits', label: '🍎 Fruits' },
  { value: 'grocery', label: '🛒 Grocery' },
  { value: 'pharma', label: '💊 Pharma' },
  { value: 'electronics', label: '⚡ Electronics' },
  { value: 'furniture', label: '🪑 Furniture' },
  { value: 'bakery', label: '🍞 Bakery' },
]

const DOMAIN_BADGE: Record<string, string> = {
  vegetables: 'badge-pixel-primary',
  fruits: 'badge-pixel-warning',
  grocery: 'badge-pixel-secondary',
  pharma: 'badge-pixel-danger',
  electronics: 'badge-pixel-secondary',
  furniture: 'badge-pixel-warning',
  bakery: 'badge-pixel-primary',
}

// ── Skeletons ─────────────────────────────────────────────────────────────────

function FeedSkeleton({ count = 9 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="panel-block overflow-hidden animate-pulse">
          <div className="aspect-square bg-zinc-800 border-b-2 border-accent-dark" />
          <div className="p-3 space-y-2">
            <div className="h-3.5 w-3/4 bg-zinc-700 rounded-sm" />
            <div className="h-3 w-1/2 bg-zinc-800 rounded-sm" />
            <div className="flex justify-between mt-1">
              <div className="h-3 w-16 bg-zinc-700 rounded-sm" />
              <div className="h-3 w-12 bg-zinc-800 rounded-sm" />
            </div>
          </div>
        </div>
      ))}
    </>
  )
}

// ── Product Feed Card ─────────────────────────────────────────────────────────

const CARD_IN = {
  hidden: { opacity: 0, scale: 0.96 },
  show: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: { duration: 0.22, delay: Math.min(i * 0.04, 0.4) },
  }),
}

interface FeedCardProps {
  product: MarketplaceProduct
  index: number
  onClick: () => void
}

function FeedCard({ product, index, onClick }: FeedCardProps) {
  const price = parseFloat(product.price)
  const mrp = product.mrp ? parseFloat(product.mrp) : null
  const hasSaving = mrp && mrp > price
  const domain = product.shops?.domain ?? ''

  return (
    <motion.button
      custom={index}
      variants={CARD_IN}
      initial="hidden"
      animate="show"
      onClick={onClick}
      className="panel-block overflow-hidden text-left group w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {/* Square image */}
      <div className="relative aspect-square bg-zinc-900 border-b-2 border-accent-dark overflow-hidden">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package size={32} className="text-zinc-700" />
          </div>
        )}

        {/* Domain badge overlay */}
        {domain && (
          <div className="absolute top-2 left-2">
            <span className={cn('badge-pixel text-[9px]', DOMAIN_BADGE[domain] ?? 'badge-pixel-secondary')}>
              {DOMAINS.find((d) => d.value === domain)?.label?.split(' ')[1] ?? domain}
            </span>
          </div>
        )}

        {product.stock_count === 0 && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="font-pixel text-xs text-red-300">Out of stock</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-1.5">
        <p className="font-pixel text-xs text-white leading-tight line-clamp-2 group-hover:text-primary transition-colors">
          {product.name}
        </p>
        <p className="font-body text-[11px] text-zinc-500 truncate">
          {product.shops?.name ?? 'Unknown shop'}
        </p>
        <div className="flex items-center justify-between pt-0.5">
          <span className="font-pixel text-sm text-primary">
            ₹{price.toLocaleString('en-IN')}
          </span>
          {hasSaving && (
            <span className="font-body text-[10px] text-zinc-500 line-through">
              ₹{mrp!.toLocaleString('en-IN')}
            </span>
          )}
        </div>
      </div>
    </motion.button>
  )
}

// ── Product Detail Sheet ──────────────────────────────────────────────────────

function ProductDetailSheet({
  product,
  onClose,
}: {
  product: MarketplaceProduct | null
  onClose: () => void
}) {
  const price = product ? parseFloat(product.price) : 0
  const mrp = product?.mrp ? parseFloat(product.mrp) : null
  const hasSaving = mrp && mrp > price
  const savingPct = hasSaving ? Math.round(((mrp! - price) / mrp!) * 100) : 0
  const domain = product?.shops?.domain ?? ''

  return (
    <Sheet open={!!product} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent
        side="right"
        className="!bg-[#1c1c1c] !border-l-4 !border-accent-dark !w-full sm:!max-w-md flex flex-col p-0 gap-0"
      >
        {product && (
          <>
            {/* Image */}
            <div className="relative h-56 bg-zinc-900 border-b-2 border-accent-dark shrink-0 overflow-hidden">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package size={48} className="text-zinc-700" />
                </div>
              )}
              {domain && (
                <div className="absolute top-3 left-3">
                  <span className={cn('badge-pixel', DOMAIN_BADGE[domain] ?? 'badge-pixel-secondary')}>
                    {DOMAINS.find((d) => d.value === domain)?.label ?? domain}
                  </span>
                </div>
              )}
            </div>

            <SheetHeader className="px-5 pt-5 pb-0">
              <SheetTitle className="font-pixel text-base text-white leading-snug">
                {product.name}
              </SheetTitle>
              <SheetDescription className="font-body text-xs text-zinc-500 mt-1">
                {product.description ?? 'No description provided.'}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* Price block */}
              <div className="panel-block p-4 flex items-center justify-between">
                <div>
                  <p className="font-pixel text-2xl text-primary">
                    ₹{price.toLocaleString('en-IN')}
                  </p>
                  {hasSaving && (
                    <p className="font-body text-xs text-zinc-500 mt-0.5">
                      <span className="line-through">₹{mrp!.toLocaleString('en-IN')}</span>
                      {' '}
                      <span className="text-primary-light">{savingPct}% off MRP</span>
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-pixel text-xs text-zinc-500">In Stock</p>
                  <p className={cn(
                    'font-pixel text-sm mt-0.5',
                    product.stock_count > 0 ? 'text-primary' : 'text-red-400'
                  )}>
                    {product.stock_count > 0 ? product.stock_count : 'Sold out'}
                  </p>
                </div>
              </div>

              {/* Shop info */}
              <div className="space-y-2">
                <p className="font-pixel text-[10px] text-zinc-500 uppercase tracking-wider">Shop</p>
                <div className="panel-block p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-sm border-2 border-primary bg-primary/10 flex items-center justify-center shrink-0">
                    <Store size={14} className="text-primary" />
                  </div>
                  <div>
                    <p className="font-pixel text-xs text-white">{product.shops?.name}</p>
                    <p className="font-body text-[11px] text-zinc-500 mt-0.5">
                      {DOMAINS.find((d) => d.value === product.shops?.domain)?.label ?? product.shops?.domain}
                    </p>
                  </div>
                </div>
              </div>

              {/* Meta */}
              <div className="grid grid-cols-2 gap-3">
                {product.category && (
                  <div className="panel-block p-3 flex items-center gap-2">
                    <Tag size={12} className="text-zinc-500 shrink-0" />
                    <div>
                      <p className="font-pixel text-[9px] text-zinc-600 uppercase">Category</p>
                      <p className="font-body text-xs text-white mt-0.5">{product.category}</p>
                    </div>
                  </div>
                )}
                <div className="panel-block p-3 flex items-center gap-2">
                  <Layers size={12} className="text-zinc-500 shrink-0" />
                  <div>
                    <p className="font-pixel text-[9px] text-zinc-600 uppercase">Listed</p>
                    <p className="font-body text-xs text-white mt-0.5">
                      {new Date(product.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Agent hint */}
              <div className="bg-secondary/10 border-2 border-secondary-dark rounded-sm p-4">
                <p className="font-pixel text-[10px] text-secondary-light uppercase tracking-wider mb-1">
                  Agent tip
                </p>
                <p className="font-body text-xs text-zinc-400 leading-relaxed">
                  Your shopping agent will negotiate this price automatically when
                  you start a mission. Set your budget first in the Hub.
                </p>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ── Search Bar ────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function ConsumerMarketplaceInner() {
  const { user } = useUser()
  const [domain, setDomain] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const search = useDebounce(searchInput, 300)
  const [selectedProduct, setSelectedProduct] = useState<MarketplaceProduct | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const { data: profile } = useQuery<{ display_name: string | null; avatar_config: { character_type?: string } | null }>({
    queryKey: ['user-profile'],
    queryFn: () => apiClient.get('/v1/users/me').then((r) => r.data),
  })

  const { data: feed = [], isLoading, isError } = useMarketplaceFeed({ domain, search })

  const characterType = (
    profile?.avatar_config?.character_type as CharacterType | undefined
  ) ?? (user?.unsafeMetadata?.avatar_config as { character_type?: CharacterType } | undefined)?.character_type

  const displayName = profile?.display_name ?? user?.firstName ?? user?.username ?? 'Shopper'

  return (
    <AppShell role="consumer" characterType={characterType} displayName={displayName}>
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div>
          <h1 className="font-pixel text-2xl font-bold text-secondary">Marketplace</h1>
          <p className="font-body text-sm text-zinc-500 mt-1">
            Browse products from all vendors. Your agent will negotiate on your behalf.
          </p>
        </div>

        {/* Filter + search bar */}
        <div className="space-y-3">
          {/* Domain pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {DOMAINS.map((d) => (
              <button
                key={d.value}
                onClick={() => setDomain(d.value)}
                className={cn(
                  'btn-pixel btn-pixel-sm shrink-0 transition-all',
                  domain === d.value ? 'btn-pixel-secondary' : 'btn-pixel-ghost'
                )}
              >
                {d.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
            />
            <input
              ref={searchRef}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search products…"
              className="w-full bg-zinc-900 border-2 border-accent-dark rounded-sm pl-9 pr-9 py-2.5 font-body text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-secondary transition-colors"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Result count */}
        {!isLoading && !isError && feed.length > 0 && (
          <p className="font-body text-xs text-zinc-600">
            {feed.length} product{feed.length !== 1 ? 's' : ''}
            {domain && ` in ${DOMAINS.find((d) => d.value === domain)?.label}`}
            {search && ` matching "${search}"`}
          </p>
        )}

        {/* Error */}
        {isError && (
          <div className="panel-block border-danger p-5 flex items-center gap-3">
            <ShoppingBag size={18} className="text-red-400 shrink-0" />
            <p className="font-body text-sm text-red-300">
              Failed to load marketplace. Check your connection and refresh.
            </p>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <FeedSkeleton count={8} />
          </div>
        )}

        {/* Empty */}
        {!isLoading && !isError && feed.length === 0 && (
          <EmptyState
            icon={ShoppingBag}
            title={search || domain ? 'No products match' : 'Marketplace is empty'}
            description={
              search || domain
                ? 'Try a different filter or search term.'
                : 'No vendors have listed products yet. Check back soon.'
            }
            action={
              (search || domain)
                ? {
                    label: 'Clear filters',
                    onClick: () => { setDomain(''); setSearchInput('') },
                    variant: 'secondary',
                  }
                : undefined
            }
          />
        )}

        {/* Grid */}
        {!isLoading && !isError && feed.length > 0 && (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${domain}-${search}`}
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {feed.map((p, i) => (
                <FeedCard
                  key={p.id}
                  product={p}
                  index={i}
                  onClick={() => setSelectedProduct(p)}
                />
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* Detail sheet */}
      <ProductDetailSheet
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
    </AppShell>
  )
}

export default function ConsumerMarketplacePage() {
  return (
    <ProtectedRoute requiredRole="consumer">
      <ConsumerMarketplaceInner />
    </ProtectedRoute>
  )
}
