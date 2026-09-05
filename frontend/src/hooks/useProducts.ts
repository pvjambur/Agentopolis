import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import productService, {
  type ProductCreate,
  type ProductUpdate,
} from '@/services/productService'

// ── Vendor catalog ──────────────────────────────────────────────────────────

export function useShopProducts(shopId: string | undefined) {
  return useQuery({
    queryKey: ['products', shopId],
    queryFn: () => productService.listByShop(shopId!),
    enabled: !!shopId,
  })
}

export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ProductCreate) => productService.create(data),
    onSuccess: (product) => {
      qc.invalidateQueries({ queryKey: ['products', product.shop_id] })
      qc.invalidateQueries({ queryKey: ['marketplace'] })
    },
  })
}

export function useUpdateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ProductUpdate }) =>
      productService.update(id, data),
    onSuccess: (product) => {
      qc.invalidateQueries({ queryKey: ['products', product.shop_id] })
      qc.invalidateQueries({ queryKey: ['marketplace'] })
    },
  })
}

export function useDeleteProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, shopId }: { id: string; shopId: string }) =>
      productService.delete(id).then(() => shopId),
    onSuccess: (shopId) => {
      qc.invalidateQueries({ queryKey: ['products', shopId] })
      qc.invalidateQueries({ queryKey: ['marketplace'] })
    },
  })
}

export function useUploadProductImage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, file, shopId }: { id: string; file: File; shopId: string }) =>
      productService.uploadImage(id, file).then((res) => ({ ...res, shopId })),
    onSuccess: ({ shopId }) => {
      qc.invalidateQueries({ queryKey: ['products', shopId] })
      qc.invalidateQueries({ queryKey: ['marketplace'] })
    },
  })
}

// ── Consumer marketplace ─────────────────────────────────────────────────────

export function useMarketplaceFeed(filters: { domain?: string; search?: string }) {
  return useQuery({
    queryKey: ['marketplace', filters.domain ?? '', filters.search ?? ''],
    queryFn: () => productService.marketplace(filters),
    staleTime: 45_000,
  })
}
