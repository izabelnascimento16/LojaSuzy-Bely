export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
  sort_order: number;
}

export interface ProductImage {
  id: number;
  url: string;
  alt: string;
  sort_order: number;
}

export interface Product {
  id: number;
  category_id: number;
  category_name: string;
  category_slug: string;
  name: string;
  slug: string;
  description: string;
  material: string;
  color: string;
  dimensions: string;
  price_cents: number;
  promo_price_cents: number | null;
  stock: number;
  is_featured: boolean;
  is_new: boolean;
  is_bestseller: boolean;
  sales_count: number;
  active: boolean;
  images: ProductImage[];
}

export interface Banner {
  id: number;
  title: string;
  subtitle: string;
  cta_text: string;
  cta_category: string;
  image_url: string;
  active: boolean | number;
  sort_order: number;
}

export interface Testimonial {
  id: number;
  author_name: string;
  author_city: string;
  rating: number;
  comment: string;
  product_name: string;
}

export interface CartItem {
  productId: number;
  name: string;
  slug: string;
  imageUrl: string;
  priceCents: number;
  promoPriceCents: number | null;
  stock: number;
  quantity: number;
}

export interface Address {
  id: number;
  user_id?: number;
  label: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  is_default: number | boolean;
}

export interface User {
  id: number;
  role: 'customer' | 'admin' | 'staff';
  fullName: string;
  cpfMasked: string | null;
  email: string;
  phone: string;
  permissions: string[];
  createdAt?: string;
}

export interface ShippingOption {
  id: 'pac' | 'sedex';
  name: string;
  carrier: string;
  service: string;
  priceCents: number;
  estimatedDays: number;
}

export interface OrderItem {
  id: number;
  product_id: number;
  product_name: string;
  unit_price_cents: number;
  quantity: number;
  total_cents: number;
}

export interface Order {
  id: number;
  order_number: string;
  user_id: number;
  status: 'aguardando_pagamento' | 'pago' | 'em_separacao' | 'enviado' | 'entregue' | 'cancelado';
  subtotal_cents: number;
  shipping_cents: number;
  discount_cents: number;
  total_cents: number;
  shipping_method: string;
  shipping_cep: string;
  shipping_address: {
    cep: string;
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
  };
  payment_method: 'pix' | 'credit_card' | 'boleto';
  payment_status: 'pending' | 'approved' | 'cancelled';
  tracking_code: string;
  cancel_reason?: string;
  created_at: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  items: OrderItem[];
  payment?: {
    gateway: string;
    method: string;
    status: string;
    amount_cents: number;
    pix_copy_paste: string;
    boleto_barcode: string;
    card_last4: string;
    card_brand: string;
  };
  shipment?: {
    carrier: string;
    service: string;
    estimated_days: number;
    tracking_code: string;
    status: string;
  };
}

export type AppView =
  | 'home'
  | 'catalog'
  | 'product'
  | 'checkout'
  | 'account'
  | 'admin'
  | 'institucional';

export type InstitutionalTab =
  | 'sobre'
  | 'privacidade'
  | 'trocas'
  | 'entrega'
  | 'termos';
