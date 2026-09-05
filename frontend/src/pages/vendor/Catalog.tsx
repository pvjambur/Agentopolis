import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Package,
  Plus,
  Pencil,
  Trash2,
  ImageIcon,
  AlertTriangle,
  X,
  Upload,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/common/EmptyState'
import { ProtectedRoute } from '@/components/common/ProtectedRoute'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { PixelButton } from '@/components/ui/PixelButton'
import apiClient from '@/services/api'
import {
  useShopProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useUploadProductImage,
} from '@/hooks/useProducts'
import type { Product } from '@/services/productService'
import { type CharacterType } from '@/data/characterSpriteMap'
import { useUser } from '@clerk/react'
import { cn } from '@/lib/utils'

// ── Constants ─────────────────────────────────────────────────────────────────

const DOMAIN_LABELS: Record<string, string> = {
  vegetables: '🥦 Vegetables',
  fruits: '🍎 Fruits',
  grocery: '🛒 Grocery',
  pharma: '💊 Pharma',
  electronics: '⚡ Electronics',
  furniture: '🪑 Furniture',
  bakery: '🍞 Bakery',
}

interface Shop {
  id: string
  name: string
  domain: string
  description: string | null
  is_active: boolean
  created_at: string
}

interface UserProfile {
  id: string
  role: string
  display_name: string | null
  avatar_config: { character_type?: string } | null
}

// ── Product Form ──────────────────────────────────────────────────────────────

interface FormState {
  name: string
  description: string
  price: string
  floor_price: string
  mrp: string
  stock_count: string
  category: string
}

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  price: '',
  floor_price: '',
  mrp: '',
  stock_count: '0',
  category: '',
}

function productToForm(p: Product): FormState {
  return {
    name: p.name,
    description: p.description ?? '',
    price: p.price,
    floor_price: p.floor_price,
    mrp: p.mrp ?? '',
    stock_count: String(p.stock_count),
    category: p.category ?? '',
  }
}

interface ProductFormDialogProps {
  open: boolean
  onClose: () => void
  shopId: string
  editProduct?: Product
}

function ProductFormDialog({ open, onClose, shopId, editProduct }: ProductFormDialogProps) {
  const isEdit = !!editProduct
  const [form, setForm] = useState<FormState>(
    editProduct ? productToForm(editProduct) : EMPTY_FORM
  )
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(
    editProduct?.image_url ?? null
  )
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const createProduct = useCreateProduct()
  const updateProduct = useUpdateProduct()
  const uploadImage = useUploadProductImage()

  const price = parseFloat(form.price)
  const floorPrice = parseFloat(form.floor_price)
  const floorPriceError =
    !isNaN(price) && !isNaN(floorPrice) && floorPrice > price
      ? 'Floor price must be ≤ listing price — your agent won\'t negotiate below this'
      : null

  const isSubmitting =
    createProduct.isPending || updateProduct.isPending || uploadImage.isPending

  function set(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  function handleImageFile(file: File) {
    setImageFile(file)
    const url = URL.createObjectURL(file)
    setImagePreview(url)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleImageFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) handleImageFile(file)
  }

  function resetAndClose() {
    setForm(EMPTY_FORM)
    setImageFile(null)
    setImagePreview(null)
    createProduct.reset()
    updateProduct.reset()
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (floorPriceError) return

    try {
      let productId: string

      if (isEdit) {
        const updated = await updateProduct.mutateAsync({
          id: editProduct.id,
          data: {
            name: form.name,
            description: form.description || undefined,
            price: parseFloat(form.price),
            floor_price: parseFloat(form.floor_price),
            mrp: form.mrp ? parseFloat(form.mrp) : undefined,
            stock_count: parseInt(form.stock_count, 10),
            category: form.category || undefined,
          },
        })
        productId = updated.id
      } else {
        const created = await createProduct.mutateAsync({
          shop_id: shopId,
          name: form.name,
          description: form.description || undefined,
          price: parseFloat(form.price),
          floor_price: parseFloat(form.floor_price),
          mrp: form.mrp ? parseFloat(form.mrp) : undefined,
          stock_count: parseInt(form.stock_count, 10),
          category: form.category || undefined,
        })
        productId = created.id
      }

      if (imageFile) {
        await uploadImage.mutateAsync({ id: productId, file: imageFile, shopId })
      }

      resetAndClose()
    } catch {
      // error shown inline via mutation.error
    }
  }

  const mutationError =
    (isEdit ? updateProduct.error : createProduct.error) ?? uploadImage.error

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetAndClose() }}>
      <DialogContent
        className="!bg-[#1c1c1c] !border-4 !border-accent-dark !rounded-none !shadow-[8px_8px_0_#1a0f05] !max-w-2xl w-full !p-0"
        showCloseButton={false}
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b-2 border-accent-dark flex-row items-center justify-between gap-0">
          <DialogTitle className="font-pixel text-base text-primary">
            {isEdit ? 'Edit Product' : 'Add Product'}
          </DialogTitle>
          <button
            onClick={resetAndClose}
            className="text-zinc-500 hover:text-white transition-colors p-1"
          >
            <X size={16} />
          </button>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[80vh]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
            {/* Left column */}
            <div className="space-y-4">
              <div>
                <label className="font-pixel text-[11px] text-zinc-400 uppercase tracking-wider block mb-1.5">
                  Product Name *
                </label>
                <input
                  required
                  value={form.name}
                  onChange={set('name')}
                  placeholder="e.g. Organic Gala Apples"
                  className="w-full bg-zinc-900 border-2 border-accent-dark rounded-sm px-3 py-2.5 font-body text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              <div>
                <label className="font-pixel text-[11px] text-zinc-400 uppercase tracking-wider block mb-1.5">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={set('description')}
                  placeholder="Describe your product…"
                  rows={3}
                  className="w-full bg-zinc-900 border-2 border-accent-dark rounded-sm px-3 py-2.5 font-body text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary transition-colors resize-none"
                />
              </div>

              <div>
                <label className="font-pixel text-[11px] text-zinc-400 uppercase tracking-wider block mb-1.5">
                  Category
                </label>
                <input
                  value={form.category}
                  onChange={set('category')}
                  placeholder="e.g. Seasonal Fruits"
                  className="w-full bg-zinc-900 border-2 border-accent-dark rounded-sm px-3 py-2.5 font-body text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              {/* Price fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-pixel text-[11px] text-zinc-400 uppercase tracking-wider block mb-1.5">
                    Listing Price * ₹
                  </label>
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.price}
                    onChange={set('price')}
                    placeholder="0.00"
                    className="w-full bg-zinc-900 border-2 border-accent-dark rounded-sm px-3 py-2.5 font-body text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className={cn(
                    'font-pixel text-[11px] uppercase tracking-wider block mb-1.5',
                    floorPriceError ? 'text-red-400' : 'text-zinc-400'
                  )}>
                    Floor Price * ₹
                  </label>
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.floor_price}
                    onChange={set('floor_price')}
                    placeholder="0.00"
                    className={cn(
                      'w-full bg-zinc-900 border-2 rounded-sm px-3 py-2.5 font-body text-sm text-white placeholder:text-zinc-600 focus:outline-none transition-colors',
                      floorPriceError
                        ? 'border-red-500 focus:border-red-400'
                        : 'border-accent-dark focus:border-primary'
                    )}
                  />
                </div>
              </div>

              <AnimatePresence>
                {floorPriceError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-start gap-2 bg-red-950/50 border-2 border-red-800 rounded-sm p-3">
                      <AlertTriangle size={13} className="text-red-400 mt-0.5 shrink-0" />
                      <p className="font-body text-xs text-red-300 leading-relaxed">
                        {floorPriceError}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-pixel text-[11px] text-zinc-400 uppercase tracking-wider block mb-1.5">
                    MRP ₹ (opt.)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.mrp}
                    onChange={set('mrp')}
                    placeholder="0.00"
                    className="w-full bg-zinc-900 border-2 border-accent-dark rounded-sm px-3 py-2.5 font-body text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="font-pixel text-[11px] text-zinc-400 uppercase tracking-wider block mb-1.5">
                    Stock Count
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.stock_count}
                    onChange={set('stock_count')}
                    className="w-full bg-zinc-900 border-2 border-accent-dark rounded-sm px-3 py-2.5 font-body text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Right column — image upload */}
            <div className="flex flex-col gap-4">
              <label className="font-pixel text-[11px] text-zinc-400 uppercase tracking-wider block">
                Product Image
              </label>

              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'flex-1 min-h-[200px] rounded-sm border-2 border-dashed cursor-pointer transition-colors flex flex-col items-center justify-center overflow-hidden relative',
                  dragOver
                    ? 'border-primary bg-primary/10'
                    : 'border-accent-dark hover:border-zinc-500 bg-zinc-900/50'
                )}
              >
                {imagePreview ? (
                  <>
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                      <p className="font-pixel text-xs text-white">Change image</p>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-3 p-6 text-center pointer-events-none">
                    <div className="w-12 h-12 rounded-sm border-2 border-zinc-600 bg-zinc-800 flex items-center justify-center">
                      {dragOver ? (
                        <Upload size={22} className="text-primary" />
                      ) : (
                        <ImageIcon size={22} className="text-zinc-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-pixel text-xs text-zinc-400">
                        {dragOver ? 'Drop to upload' : 'Drop image or click to browse'}
                      </p>
                      <p className="font-body text-[11px] text-zinc-600 mt-1">
                        JPG, PNG, WebP · max 5 MB
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileInput}
              />

              {imagePreview && (
                <button
                  type="button"
                  onClick={() => { setImageFile(null); setImagePreview(null) }}
                  className="font-pixel text-[11px] text-zinc-500 hover:text-red-400 transition-colors text-center"
                >
                  Remove image
                </button>
              )}

              {/* Floor price explainer */}
              <div className="panel-block p-4 mt-auto">
                <p className="font-pixel text-[10px] text-zinc-500 uppercase tracking-wider mb-1">
                  Floor Price Guide
                </p>
                <p className="font-body text-xs text-zinc-400 leading-relaxed">
                  Your AI agent will never accept offers below this price.
                  Set it close to your cost price so negotiations always
                  remain profitable for you.
                </p>
              </div>
            </div>
          </div>

          {/* Mutation error */}
          {mutationError && (
            <div className="mx-6 mb-4 flex items-center gap-2 bg-red-950/50 border-2 border-red-800 rounded-sm p-3">
              <AlertTriangle size={13} className="text-red-400 shrink-0" />
              <p className="font-body text-xs text-red-300">
                {(mutationError as Error).message ?? 'Something went wrong. Please try again.'}
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="px-6 pb-6 flex items-center justify-end gap-3 border-t-2 border-accent-dark pt-5">
            <button
              type="button"
              onClick={resetAndClose}
              className="btn-pixel btn-pixel-md btn-pixel-ghost"
            >
              Cancel
            </button>
            <PixelButton
              type="submit"
              variant="primary"
              size="md"
              disabled={!!floorPriceError || isSubmitting}
              loading={isSubmitting}
            >
              {isEdit ? 'Save Changes' : 'Add Product'}
            </PixelButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Product Card ──────────────────────────────────────────────────────────────

const CARD_IN = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, delay: i * 0.06 },
  }),
}

interface ProductCardProps {
  product: Product
  index: number
  onEdit: (p: Product) => void
  onDelete: (p: Product) => void
}

function ProductCard({ product, index, onEdit, onDelete }: ProductCardProps) {
  const price = parseFloat(product.price)
  const floorPrice = parseFloat(product.floor_price)
  const marginPct = price > 0
    ? Math.round(((price - floorPrice) / price) * 100)
    : 0

  return (
    <motion.div
      custom={index}
      variants={CARD_IN}
      initial="hidden"
      animate="show"
      className="panel-block flex flex-col overflow-hidden group"
    >
      {/* Image */}
      <div className="relative h-40 bg-zinc-900 border-b-2 border-accent-dark overflow-hidden">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package size={36} className="text-zinc-700" />
          </div>
        )}
        {product.stock_count === 0 && (
          <div className="absolute top-2 left-2">
            <span className="badge-pixel badge-pixel-danger">Out of stock</span>
          </div>
        )}
        {product.category && (
          <div className="absolute top-2 right-2">
            <span className="badge-pixel badge-pixel-secondary text-[9px]">
              {product.category}
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col flex-1 gap-3">
        <div>
          <h3 className="font-pixel text-sm font-bold text-white leading-tight line-clamp-2">
            {product.name}
          </h3>
          {product.description && (
            <p className="font-body text-xs text-zinc-500 mt-1 leading-relaxed line-clamp-2">
              {product.description}
            </p>
          )}
        </div>

        {/* Price row */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-pixel text-base text-primary">
            ₹{parseFloat(product.price).toLocaleString('en-IN')}
          </span>
          {product.mrp && parseFloat(product.mrp) > price && (
            <span className="font-body text-xs text-zinc-600 line-through">
              ₹{parseFloat(product.mrp).toLocaleString('en-IN')}
            </span>
          )}
          <span className="badge-pixel badge-pixel-warning text-[9px] ml-auto">
            Floor ₹{floorPrice.toLocaleString('en-IN')}
          </span>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between text-[11px] font-body text-zinc-500">
          <span>{product.stock_count} in stock</span>
          <span className={marginPct > 0 ? 'text-primary-light' : 'text-zinc-600'}>
            {marginPct}% negotiation room
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 flex gap-2 border-t-2 border-accent-dark/50 pt-3">
        <button
          onClick={() => onEdit(product)}
          className="flex-1 flex items-center justify-center gap-1.5 btn-pixel btn-pixel-sm btn-pixel-ghost"
        >
          <Pencil size={11} />
          Edit
        </button>
        <button
          onClick={() => onDelete(product)}
          className="flex items-center justify-center gap-1.5 btn-pixel btn-pixel-sm btn-pixel-danger px-3"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </motion.div>
  )
}

// ── Product Skeleton ──────────────────────────────────────────────────────────

function ProductSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="panel-block overflow-hidden animate-pulse">
          <div className="h-40 bg-zinc-800 border-b-2 border-accent-dark" />
          <div className="p-4 space-y-3">
            <div className="h-4 w-3/4 bg-zinc-700 rounded-sm" />
            <div className="h-3 w-full bg-zinc-800 rounded-sm" />
            <div className="h-3 w-2/3 bg-zinc-800 rounded-sm" />
            <div className="flex gap-2 mt-4">
              <div className="flex-1 h-7 bg-zinc-800 rounded-sm" />
              <div className="w-10 h-7 bg-zinc-800 rounded-sm" />
            </div>
          </div>
        </div>
      ))}
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function VendorCatalogInner() {
  const { user } = useUser()
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Product | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<Product | undefined>()
  const [activeShopId, setActiveShopId] = useState<string | undefined>()

  const deleteProduct = useDeleteProduct()

  const { data: profile } = useQuery<{ id: string; role: string; display_name: string | null; avatar_config: { character_type?: string } | null }>({
    queryKey: ['user-profile'],
    queryFn: () => apiClient.get('/v1/users/me').then((r) => r.data),
  })

  const { data: shops = [], isLoading: shopsLoading } = useQuery<Shop[]>({
    queryKey: ['shops', 'mine'],
    queryFn: () => apiClient.get('/v1/shops/mine').then((r) => r.data),
  })

  useEffect(() => {
    if (shops.length > 0 && !activeShopId) setActiveShopId(shops[0].id)
  }, [shops, activeShopId])

  const resolvedShopId = activeShopId ?? shops[0]?.id

  const {
    data: products = [],
    isLoading: productsLoading,
  } = useShopProducts(resolvedShopId)

  const characterType = (
    profile?.avatar_config?.character_type as CharacterType | undefined
  ) ?? (user?.unsafeMetadata?.avatar_config as { character_type?: CharacterType } | undefined)?.character_type

  const displayName = profile?.display_name ?? user?.firstName ?? user?.username ?? 'Vendor'
  const activeShop = shops.find((s) => s.id === resolvedShopId)

  function openAdd() {
    setEditTarget(undefined)
    setFormOpen(true)
  }

  function openEdit(p: Product) {
    setEditTarget(p)
    setFormOpen(true)
  }

  async function confirmDelete() {
    if (!deleteTarget || !resolvedShopId) return
    await deleteProduct.mutateAsync({ id: deleteTarget.id, shopId: resolvedShopId })
    setDeleteTarget(undefined)
  }

  const isLoading = shopsLoading || productsLoading

  return (
    <AppShell role="vendor" characterType={characterType} displayName={displayName}>
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-pixel text-2xl font-bold text-primary">Product Catalog</h1>
            <p className="font-body text-sm text-zinc-500 mt-1">
              {activeShop
                ? `${activeShop.name} · ${DOMAIN_LABELS[activeShop.domain] ?? activeShop.domain}`
                : 'Manage your products and prices'}
            </p>
          </div>
          {resolvedShopId && (
            <PixelButton variant="primary" size="md" onClick={openAdd}>
              <Plus size={13} className="mr-1.5" />
              Add Product
            </PixelButton>
          )}
        </div>

        {/* Shop selector (multi-shop only) */}
        {shops.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {shops.map((shop) => (
              <button
                key={shop.id}
                onClick={() => setActiveShopId(shop.id)}
                className={cn(
                  'btn-pixel btn-pixel-sm',
                  shop.id === resolvedShopId ? 'btn-pixel-primary' : 'btn-pixel-ghost'
                )}
              >
                {shop.name}
              </button>
            ))}
          </div>
        )}

        {/* No shop state */}
        {!shopsLoading && shops.length === 0 && (
          <EmptyState
            icon={Package}
            title="Create a shop first"
            description="Your catalog lives inside a shop. Head to your dashboard to set one up before adding products."
          />
        )}

        {/* Products grid */}
        {resolvedShopId && (
          <>
            {isLoading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <ProductSkeleton count={3} />
              </div>
            )}

            {!isLoading && products.length === 0 && (
              <EmptyState
                icon={Package}
                title="No products yet"
                description="Add your first product. Set a listing price and a floor price — that floor is what your AI agent will protect during negotiations."
                action={{ label: 'Add First Product', onClick: openAdd }}
              />
            )}

            {!isLoading && products.length > 0 && (
              <motion.div
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                initial="hidden"
                animate="show"
                variants={{ show: { transition: { staggerChildren: 0.06 } } }}
              >
                {products.map((p, i) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    index={i}
                    onEdit={openEdit}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </motion.div>
            )}
          </>
        )}
      </div>

      {/* Form dialog — key forces remount when switching between edit targets */}
      {resolvedShopId && (
        <ProductFormDialog
          key={editTarget?.id ?? 'new'}
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditTarget(undefined) }}
          shopId={resolvedShopId}
          editProduct={editTarget}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(undefined) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-pixel text-sm text-white">
              Delete product?
            </AlertDialogTitle>
            <AlertDialogDescription className="font-body text-sm text-zinc-400">
              <strong className="text-white">{deleteTarget?.name}</strong> will be permanently
              removed from your catalog and Pinecone index. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-pixel text-xs">Cancel</AlertDialogCancel>
            <button
              onClick={confirmDelete}
              disabled={deleteProduct.isPending}
              className="btn-pixel btn-pixel-sm btn-pixel-danger"
            >
              {deleteProduct.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  )
}

export default function VendorCatalogPage() {
  return (
    <ProtectedRoute requiredRole="vendor">
      <VendorCatalogInner />
    </ProtectedRoute>
  )
}
