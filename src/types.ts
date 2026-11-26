export interface Subcategory {
  id: number;
  category_id: number;
  name: string;
  slug: string;
  description: string;
  active: boolean;
  sort_order: number;
  product_count?: number;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
  image_url: string;
  active: boolean;
  sort_order: number;
  product_count?: number;
  subcategories?: Subcategory[];
}

export interface ProductImage {
  id: number;
  produto_id?: number;
  url: string;
  imagem?: string;
  alt: string;
  principal?: boolean;
  ordem?: number;
  sort_order: number;
  criado_em?: string;
}

export interface Product {
  id: number;
  category_id: number;
  category_name: string;
  category_slug: string;
  subcategory_id: number | null;
  subcategory_name: string | null;
  subcategory_slug: string | null;
  name: string;
  slug: string;
  brand: string;
  sku: string;
  description: string;
  material: string;
  color: string;
  dimensions: string;
  attributes: Record<string, string>;
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
  accountVerified?: boolean;
  verificationChannel?: 'email' | 'sms';
  createdAt?: string;
}

export interface ShippingOption {
  id: 'pac' | 'sedex' | 'local';
  name: string;
  carrier: string;
  service: string;
  priceCents: number;
  estimatedDays: number;
}

export interface PublicStoreSettings {
  enablePix: boolean;
  enableCreditCard: boolean;
  enableBoleto: boolean;
  pixDiscountPercent: number;
  maxInstallments: number;
  hasRealPixKey: boolean;
  hasExternalPaymentLink: boolean;
  mercadoPagoConfigured: boolean;
  freeShippingThresholdCents: number;
  localDeliveryEnabled: boolean;
  localDeliveryLabel: string;
  localDeliveryPriceCents: number;
  localDeliveryDays: number;
  whatsappNumber: string;
  whatsappMessage: string;
  contactEmail: string;
  storeCity: string;
  smsConfigured?: boolean;
}

export interface EmailLog {
  id: number;
  recipient_email: string;
  subject: string;
  event_type: string;
  status: 'sent' | 'skipped_no_smtp' | 'failed';
  error_message: string;
  created_at: string;
}

export interface AdminStoreSettings {
  enablePix: boolean;
  enableCreditCard: boolean;
  enableBoleto: boolean;
  pixKey: string;
  pixKeyType: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';
  pixMerchantName: string;
  pixMerchantCity: string;
  pixDiscountPercent: number;
  maxInstallments: number;
  externalPaymentLink: string;
  freeShippingThresholdCents: number;
  shippingMode: 'regional' | 'fixed';
  fixedPacCents: number;
  fixedSedexCents: number;
  shippingExtraDays: number;
  localDeliveryEnabled: boolean;
  localDeliveryLabel: string;
  localDeliveryPriceCents: number;
  localDeliveryDays: number;
  whatsappNumber: string;
  whatsappMessage: string;
  contactEmail: string;
  storeCity: string;
  emailSenderName: string;
  emailOnRegister: boolean;
  emailOnOrder: boolean;
  emailOnStatus: boolean;
  emailNotifyOwner: boolean;
  gatewayStatus?: {
    mercadoPagoConfigured: boolean;
    appUrlConfigured: boolean;
  };
  emailStatus?: {
    configured: boolean;
    hostConfigured: boolean;
    userConfigured: boolean;
    fromAddress: string;
    port: number;
  };
  smsStatus?: {
    configured: boolean;
    provider: 'twilio' | 'webhook' | 'none';
  };
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
    checkout_url?: string;
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
