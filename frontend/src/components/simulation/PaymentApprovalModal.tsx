import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export interface PaymentRequest {
  vendorName: string
  itemSummary: string
  negotiatedPrice: number
  originalPrice: number
  negotiationId: string
}

interface Props {
  request: PaymentRequest | null
  onApprove: (request: PaymentRequest) => void
  onDecline: () => void
}

export function PaymentApprovalModal({ request, onApprove, onDecline }: Props) {
  const savings = request ? request.originalPrice - request.negotiatedPrice : 0

  return (
    <Dialog open={!!request} onOpenChange={(open) => { if (!open) onDecline() }}>
      <DialogContent showCloseButton={false} className="rounded-2xl max-w-sm">
        <DialogHeader>
          <DialogTitle>Approve Payment?</DialogTitle>
        </DialogHeader>

        {request && (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground font-medium">{request.vendorName}</p>
            <p className="text-sm">{request.itemSummary}</p>

            <div className="flex items-baseline gap-2 pt-1">
              <span className="text-2xl font-bold">₹{request.negotiatedPrice}</span>
              {savings > 0 && (
                <>
                  <span className="text-sm line-through text-muted-foreground">
                    ₹{request.originalPrice}
                  </span>
                  <span className="text-xs text-green-600 font-medium">
                    Save ₹{savings}
                  </span>
                </>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Negotiation #{request.negotiationId.slice(0, 8)}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onDecline}>
            Decline
          </Button>
          <Button onClick={() => request && onApprove(request)}>
            Approve &amp; Pay
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
