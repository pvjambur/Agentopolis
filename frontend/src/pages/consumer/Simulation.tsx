import { useUser } from '@clerk/react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { PhaserGame, type ShopClickedData } from '@/components/simulation/PhaserGame'
import { PaymentApprovalModal, type PaymentRequest } from '@/components/simulation/PaymentApprovalModal'
import { ProtectedRoute } from '@/components/common/ProtectedRoute'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { type CharacterType } from '@/data/characterSpriteMap'
import apiClient from '@/services/api'

interface UserProfile {
  avatar_config: { character_type?: CharacterType } | null
}

const DOMAIN_LABELS: Record<string, string> = {
  vegetables: 'Vegetables',
  fruits: 'Fruits',
  grocery: 'Grocery',
  pharma: 'Pharma',
  electronics: 'Electronics',
  furniture: 'Furniture',
  bakery: 'Bakery',
}

function SimulationInner() {
  const { user } = useUser()
  const [selectedShop, setSelectedShop] = useState<ShopClickedData | null>(null)
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null)

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ['user-profile'],
    queryFn: () => apiClient.get('/v1/users/me').then((r) => r.data),
  })

  // Prefer DB-stored avatar config, fall back to Clerk unsafeMetadata (set right after CharacterCreate)
  const avatarConfig =
    profile?.avatar_config ??
    (user?.unsafeMetadata?.avatar_config as { character_type?: CharacterType } | undefined)

  function handleApprove(req: PaymentRequest): void {
    // Phase 4: Razorpay Checkout.js fires here
    console.info('[Simulation] Payment approved', req.negotiationId)
    setPaymentRequest(null)
  }

  return (
    <div className="relative" style={{ height: 'calc(100vh - 57px)' }}>
      {/* Phaser world — fills available height */}
      <PhaserGame
        avatarConfig={avatarConfig ?? undefined}
        onShopClicked={setSelectedShop}
      />

      {/* Shop info panel — slides in from the right on shop click */}
      <Sheet
        open={!!selectedShop}
        onOpenChange={(open) => { if (!open) setSelectedShop(null) }}
      >
        <SheetContent
          side="right"
          className="panel-block border-l-2 border-accent-dark w-80 flex flex-col"
        >
          <SheetHeader className="shrink-0">
            <SheetTitle className="font-pixel text-primary text-base leading-snug">
              {selectedShop?.name}
            </SheetTitle>
            <SheetDescription asChild>
              <div className="mt-1">
                <span className="badge-pixel badge-pixel-secondary">
                  {DOMAIN_LABELS[selectedShop?.domain ?? ''] ?? selectedShop?.domain}
                </span>
              </div>
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4 flex-1">
            <p className="font-body text-sm text-zinc-400 leading-relaxed">
              Products and live AI negotiation are available in Phase 2. Your agent will
              scout this shop and negotiate prices automatically.
            </p>

            <div className="panel-block-light p-3 rounded-sm">
              <p className="font-pixel text-[10px] text-zinc-600 uppercase tracking-wide mb-2">
                Availability
              </p>
              <span className="badge-pixel badge-pixel-warning">Phase 2</span>
            </div>
          </div>

          <div className="shrink-0 pt-4 border-t border-accent-dark/40">
            <p className="font-pixel text-[10px] text-zinc-600 text-center">
              WASD to move · scroll to zoom
            </p>
          </div>
        </SheetContent>
      </Sheet>

      {/* Phase 4 payment approval modal (wired from scene events) */}
      <PaymentApprovalModal
        request={paymentRequest}
        onApprove={handleApprove}
        onDecline={() => setPaymentRequest(null)}
      />
    </div>
  )
}

export default function SimulationPage() {
  return (
    <ProtectedRoute requiredRole="consumer">
      <SimulationInner />
    </ProtectedRoute>
  )
}
