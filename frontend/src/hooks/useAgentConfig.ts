import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import agentConfigService, {
  type ConsumerConfig,
  type VendorConfig,
} from '@/services/agentConfigService'

export const AGENT_CONFIG_KEY = ['agent-config', 'mine'] as const

export function useAgentConfig() {
  return useQuery({
    queryKey: AGENT_CONFIG_KEY,
    queryFn: agentConfigService.getMine,
    staleTime: 60_000,
  })
}

export function useSaveVendorConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: VendorConfig) => agentConfigService.patchVendor(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: AGENT_CONFIG_KEY }),
  })
}

export function useSaveConsumerConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Pick<ConsumerConfig, 'price_weight' | 'default_budget'>) =>
      agentConfigService.patchConsumer(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: AGENT_CONFIG_KEY }),
  })
}
