import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { missionService, type MissionCreate } from '@/services/missionService'

export const missionKey = (id: string) => ['mission', id] as const

export function useCreateMission() {
  return useMutation({
    mutationFn: (body: MissionCreate) => missionService.create(body),
  })
}

export function useMission(missionId: string | undefined) {
  return useQuery({
    queryKey: missionKey(missionId ?? ''),
    queryFn: () => missionService.get(missionId!),
    enabled: !!missionId,
    staleTime: 10_000,
    refetchInterval: false,
  })
}

export function useApproveMockPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (negotiationId: string) => missionService.approveMockPayment(negotiationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mission'] })
    },
  })
}

export function useCreatePaymentOrder() {
  return useMutation({
    mutationFn: (negotiationId: string) => missionService.createPaymentOrder(negotiationId),
  })
}

export function usePaymentMode() {
  return useQuery({
    queryKey: ['payment-mode'],
    queryFn: () => missionService.getPaymentMode(),
    staleTime: 60_000,
  })
}
