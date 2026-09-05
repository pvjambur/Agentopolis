import apiClient from './api'

export interface VendorConfig {
  personality_type: 'negotiator' | 'fixed_mrp' | 'loyalty' | 'premium'
  max_discount_percent: number
  tone: 'friendly' | 'firm' | 'professional'
  bundling_enabled: boolean
  min_rounds_before_accept: number
}

export interface ConsumerConfig {
  price_weight: number
  quality_weight: number
  default_budget: number | null
}

export interface AgentConfigRow {
  id: string
  user_id: string
  agent_type: string
  personality: Record<string, unknown>
  negotiation_rules: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface AgentConfigMine {
  vendor?: AgentConfigRow
  consumer?: AgentConfigRow
}

const agentConfigService = {
  getMine: () =>
    apiClient.get<AgentConfigMine>('/v1/agent-config/mine').then((r) => r.data),

  patchVendor: (data: VendorConfig) =>
    apiClient.patch<AgentConfigRow>('/v1/agent-config/vendor', data).then((r) => r.data),

  patchConsumer: (data: Pick<ConsumerConfig, 'price_weight' | 'default_budget'>) =>
    apiClient.patch<AgentConfigRow>('/v1/agent-config/consumer', data).then((r) => r.data),
}

export default agentConfigService
