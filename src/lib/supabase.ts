import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configured = Boolean(url && key && !url.includes('your-project'))
export const supabase = configured ? createClient(url!, key!) : null

export type Item = {
  id: string
  name: string
  value: number | null
  image_path: string | null
  category: string | null
  rarity: string | null
  description: string | null
  demand: number | null
  variant_parent_id: string | null
  variant_color_name: string | null
  variant_color_hex: string | null
  created_at: string
  updated_at: string
}

export type PromoCode = {
  id: string
  code: string
  reward: string
  is_expired: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export function itemImage(path: string | null | undefined) {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path
  return path.startsWith('/') ? path : `/catalog/${path}`
}

export function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return 'Something went wrong. Please try again.'
}
