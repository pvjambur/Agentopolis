import Phaser from 'phaser'
import { useEffect, useRef, useState } from 'react'
import { PaymentApprovalModal, type PaymentRequest } from '@/components/simulation/PaymentApprovalModal'
import { Button } from '@/components/ui/button'
import { phaserConfig } from '@/phaser/config'

const MOCK_PAYMENT: PaymentRequest = {
  vendorName: 'Fresh Fruits Co',
  itemSummary: '2kg apples, 1kg oranges',
  negotiatedPrice: 290,
  originalPrice: 310,
  negotiationId: 'neg_test_001',
}

export default function SimulationPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null)

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return

    gameRef.current = new Phaser.Game({
      ...phaserConfig,
      parent: containerRef.current,
    })

    // Phase 4 bridge: scene emits 'payment-requested' → this handler opens modal
    const hookBridge = () => {
      const scene = gameRef.current?.scene.getScene('MarketplaceScene')
      scene?.events.on('payment-requested', (data: PaymentRequest) => {
        setPaymentRequest(data)
      })
    }
    // Scene may not exist yet; wait for it to start
    gameRef.current.events.on('ready', hookBridge)

    return () => {
      gameRef.current?.destroy(true)
      gameRef.current = null
    }
  }, [])

  function handleApprove(req: PaymentRequest) {
    // Phase 4: Razorpay Checkout.js opens here with req.negotiatedPrice
    console.info('[SimulationPage] Payment approved for negotiation', req.negotiationId)
    setPaymentRequest(null)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">
      {/* Phaser canvas mount point */}
      <div ref={containerRef} className="flex-1" id="phaser-root" />

      {/* Dev test button — remove before demo */}
      <div className="absolute bottom-4 right-4 z-10">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPaymentRequest(MOCK_PAYMENT)}
        >
          Test Payment Modal
        </Button>
      </div>

      <PaymentApprovalModal
        request={paymentRequest}
        onApprove={handleApprove}
        onDecline={() => setPaymentRequest(null)}
      />
    </div>
  )
}
