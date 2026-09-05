import { useEffect, useRef, useState } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useUser } from '@clerk/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle, Clock, Loader2, MessageSquare, Maximize2, User, XCircle } from 'lucide-react'
import { PhaserGame, type PhaserGameHandle, type ShopClickedData, type AgentClickedData } from '@/components/simulation/PhaserGame'
import { PaymentApprovalModal, type PaymentRequest } from '@/components/simulation/PaymentApprovalModal'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ProtectedRoute } from '@/components/common/ProtectedRoute'
import { useApproveMockPayment, useCreatePaymentOrder, useMission } from '@/hooks/useMission'
import { missionService, type Negotiation } from '@/services/missionService'
import { type CharacterType } from '@/data/characterSpriteMap'
import apiClient from '@/services/api'

// Razorpay Checkout.js global injected by index.html
declare const Razorpay: new (options: Record<string, unknown>) => { open(): void }

interface UserProfile {
  avatar_config: { character_type?: CharacterType } | null
}

interface WsEvent {
  event: string
  [key: string]: unknown
}

// ── status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { label: string; color: string; spin?: boolean }> = {
    planning:     { label: 'Planning',    color: 'text-yellow-400' },
    active:       { label: 'Active',      color: 'text-blue-400',  spin: true },
    completed:    { label: 'Complete',    color: 'text-green-400' },
    failed:       { label: 'Failed',      color: 'text-red-400' },
    connecting:   { label: 'Connecting', color: 'text-zinc-400',  spin: true },
    disconnected: { label: 'Offline',    color: 'text-zinc-500' },
  }
  const v = variants[status] ?? variants.planning
  const Icon = (status === 'completed') ? CheckCircle
    : (status === 'failed')  ? XCircle
    : (v.spin)               ? Loader2
    : Clock
  return (
    <span className={`inline-flex items-center gap-1.5 ${v.color} font-pixel text-[10px] uppercase`}>
      <Icon size={11} className={v.spin ? 'animate-spin' : undefined} />
      {v.label}
    </span>
  )
}

// ── transcript panel ──────────────────────────────────────────────────────────

function NegotiationCard({
  neg,
  onApprove,
  approving,
}: {
  neg: Negotiation
  onApprove: (id: string) => void
  approving: boolean
}) {
  const openingPrice = parseFloat(String(neg.opening_price))
  const finalPrice   = neg.final_price != null ? parseFloat(String(neg.final_price)) : null

  return (
    <div className="border border-accent-dark/30 rounded-sm overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 bg-zinc-900 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-pixel text-[11px] text-white truncate">{neg.item_requested}</p>
          <p className="font-body text-[10px] text-zinc-500 mt-0.5">
            {neg.round_count} round{neg.round_count !== 1 ? 's' : ''} · open ₹{openingPrice.toFixed(0)}
          </p>
        </div>
        <div className="text-right shrink-0">
          {neg.outcome === 'deal' && finalPrice != null ? (
            <>
              <span className="badge-pixel badge-pixel-primary text-[9px]">Deal</span>
              <p className="font-pixel text-[11px] text-primary mt-0.5">₹{finalPrice.toFixed(0)}</p>
            </>
          ) : neg.outcome === 'insufficient_balance' ? (
            <span className="badge-pixel badge-pixel-danger text-[9px]">No funds</span>
          ) : neg.outcome === 'payment_failed' ? (
            <span className="badge-pixel badge-pixel-danger text-[9px]">Pay failed</span>
          ) : neg.outcome === 'timeout' ? (
            <span className="badge-pixel badge-pixel-warning text-[9px]">Timeout</span>
          ) : neg.outcome === 'walked_away' ? (
            <span className="badge-pixel badge-pixel-warning text-[9px]">Deadlock</span>
          ) : neg.outcome ? (
            <span className="badge-pixel badge-pixel-warning text-[9px]">{neg.outcome}</span>
          ) : (
            <span className="badge-pixel text-[9px] opacity-50">Pending</span>
          )}
        </div>
      </div>

      {/* Round-by-round transcript */}
      {neg.rounds.length > 0 && (
        <div className="divide-y divide-accent-dark/20">
          {neg.rounds.map((round, i) => (
            <div key={i} className="px-3 py-2">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`font-pixel text-[9px] uppercase ${
                  round.speaker === 'vendor_agent' ? 'text-yellow-400' : 'text-blue-400'
                }`}>
                  {round.speaker === 'vendor_agent' ? 'Vendor' : 'Agent'}
                </span>
                <span className="font-body text-[9px] text-zinc-600">
                  {round.action} · ₹{round.proposed_price}
                </span>
              </div>
              <p className="font-body text-[11px] text-zinc-300 leading-snug">{round.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* Payment status — deal without payment can be approved from transcript (reload-safe) */}
      {neg.outcome === 'deal' && (
        <div className="px-3 py-2 bg-zinc-950 border-t border-accent-dark/20 flex items-center justify-between gap-2">
          {neg.mock_transaction_ref ? (
            <p className="font-pixel text-[9px] text-green-400 truncate">
              ✓ {neg.mock_transaction_ref}
            </p>
          ) : (
            <>
              <p className="font-pixel text-[9px] text-yellow-400">Awaiting approval</p>
              {/* Phase 2 mock payment. Phase 3: replace with Razorpay Checkout.js here. */}
              <button
                onClick={() => onApprove(neg.id)}
                disabled={approving}
                className="btn-pixel btn-pixel-sm btn-pixel-primary text-[9px] px-2 py-0.5 disabled:opacity-50"
              >
                {approving ? '…' : 'Approve'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── main simulation view (missionId always defined here) ──────────────────────

function SimulationGame({
  missionId,
  avatarConfig,
}: {
  missionId: string
  avatarConfig?: { character_type?: CharacterType }
}) {
  const qc = useQueryClient()
  const approveMutation = useApproveMockPayment()
  const { data: mission } = useMission(missionId)

  const createOrderMutation = useCreatePaymentOrder()
  const phaserRef = useRef<PhaserGameHandle>(null)
  const [selectedShop, setSelectedShop] = useState<ShopClickedData | null>(null)
  const [inspectedAgent, setInspectedAgent] = useState<AgentClickedData | null>(null)
  const [showTranscript, setShowTranscript] = useState(false)
  const [wsStatus, setWsStatus] = useState<'connecting' | 'live' | 'disconnected' | 'error'>('connecting')
  const [liveStatus, setLiveStatus] = useState<string>('planning')
  const [liveActivity, setLiveActivity] = useState<string | null>(null)
  // Queue of deals awaiting user approval — shows one at a time in PaymentApprovalModal
  const [pendingPayments, setPendingPayments] = useState<PaymentRequest[]>([])
  const [cameraMode, setCameraMode] = useState<'follow' | 'birds-eye'>('follow')

  function toggleBirdsEye() {
    if (cameraMode === 'follow') {
      phaserRef.current?.birdsEye()
      setCameraMode('birds-eye')
    } else {
      phaserRef.current?.followPlayer()
      setCameraMode('follow')
    }
  }

  // Keep event handler in a ref so the WS onmessage closure never goes stale
  const handleEventRef = useRef<(evt: WsEvent) => void>(() => {})
  useEffect(() => {
    handleEventRef.current = (evt: WsEvent) => {
      // Forward to MarketplaceScene for agent walk + speech bubbles
      phaserRef.current?.emitToScene('negotiation-update', evt)

      switch (evt.event) {
        case 'mission_started':
          setLiveStatus('active')
          setLiveActivity('Mission started — agent deployed')
          break
        case 'list_parsed':
          setLiveActivity(`Shopping list: ${(evt.items as unknown[])?.length ?? 0} item(s)`)
          break
        case 'route_planned':
          setLiveActivity('Route planned — heading to vendors')
          break
        case 'negotiation_started':
          setLiveActivity(`Negotiating ${String(evt.item)} at ${String(evt.shop)}`)
          break
        case 'negotiation_blocked':
          setLiveActivity(`Round blocked: ${String(evt.reason)}`)
          break
        case 'negotiation_complete':
          if (evt.outcome === 'deal') {
            setLiveActivity(`Deal reached — ₹${Number(evt.final_price).toFixed(0)} · pending approval`)
          } else {
            setLiveActivity(`No deal (${String(evt.outcome)}) — trying next`)
          }
          qc.invalidateQueries({ queryKey: ['mission', missionId] })
          break
        case 'payment_pending':
          setPendingPayments((prev) => [
            ...prev,
            {
              vendorName:      String(evt.shop),
              itemSummary:     String(evt.item),
              negotiatedPrice: Number(evt.amount),
              originalPrice:   Number(evt.opening_price),
              negotiationId:   String(evt.negotiation_id),
              paymentMode:     String(evt.payment_mode ?? 'mock'),
            },
          ])
          break
        // ── Failure scenarios ──────────────────────────────────────────────
        case 'item_skipped':
          // Scenario 1: Out of stock
          setLiveActivity(String(evt.message))
          break
        case 'insufficient_balance':
          // Scenario 3: Wallet too low
          setLiveActivity(String(evt.message))
          qc.invalidateQueries({ queryKey: ['mission', missionId] })
          break
        case 'payment_failed':
          // Scenario 4: Razorpay failure
          setLiveActivity(String(evt.message))
          setPendingPayments((prev) => prev.filter((p) => p.negotiationId !== String(evt.negotiation_id)))
          qc.invalidateQueries({ queryKey: ['mission', missionId] })
          break
        // ── Swarm events ───────────────────────────────────────────────────
        case 'swarm_dispatched':
          setLiveActivity(String(evt.message))
          break
        case 'scout_started':
          setLiveActivity(String(evt.message))
          break
        case 'scout_complete':
          setLiveActivity(String(evt.message))
          qc.invalidateQueries({ queryKey: ['mission', missionId] })
          break
        case 'scout_failed':
          setLiveActivity(`Scout failed in ${String(evt.domain)}: ${String(evt.reason)}`)
          break
        // ──────────────────────────────────────────────────────────────────
        case 'mission_complete':
          setLiveStatus('completed')
          setLiveActivity('Mission complete!')
          setShowTranscript(true)
          qc.invalidateQueries({ queryKey: ['mission', missionId] })
          break
        case 'mission_failed':
          setLiveStatus('failed')
          setLiveActivity(`Failed: ${String(evt.reason)}`)
          qc.invalidateQueries({ queryKey: ['mission', missionId] })
          break
      }
    }
  }) // intentionally runs every render — keeps closure fresh

  // WebSocket connection — reconnects if missionId changes
  useEffect(() => {
    setWsStatus('connecting')
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/simulation/${missionId}`)

    ws.onopen  = () => setWsStatus('live')
    ws.onerror = () => setWsStatus('error')
    ws.onclose = () => setWsStatus('disconnected')
    ws.onmessage = (msg) => {
      try { handleEventRef.current(JSON.parse(msg.data as string)) } catch { /* ignore */ }
    }

    return () => { ws.close() }
  }, [missionId])

  // On page reload: sync status from DB when mission is already terminal
  useEffect(() => {
    if (mission?.status === 'completed' || mission?.status === 'failed') {
      setLiveStatus(mission.status)
    }
  }, [mission?.status])

  function handleApprovePayment(req: PaymentRequest) {
    const key = (import.meta.env.VITE_RAZORPAY_KEY_ID as string) || 'rzp_test_TXyEtSetz1WaKr'
    const amountPaise = Math.round((req.negotiatedPrice || 10) * 100)

    if (typeof (window as any).Razorpay !== 'undefined') {
      try {
        const rzp = new (window as any).Razorpay({
          key: key,
          amount: amountPaise,
          currency: 'INR',
          name: 'Agentopolis',
          description: `${req.itemSummary} — ${req.vendorName}`,
          handler: (_response: Record<string, string>) => {
            approveMutation.mutate(req.negotiationId, {
              onSuccess: () => {
                setPendingPayments((prev) => prev.filter((p) => p.negotiationId !== req.negotiationId))
                qc.invalidateQueries({ queryKey: ['mission', missionId] })
                qc.invalidateQueries({ queryKey: ['wallet', 'mine'] })
              },
              onError: () => {
                setPendingPayments((prev) => prev.filter((p) => p.negotiationId !== req.negotiationId))
              },
            })
          },
          modal: {
            ondismiss: () => {
              setPendingPayments((prev) => prev.filter((p) => p.negotiationId !== req.negotiationId))
            },
          },
          theme: { color: '#5FA632' },
        })
        rzp.open()
        return
      } catch (e) {
        console.warn('Razorpay checkout window launch notice:', e)
      }
    }

    // Direct fallback execution if Checkout popup is disabled/blocked by browser
    approveMutation.mutate(req.negotiationId, {
      onSuccess: () => {
        setPendingPayments((prev) => prev.filter((p) => p.negotiationId !== req.negotiationId))
        qc.invalidateQueries({ queryKey: ['mission', missionId] })
        qc.invalidateQueries({ queryKey: ['wallet', 'mine'] })
      },
    })
  }

  function handleDeclinePayment() {
    // Remove from queue without executing payment
    setPendingPayments((prev) => prev.slice(1))
  }

  const displayStatus = liveStatus !== 'planning' ? liveStatus : (mission?.status ?? 'planning')
  const currentPayment = pendingPayments[0] ?? null

  return (
    <div className="relative" style={{ height: 'calc(100vh - 57px)' }}>
      {/* Phaser world */}
      <PhaserGame
        ref={phaserRef}
        avatarConfig={avatarConfig}
        onShopClicked={setSelectedShop}
        onAgentClicked={setInspectedAgent}
      />

      {/* Status overlay — top-left */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-2 pointer-events-none">
        <div className="panel-block px-3 py-1.5 flex items-center gap-3">
          <StatusBadge status={displayStatus} />
          {wsStatus === 'live' && (
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          )}
        </div>
        <AnimatePresence mode="wait">
          {liveActivity && (
            <motion.div
              key={liveActivity}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="panel-block px-3 py-1.5 max-w-[240px]"
            >
              <p className="font-body text-[11px] text-zinc-300 leading-snug">{liveActivity}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Camera + transcript controls — top-right */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        <button
          onClick={toggleBirdsEye}
          className={`panel-block px-3 py-1.5 flex items-center gap-2 transition-colors ${
            cameraMode === 'birds-eye'
              ? 'border-primary text-primary'
              : 'text-zinc-400 hover:border-primary'
          }`}
        >
          {cameraMode === 'follow' ? <Maximize2 size={12} /> : <User size={12} />}
          <span className="font-pixel text-[10px]">
            {cameraMode === 'follow' ? "Bird's-Eye" : 'Follow Player'}
          </span>
        </button>

        <button
          onClick={() => setShowTranscript(true)}
          className="panel-block px-3 py-1.5 flex items-center gap-2 hover:border-primary transition-colors"
        >
          <MessageSquare size={12} className="text-zinc-400" />
          <span className="font-pixel text-[10px] text-zinc-400">Transcript</span>
          {mission?.negotiations.length ? (
            <span className="badge-pixel badge-pixel-secondary text-[9px] px-1">
              {mission.negotiations.length}
            </span>
          ) : null}
        </button>
      </div>

      {/* Shop info sheet (unchanged from Phase 1) */}
      <Sheet
        open={!!selectedShop}
        onOpenChange={(open) => { if (!open) setSelectedShop(null) }}
      >
        <SheetContent side="right" className="panel-block border-l-2 border-accent-dark w-80 flex flex-col">
          <SheetHeader className="shrink-0">
            <SheetTitle className="font-pixel text-primary text-base leading-snug">
              {selectedShop?.name}
            </SheetTitle>
            <SheetDescription asChild>
              <div className="mt-1">
                <span className="badge-pixel badge-pixel-secondary">{selectedShop?.domain}</span>
              </div>
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex-1">
            <p className="font-body text-sm text-zinc-400 leading-relaxed">
              Your agent negotiates with this shop automatically during a mission.
            </p>
          </div>
          <div className="shrink-0 pt-4 border-t border-accent-dark/40">
            <p className="font-pixel text-[10px] text-zinc-600 text-center">
              WASD to move · scroll to zoom
            </p>
          </div>
        </SheetContent>
      </Sheet>

      {/* Transcript panel — reads from DB, safe on page reload */}
      <Sheet open={showTranscript} onOpenChange={setShowTranscript}>
        <SheetContent
          side="right"
          className="panel-block border-l-2 border-accent-dark w-[420px] flex flex-col"
        >
          <SheetHeader className="shrink-0 pb-4 border-b border-accent-dark/40">
            <SheetTitle className="font-pixel text-primary text-sm">Mission Transcript</SheetTitle>
            <SheetDescription asChild>
              <div className="flex items-center gap-2 mt-1">
                <StatusBadge status={displayStatus} />
                <span className="font-body text-[10px] text-zinc-600">
                  {missionId.slice(0, 8)}
                </span>
              </div>
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto pt-4 space-y-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {/* Instruction + budget */}
            {mission && (
              <div className="panel-block-light p-3 rounded-sm space-y-1">
                <p className="font-body text-xs text-zinc-400 italic leading-relaxed">
                  &ldquo;{mission.instruction_text}&rdquo;
                </p>
                {mission.budget && (
                  <p className="font-pixel text-[9px] text-zinc-600 mt-1">
                    Budget ₹{parseFloat(String(mission.budget)).toFixed(0)}
                  </p>
                )}
              </div>
            )}

            {/* Negotiations — from DB (persisted, reload-safe) */}
            {!mission && (
              <p className="font-body text-xs text-zinc-600">Loading…</p>
            )}
            {mission?.negotiations.length === 0 && (
              <p className="font-body text-xs text-zinc-600">
                No negotiations yet — mission is still running.
              </p>
            )}
            {mission?.negotiations.map((neg) => (
              <NegotiationCard
                key={neg.id}
                neg={neg}
                onApprove={(id) => approveMutation.mutate(id)}
                approving={approveMutation.isPending}
              />
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Agent inspect sheet — triggered by clicking any sprite in Phaser */}
      <Sheet
        open={!!inspectedAgent}
        onOpenChange={(open) => { if (!open) setInspectedAgent(null) }}
      >
        <SheetContent side="left" className="panel-block border-r-2 border-accent-dark w-72 flex flex-col">
          <SheetHeader className="shrink-0">
            <SheetTitle className="font-pixel text-secondary text-base">
              {inspectedAgent?.agentType === 'scout'
                ? `Scout — ${inspectedAgent.domain ?? 'domain'}`
                : 'Your Agent'}
            </SheetTitle>
            <SheetDescription asChild>
              <div className="flex items-center gap-2 mt-1">
                <span className={`badge-pixel ${
                  inspectedAgent?.agentType === 'scout' ? 'badge-pixel-warning' : 'badge-pixel-secondary'
                }`}>
                  {inspectedAgent?.agentType}
                </span>
                {inspectedAgent?.currentShop && (
                  <span className="font-body text-[10px] text-zinc-500">@ {inspectedAgent.currentShop}</span>
                )}
              </div>
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 mt-4 space-y-4 overflow-y-auto">
            {/* State */}
            <div>
              <p className="font-pixel text-[10px] text-zinc-500 mb-1 uppercase">Status</p>
              <p className="font-body text-sm text-white capitalize">
                {inspectedAgent?.state ?? 'idle'}
              </p>
            </div>

            {/* Basket so far */}
            <div>
              <p className="font-pixel text-[10px] text-zinc-500 mb-2 uppercase">
                Basket ({inspectedAgent?.basket.length ?? 0} items)
              </p>
              {inspectedAgent?.basket.length === 0 ? (
                <p className="font-body text-xs text-zinc-600">No deals yet.</p>
              ) : (
                <div className="space-y-2">
                  {inspectedAgent?.basket.map((b, i) => (
                    <div key={i} className="panel-block p-2 flex items-center justify-between gap-2">
                      <div>
                        <p className="font-body text-xs text-white">{b.item}</p>
                        <p className="font-body text-[10px] text-zinc-500">{b.shop}</p>
                      </div>
                      <p className="font-pixel text-xs text-secondary shrink-0">₹{b.price}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {inspectedAgent?.agentType === 'scout' && (
              <div>
                <p className="font-pixel text-[10px] text-zinc-500 mb-1 uppercase">Reports to</p>
                <p className="font-body text-xs text-zinc-400">Your consumer agent</p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Payment approval modal — fires on payment_pending WS event.
          Phase 2: triggers POST /api/v1/payments/mock-approve (atomic Postgres tx).
          Phase 3: that endpoint becomes real Razorpay Checkout.js — nothing here changes. */}
      <PaymentApprovalModal
        request={currentPayment}
        onApprove={handleApprovePayment}
        onDecline={handleDeclinePayment}
      />
    </div>
  )
}

// ── page root — redirects to /consumer/mission/new if no mission_id ───────────

function SimulationInner() {
  const { user } = useUser()
  const { location } = useRouterState()
  const navigate = useNavigate()

  const missionId = new URLSearchParams(location.search).get('mission_id') ?? undefined

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ['user-profile'],
    queryFn: () => apiClient.get('/v1/users/me').then((r) => r.data),
  })

  const avatarConfig =
    profile?.avatar_config ??
    (user?.unsafeMetadata?.avatar_config as { character_type?: CharacterType } | undefined)

  useEffect(() => {
    if (!missionId) navigate({ to: '/consumer/mission/new' })
  }, [missionId, navigate])

  if (!missionId) return null

  return <SimulationGame missionId={missionId} avatarConfig={avatarConfig ?? undefined} />
}

export default function SimulationPage() {
  return (
    <ProtectedRoute requiredRole="consumer">
      <SimulationInner />
    </ProtectedRoute>
  )
}
