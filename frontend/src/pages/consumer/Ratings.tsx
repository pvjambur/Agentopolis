import { useUser } from '@clerk/react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Frown, Meh, SmilePlus, Star, ThumbsDown, ThumbsUp } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { ProtectedRoute } from '@/components/common/ProtectedRoute'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { usePageTitle } from '@/hooks/usePageTitle'
import { type CharacterType } from '@/data/characterSpriteMap'
import apiClient from '@/services/api'

interface RatingRow {
  id: string
  shop_id: string
  negotiation_id: string | null
  score: number
  sentiment: 'positive' | 'neutral' | 'negative'
  notes: string | null
  created_at: string
  shops: { name: string; domain: string } | null
}

interface UserProfile {
  display_name: string | null
  avatar_config: { character_type?: string } | null
}

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.25, delay: i * 0.05, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
}

function SentimentIcon({ sentiment }: { sentiment: string }) {
  if (sentiment === 'positive') return <ThumbsUp size={13} className="text-green-400" />
  if (sentiment === 'negative') return <ThumbsDown size={13} className="text-red-400" />
  return <Meh size={13} className="text-zinc-500" />
}

function ScoreStars({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={10}
          className={i < score ? 'text-yellow-400 fill-yellow-400' : 'text-zinc-700'}
        />
      ))}
    </div>
  )
}

function RatingCard({ rating, index }: { rating: RatingRow; index: number }) {
  const shopName = rating.shops?.name ?? 'Unknown Shop'
  const domain = rating.shops?.domain ?? ''
  const date = new Date(rating.created_at).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  const scoreColor = rating.score >= 4 ? 'text-green-400' : rating.score <= 2 ? 'text-red-400' : 'text-yellow-400'
  const ScoreIcon = rating.score >= 4 ? SmilePlus : rating.score <= 2 ? Frown : Meh

  return (
    <motion.div
      custom={index}
      variants={CARD_VARIANTS}
      initial="hidden"
      animate="show"
      className="panel-block p-4 flex items-start gap-4"
    >
      <div className={`w-9 h-9 rounded-sm border-2 flex items-center justify-center shrink-0 ${
        rating.score >= 4 ? 'border-green-700 bg-green-900/30'
        : rating.score <= 2 ? 'border-red-700 bg-red-900/30'
        : 'border-zinc-600 bg-zinc-800'
      }`}>
        <ScoreIcon size={16} className={scoreColor} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <p className="font-pixel text-sm text-white">{shopName}</p>
            {domain && (
              <span className="badge-pixel badge-pixel-secondary text-[9px] mt-0.5">{domain}</span>
            )}
          </div>
          <div className="text-right shrink-0">
            <ScoreStars score={rating.score} />
            <div className="flex items-center justify-end gap-1 mt-1">
              <SentimentIcon sentiment={rating.sentiment} />
              <span className="font-body text-[10px] text-zinc-500 capitalize">{rating.sentiment}</span>
            </div>
          </div>
        </div>

        {rating.notes && (
          <p className="font-body text-xs text-zinc-400 mt-2 leading-relaxed italic">
            &ldquo;{rating.notes}&rdquo;
          </p>
        )}
        <p className="font-body text-[10px] text-zinc-600 mt-2">{date}</p>
      </div>
    </motion.div>
  )
}

function RatingsInner() {
  usePageTitle('Ratings')
  const { user } = useUser()

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ['user-profile'],
    queryFn: () => apiClient.get('/v1/users/me').then((r) => r.data),
  })

  const {
    data: ratings = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<RatingRow[]>({
    queryKey: ['ratings', 'mine'],
    queryFn: () => apiClient.get('/v1/ratings/mine').then((r) => r.data),
    staleTime: 30_000,
  })

  const characterType = (profile?.avatar_config?.character_type as CharacterType | undefined)
    ?? (user?.unsafeMetadata?.avatar_config as { character_type?: CharacterType } | undefined)?.character_type

  const displayName = profile?.display_name ?? user?.firstName ?? user?.username ?? 'Consumer'

  // Avg score across all rated shops
  const avgScore = ratings.length
    ? (ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length).toFixed(1)
    : null

  return (
    <AppShell role="consumer" characterType={characterType} displayName={displayName}>
      <div className="max-w-2xl mx-auto space-y-6">

        <motion.div custom={0} variants={CARD_VARIANTS} initial="hidden" animate="show">
          <div className="flex items-end justify-between">
            <div>
              <h1 className="font-pixel text-2xl font-bold text-secondary">Vendor Ratings</h1>
              <p className="font-body text-sm text-zinc-500 mt-1">
                Auto-generated after every negotiation. Private to you.
              </p>
            </div>
            {avgScore && (
              <div className="text-right">
                <p className="font-pixel text-2xl text-yellow-400">{avgScore}</p>
                <p className="font-body text-[10px] text-zinc-600">avg / 5 · {ratings.length} rated</p>
              </div>
            )}
          </div>
        </motion.div>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="panel-block p-4 flex gap-4 animate-pulse">
                <div className="w-9 h-9 rounded-sm bg-zinc-700 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 bg-zinc-700 rounded" />
                  <div className="h-3 w-48 bg-zinc-700 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && isError && <ErrorState onRetry={() => refetch()} />}

        {!isLoading && !isError && ratings.length === 0 && (
          <EmptyState
            icon={Star}
            title="No ratings yet"
            description="Complete a negotiation and your agent will automatically rate the vendor using AI — no manual input needed."
          />
        )}

        {!isLoading && !isError && ratings.length > 0 && (
          <div className="space-y-3">
            {ratings.map((r, i) => (
              <RatingCard key={r.id} rating={r} index={i} />
            ))}
          </div>
        )}

      </div>
    </AppShell>
  )
}

export default function RatingsPage() {
  return (
    <ProtectedRoute requiredRole="consumer">
      <RatingsInner />
    </ProtectedRoute>
  )
}
