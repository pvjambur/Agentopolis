import { useEffect, useState } from 'react'
import { useUser } from '@clerk/react'
import { useQuery } from '@tanstack/react-query'
import { usePageTitle } from '@/hooks/usePageTitle'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  BarChart2,
  Package,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AppShell } from '@/components/layout/AppShell'
import { StatCard } from '@/components/common/StatCard'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorState } from '@/components/common/ErrorState'
import { ProtectedRoute } from '@/components/common/ProtectedRoute'
import { type CharacterType } from '@/data/characterSpriteMap'
import apiClient from '@/services/api'

interface Shop { id: string; name: string; domain: string }
interface UserProfile { display_name: string | null; avatar_config: { character_type?: string } | null }

interface VendorReport {
  deal_count: number
  total_negotiations: number
  total_sales: number
  net_revenue: number
  avg_discount_pct: number
  avg_rounds: number
  walk_away_rate: number
  walked_away_count: number
  top_products: { product_id: string; product_name: string; deal_count: number; total_revenue: number }[]
  chart_data: { date: string; deal_count: number; revenue: number }[]
  low_stock_alerts: { id: string; name: string; stock_count: number; price: string }[]
}

const PERIOD_LABELS = { week: 'This week', month: 'This month', all: 'All time' }
type Period = 'week' | 'month' | 'all'

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.25, delay: i * 0.06 } }),
}

function ReportsInner() {
  usePageTitle('Reports')
  const { user } = useUser()
  const [selectedShop, setSelectedShop] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>('week')

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ['user-profile'],
    queryFn: () => apiClient.get('/v1/users/me').then((r) => r.data),
  })

  const { data: shops = [] } = useQuery<Shop[]>({
    queryKey: ['shops', 'mine'],
    queryFn: () => apiClient.get('/v1/shops/mine').then((r) => r.data),
  })

  useEffect(() => {
    if (shops.length && !selectedShop) setSelectedShop(shops[0].id)
  }, [shops, selectedShop])

  const activeShopId = selectedShop ?? shops[0]?.id

  const { data: report, isLoading: reportLoading, isError: reportError, refetch: refetchReport } = useQuery<VendorReport>({
    queryKey: ['vendor-report', activeShopId, period],
    queryFn: () => apiClient.get(`/v1/reports/${activeShopId}?period=${period}`).then((r) => r.data),
    enabled: !!activeShopId,
    staleTime: 30_000,
  })

  const characterType = (profile?.avatar_config?.character_type as CharacterType | undefined)
    ?? (user?.unsafeMetadata?.avatar_config as { character_type?: CharacterType } | undefined)?.character_type
  const displayName = profile?.display_name ?? user?.firstName ?? 'Vendor'

  const discountLabel = report
    ? report.avg_discount_pct < 0
      ? `+${Math.abs(report.avg_discount_pct).toFixed(1)}% above list`
      : `${report.avg_discount_pct.toFixed(1)}% off`
    : '—'

  return (
    <AppShell role="vendor" characterType={characterType} displayName={displayName}>
      <div className="max-w-5xl mx-auto space-y-6">

        <motion.div custom={0} variants={CARD_VARIANTS} initial="hidden" animate="show" className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-pixel text-2xl font-bold text-primary">Sales Reports</h1>
            <p className="font-body text-sm text-zinc-500 mt-1">Computed live from negotiations data.</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Shop selector */}
            {shops.length > 1 && (
              <select
                value={activeShopId ?? ''}
                onChange={(e) => setSelectedShop(e.target.value)}
                className="bg-zinc-900 border-2 border-accent-dark rounded-sm px-2 py-1.5 font-body text-xs text-white focus:outline-none focus:border-primary"
              >
                {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            {/* Period tabs */}
            <div className="flex border-2 border-accent-dark rounded-sm overflow-hidden">
              {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`font-pixel text-[10px] px-3 py-1.5 transition-colors ${
                    period === p ? 'bg-primary text-black' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {!activeShopId && !reportLoading && (
          <EmptyState icon={BarChart2} title="No shops yet" description="Create a shop first to see your sales reports." />
        )}

        {activeShopId && reportError && (
          <ErrorState onRetry={() => refetchReport()} />
        )}

        {activeShopId && !reportError && (
          <>
            {/* Low-stock alerts */}
            {(report?.low_stock_alerts?.length ?? 0) > 0 && (
              <motion.div custom={1} variants={CARD_VARIANTS} initial="hidden" animate="show"
                className="panel-block border-yellow-700 bg-yellow-900/20 p-4 flex items-start gap-3">
                <AlertTriangle size={16} className="text-yellow-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-pixel text-xs text-yellow-300 mb-1">Low Stock Alert</p>
                  <div className="flex flex-wrap gap-3">
                    {report!.low_stock_alerts.map((p) => (
                      <span key={p.id} className="font-body text-xs text-zinc-300">
                        {p.name} — <span className="text-yellow-400 font-bold">{p.stock_count} left</span>
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Stat cards */}
            <motion.div className="grid grid-cols-2 sm:grid-cols-4 gap-4"
              initial="hidden" animate="show"
              variants={{ show: { transition: { staggerChildren: 0.05 } } }}>
              {[
                { title: 'Net Revenue', value: report ? `₹${report.net_revenue.toLocaleString('en-IN')}` : '—', icon: TrendingUp, variant: 'primary' as const, subtext: `₹${report?.total_sales ?? '—'} gross · 5% retained` },
                { title: 'Deals Closed', value: reportLoading ? '—' : `${report?.deal_count ?? 0}`, icon: Zap, variant: 'neutral' as const, subtext: `of ${report?.total_negotiations ?? 0} negotiations` },
                { title: 'Avg Discount', value: reportLoading ? '—' : discountLabel, icon: TrendingDown, variant: 'neutral' as const, subtext: 'vs list price' },
                { title: 'Walk-away Rate', value: reportLoading ? '—' : `${((report?.walk_away_rate ?? 0) * 100).toFixed(0)}%`, icon: BarChart2, variant: 'neutral' as const, subtext: `${report?.walked_away_count ?? 0} walk-aways · ${report?.avg_rounds ?? '—'} avg rounds` },
              ].map((card, i) => (
                <motion.div key={card.title} custom={i + 2} variants={CARD_VARIANTS}>
                  <StatCard {...card} loading={reportLoading} />
                </motion.div>
              ))}
            </motion.div>

            {/* Revenue bar chart */}
            <motion.div custom={6} variants={CARD_VARIANTS} initial="hidden" animate="show"
              className="panel-block p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-pixel text-sm font-bold text-white">Revenue Over Time</h3>
                  <p className="font-body text-xs text-zinc-500">{PERIOD_LABELS[period]}</p>
                </div>
                <BarChart2 size={14} className="text-zinc-600" />
              </div>

              {reportLoading ? (
                <div className="h-48 bg-zinc-800 rounded animate-pulse" />
              ) : !report?.chart_data?.length ? (
                <div className="h-48 flex items-center justify-center">
                  <p className="font-pixel text-xs text-zinc-600">No data for this period</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={report.chart_data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="date" tick={{ fill: '#52525b', fontSize: 10, fontFamily: 'Inter' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#52525b', fontSize: 10, fontFamily: 'Inter' }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `₹${v}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#2B2B2B', border: '2px solid #6B4319', borderRadius: 4, fontFamily: 'Pixelify Sans', fontSize: 11 }}
                      formatter={(v: number) => [`₹${v}`, 'Revenue']}
                    />
                    <Bar dataKey="revenue" fill="#5FA632" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </motion.div>

            {/* Top products table */}
            <motion.div custom={7} variants={CARD_VARIANTS} initial="hidden" animate="show"
              className="panel-block p-5">
              <div className="flex items-center gap-2 mb-4">
                <Package size={14} className="text-zinc-400" />
                <h3 className="font-pixel text-sm font-bold text-white">Top Products</h3>
              </div>

              {reportLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <div key={i} className="h-8 bg-zinc-800 rounded animate-pulse" />)}
                </div>
              ) : !report?.top_products?.length ? (
                <p className="font-body text-xs text-zinc-600">No deals in this period.</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-accent-dark">
                      {['Product', 'Deals', 'Revenue', 'Avg Price'].map((h) => (
                        <th key={h} className="text-left font-pixel text-[10px] text-zinc-500 pb-2 pr-4">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-accent-dark/30">
                    {report.top_products.map((p, i) => (
                      <tr key={p.product_id}>
                        <td className="py-2 pr-4">
                          <span className="font-body text-xs text-white">{p.product_name}</span>
                          {i === 0 && <span className="badge-pixel badge-pixel-primary text-[9px] ml-2">Top</span>}
                        </td>
                        <td className="py-2 pr-4 font-pixel text-xs text-primary">{p.deal_count}</td>
                        <td className="py-2 pr-4 font-body text-xs text-white">₹{p.total_revenue.toLocaleString('en-IN')}</td>
                        <td className="py-2 font-body text-xs text-zinc-400">₹{p.deal_count ? (p.total_revenue / p.deal_count).toFixed(0) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </motion.div>
          </>
        )}
      </div>
    </AppShell>
  )
}

export default function VendorReportsPage() {
  return <ProtectedRoute requiredRole="vendor"><ReportsInner /></ProtectedRoute>
}
