export type Role = "ADMIN" | "SALES" | "ACCOUNTING" | "SHIPPING" | "AUDITOR";
export type User = { id: number; name: string; role: Role; email: string; permissions?:string[] };
export type Customer = {
  id: number;
  code: string;
  name: string;
  city: string;
  phone: string;
  email: string;
  paymentTermDays: number;
  riskLimit: number;
  balance: number;
  codeSource: "AUTO" | "MANUAL" | "EXTERNAL";
  externalSystem?: string;
  externalId?: string;
  tags?: string;
};
export type Product = {
  id: number;
  code: string;
  name: string;
  unit: string;
  unitPrice: number;
  minimumPrice: number;
  vatRate: number;
  stockQuantity: number;
};
export type Sale = {
  id: number;
  number: string;
  status: string;
  paymentMethod: string;
  grandTotal: number;
  currency: string;
  exchangeRate: number;
  instrumentType?: string;
  instrumentCount: number;
  createdAt: string;
  customerName: string;
  customerCode: string;
  createdBy: string;
};
export type Approval = {
  id: number;
  status: string;
  reason?: string;
  requestedAt: string;
  saleId: number;
  saleNumber: string;
  grandTotal: number;
  currency: string;
  exchangeRate: number;
  paymentMethod: string;
  customerName: string;
  balance: number;
  riskLimit: number;
  requestedBy: string;
};
export type Instrument = {
  id: number;
  number: string;
  instrumentType: "CHECK" | "PROMISSORY_NOTE";
  serialNumber?: string;
  bankName?: string;
  issuer?: string;
  issueDate?: string;
  dueDate: string;
  daysToDue: number;
  amount: number;
  currency: string;
  exchangeRate: number;
  tryAmount: number;
  status: string;
  currentHolder?: string;
  customerName: string;
  saleNumber: string;
  collectionDate?: string;
  collectionRate?: number;
  collectedTryAmount?: number;
  exchangeDifference?: number;
  discountCompany?: string;
  discountRate?: number;
  discountFee?: number;
  discountCommission?: number;
  discountTax?: number;
  discountNetAmount?: number;
  discountCashAmount?: number;
  discountFinanceCost?: number;
  discountDate?: string;
  discountPricingMethod?: "DIRECT"|"ANNUAL";
  discountAnnualRate?: number;
  discountDays?: number;
  discountWithRecourse?: number;
  endorsementCompany?: string;
  endorsementAmount?: number;
  endorsementDate?: string;
  endorsementReference?: string;
};
export type EDocument = {
  id: number;
  documentType: string;
  sourceType: string;
  sourceId: number;
  provider: string;
  externalId?: string;
  uuid?: string;
  documentNumber?: string;
  status: string;
  errorMessage?: string;
  createdAt: string;
  sourceNumber?: string;
};

export const roleLabels: Record<Role, string> = {
  ADMIN: "Yönetici",
  SALES: "Satış",
  ACCOUNTING: "Muhasebe",
  SHIPPING: "Sevkiyat",
  AUDITOR: "Denetçi",
};
export const statusLabels: Record<string, string> = {
  DRAFT: "Taslak",
  PENDING_APPROVAL: "Onay bekliyor",
  REVISION_REQUESTED: "Düzeltme istendi",
  REJECTED: "Reddedildi",
  APPROVED: "Onaylandı",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal",
  PENDING: "Onay bekliyor",
  PLANNED: "Planlandı",
  PAID: "Ödendi",
  INSTRUMENT_CREATED: "Evrak oluştu",
  IN_PORTFOLIO: "Portföyde",
  GIVEN_TO_BANK: "Bankaya verildi",
  COLLECTED: "Tahsil edildi",
  BOUNCED: "Karşılıksız",
  PROTESTED: "Protestolu",
  RETURNED: "İade",
  ENDORSED: "Ciro edildi",
  ASSIGNED: "Temlik edildi",
  DISCOUNTED: "Kırdırıldı",
  QUEUED: "Kuyrukta",
  SENT: "Gönderildi",
  ERROR: "Hata",
  PREPARING: "Hazırlanıyor",
  READY: "Sevke hazır",
  IN_TRANSIT: "Yola çıktı",
  PARTIALLY_DELIVERED: "Kısmi teslim",
  DELIVERED: "Teslim edildi",
};
export const money = (value: number, currency = "TRY") =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
