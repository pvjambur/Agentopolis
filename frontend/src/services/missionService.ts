import apiClient from './api'

export interface MissionCreate {
  instruction_text: string
  budget?: number
  mode?: 'single' | 'swarm'
}

export interface Round {
  speaker: 'vendor_agent' | 'consumer_agent'
  message: string
  proposed_price: number
  action: 'offer' | 'counter' | 'accept' | 'reject' | 'walk_away'
  reasoning: string
  emotion: 'friendly' | 'firm' | 'frustrated' | 'happy' | 'neutral'
  timestamp?: string
}

export interface Negotiation {
  id: string
  mission_id: string
  shop_id: string
  product_id: string
  item_requested: string
  rounds: Round[]
  outcome: 'deal' | 'no_deal' | 'walked_away' | 'blocked' | null
  opening_price: number
  final_price: number | null
  round_count: number
  is_mocked_payment: boolean
  mock_transaction_ref: string | null
  created_at: string
  completed_at: string | null
}

export interface Mission {
  id: string
  consumer_id: string
  instruction_text: string
  parsed_list: { item: string; quantity: string; notes: string }[]
  budget: number | null
  mode: 'single' | 'swarm'
  status: 'planning' | 'active' | 'completed' | 'failed'
  created_at: string
  completed_at: string | null
  negotiations: Negotiation[]
}

export interface PaymentOrder {
  order_id: string
  amount: number
  currency: string
  negotiation_id: string
}

export const missionService = {
  create: (body: MissionCreate) =>
    apiClient
      .post<{ mission_id: string; status: string }>('/v1/missions', body)
      .then((r) => r.data),

  get: (missionId: string) =>
    apiClient.get<Mission>(`/v1/missions/${missionId}`).then((r) => r.data),

  /** Phase 2 mock approval. Kept intact for PAYMENT_MODE=mock. */
  approveMockPayment: (negotiationId: string) =>
    apiClient
      .post<{ success: boolean; mock_transaction_ref: string; already_paid?: boolean }>(
        '/v1/payments/mock-approve',
        { negotiation_id: negotiationId },
      )
      .then((r) => r.data),

  /** Phase 3 live: create a Razorpay order for Checkout.js. */
  createPaymentOrder: (negotiationId: string) =>
    apiClient
      .post<PaymentOrder>('/v1/payments/create-order', { negotiation_id: negotiationId })
      .then((r) => r.data),

  /** Optimistic UI confirmation after Checkout.js handler fires (webhook is source of truth). */
  verifyPayment: (body: {
    negotiation_id: string
    razorpay_payment_id: string
    razorpay_order_id: string
    razorpay_signature: string
  }) =>
    apiClient
      .post<{ status: string; payment_id: string }>('/v1/payments/verify', body)
      .then((r) => r.data),

  /** Returns current PAYMENT_MODE so the frontend branches mock vs. live. */
  getPaymentMode: () =>
    apiClient.get<{ mode: string }>('/v1/payments/mode').then((r) => r.data),
}
