import apiClient from './api'

export interface Product {
  id: string
  shop_id: string
  name: string
  description: string | null
  price: string
  floor_price: string
  mrp: string | null
  stock_count: number
  image_url: string | null
  category: string | null
  pinecone_vector_id: string | null
  created_at: string
  updated_at: string
}

export interface MarketplaceProduct extends Product {
  shops: {
    id: string
    name: string
    domain: string
    description: string | null
    grid_x: number | null
    grid_y: number | null
  }
}

export interface ProductCreate {
  shop_id: string
  name: string
  description?: string
  price: number
  floor_price: number
  mrp?: number
  stock_count?: number
  category?: string
}

export interface ProductUpdate {
  name?: string
  description?: string
  price?: number
  floor_price?: number
  mrp?: number
  stock_count?: number
  category?: string
}

const productService = {
  listByShop: (shopId: string) =>
    apiClient.get<Product[]>(`/v1/shops/${shopId}/products`).then((r) => r.data),

  get: (id: string) =>
    apiClient.get<Product>(`/v1/products/${id}`).then((r) => r.data),

  create: (data: ProductCreate) =>
    apiClient.post<Product>('/v1/products', data).then((r) => r.data),

  update: (id: string, data: ProductUpdate) =>
    apiClient.patch<Product>(`/v1/products/${id}`, data).then((r) => r.data),

  delete: (id: string) => apiClient.delete(`/v1/products/${id}`),

  uploadImage: (id: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient
      .post<{ image_url: string }>(`/v1/products/${id}/image`, form)
      .then((r) => r.data)
  },

  marketplace: (params?: { domain?: string; search?: string }) =>
    apiClient
      .get<MarketplaceProduct[]>('/v1/marketplace/products', { params })
      .then((r) => r.data),
}

export default productService
