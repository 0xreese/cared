import type { Stripe } from 'stripe'
import { CreditCardIcon, LandmarkIcon } from 'lucide-react'

/**
 * Helper function to get payment method icon
 * Returns either a string path to an SVG image or a React component
 * https://docs.stripe.com/payments/payment-methods/overview
 */
export function getPaymentMethodIcon(type: string, brand?: string) {
  if (type === 'card') {
    switch (brand) {
      case 'amex':
        return '/images/payments/american-express.svg'
      case 'visa':
        return '/images/payments/visa.svg'
      case 'mastercard':
        return '/images/payments/mastercard.svg'
      case 'link':
        return '/images/payments/link.svg'
      default:
        return CreditCardIcon
    }
  }

  switch (type) {
    case 'bancontact':
      return '/images/payments/bancontact.svg'
    case 'eps':
      return '/images/payments/eps.svg'
    case 'giropay':
      return '/images/payments/giropay.svg'
    case 'kakao_pay':
      return '/images/payments/kakao-pay.svg'
    case 'naver_pay':
      return '/images/payments/naver-pay.svg'
    case 'payco':
      return '/images/payments/payco.svg'
    case 'samsung_pay':
      return '/images/payments/samsung-pay.svg'
    case 'sepa_debit':
      return '/images/payments/sepa.svg'
    case 'apple_pay':
      return '/images/payments/apple-pay.svg'
    case 'google_pay':
      return '/images/payments/google-pay.svg'
    case 'link':
      return '/images/payments/link.svg'
    case 'alipay':
    case 'wechat_pay':
    case 'mobilepay':
    case 'swish':
    case 'twint':
    case 'amazon_pay':
    case 'cashapp':
    case 'revolut_pay':
    case 'us_bank_account':
    case 'au_becs_debit':
    case 'bacs_debit':
    case 'acss_debit':
    case 'nz_bank_account':
    case 'pay_by_bank':
    case 'ideal':
    case 'sofort':
    case 'multibanco':
    case 'boleto':
    case 'oxxo':
    case 'konbini':
    case 'p24':
    case 'promptpay':
    case 'paynow':
    case 'fpx':
    case 'grabpay':
    case 'klarna':
    case 'afterpay_clearpay':
    case 'affirm':
    case 'alma':
    case 'billie':
    case 'zip':
    case 'blik':
    case 'kr_card':
    case 'satispay':
    case 'interac_present':
    case 'card_present':
    case 'crypto':
    case 'customer_balance':
    case 'paypal':
    case 'pix':
    default:
      return LandmarkIcon
  }
}

/**
 * Interface for payment method display information
 */
export interface PaymentMethodDisplayInfo {
  icon: string | React.ComponentType<{ className?: string }>
  brand: string
  last4: string
  expMonth: number
  expYear: number
  displayName: string
  hasExpiry: boolean
}

/**
 * Helper function to get payment method display info
 * Returns standardized display information for different payment method types
 */
export function getPaymentMethodDisplayInfo(
  paymentMethod: Stripe.PaymentMethod,
): PaymentMethodDisplayInfo {
  const type = paymentMethod.type
  const icon = getPaymentMethodIcon(type, paymentMethod.card?.brand)

  switch (type) {
    case 'card':
      return {
        icon,
        brand: paymentMethod.card?.brand ?? 'Card',
        last4: paymentMethod.card?.last4 ?? '****',
        expMonth: paymentMethod.card?.exp_month ?? 0,
        expYear: paymentMethod.card?.exp_year ?? 0,
        displayName: `${(paymentMethod.card?.brand ?? 'card').toUpperCase()} •••• ${paymentMethod.card?.last4 ?? '****'}`,
        hasExpiry: true,
      }
    case 'us_bank_account':
      return {
        icon,
        brand: 'Bank Account',
        last4: paymentMethod.us_bank_account?.last4 ?? '****',
        expMonth: 0,
        expYear: 0,
        displayName: `Bank Account •••• ${paymentMethod.us_bank_account?.last4 ?? '****'}`,
        hasExpiry: false,
      }
    case 'sepa_debit':
      return {
        icon,
        brand: 'SEPA',
        last4: paymentMethod.sepa_debit?.last4 ?? '****',
        expMonth: 0,
        expYear: 0,
        displayName: `SEPA •••• ${paymentMethod.sepa_debit?.last4 ?? '****'}`,
        hasExpiry: false,
      }
    case 'au_becs_debit':
      return {
        icon,
        brand: 'BECS Direct Debit',
        last4: paymentMethod.au_becs_debit?.last4 ?? '****',
        expMonth: 0,
        expYear: 0,
        displayName: `BECS •••• ${paymentMethod.au_becs_debit?.last4 ?? '****'}`,
        hasExpiry: false,
      }
    case 'bacs_debit':
      return {
        icon,
        brand: 'BACS Direct Debit',
        last4: paymentMethod.bacs_debit?.last4 ?? '****',
        expMonth: 0,
        expYear: 0,
        displayName: `BACS •••• ${paymentMethod.bacs_debit?.last4 ?? '****'}`,
        hasExpiry: false,
      }
    case 'acss_debit':
      return {
        icon,
        brand: 'ACSS Direct Debit',
        last4: paymentMethod.acss_debit?.last4 ?? '****',
        expMonth: 0,
        expYear: 0,
        displayName: `ACSS •••• ${paymentMethod.acss_debit?.last4 ?? '****'}`,
        hasExpiry: false,
      }
    case 'nz_bank_account':
      return {
        icon,
        brand: 'NZ Bank Account',
        last4: paymentMethod.nz_bank_account?.last4 ?? '****',
        expMonth: 0,
        expYear: 0,
        displayName: `NZ Bank •••• ${paymentMethod.nz_bank_account?.last4 ?? '****'}`,
        hasExpiry: false,
      }
    case 'ideal':
      return {
        icon,
        brand: 'iDEAL',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'iDEAL',
        hasExpiry: false,
      }
    case 'bancontact':
      return {
        icon,
        brand: 'Bancontact',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Bancontact',
        hasExpiry: false,
      }
    case 'sofort':
      return {
        icon,
        brand: 'Sofort',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Sofort',
        hasExpiry: false,
      }
    case 'eps':
      return {
        icon,
        brand: 'EPS',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'EPS',
        hasExpiry: false,
      }
    case 'giropay':
      return {
        icon,
        brand: 'Giropay',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Giropay',
        hasExpiry: false,
      }
    case 'kakao_pay':
      return {
        icon,
        brand: 'Kakao Pay',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Kakao Pay',
        hasExpiry: false,
      }
    case 'naver_pay':
      return {
        icon,
        brand: 'Naver Pay',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Naver Pay',
        hasExpiry: false,
      }
    case 'payco':
      return {
        icon,
        brand: 'Payco',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Payco',
        hasExpiry: false,
      }
    case 'samsung_pay':
      return {
        icon,
        brand: 'Samsung Pay',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Samsung Pay',
        hasExpiry: false,
      }
    case 'link':
      return {
        icon,
        brand: 'Link',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Link',
        hasExpiry: false,
      }
    case 'alipay':
      return {
        icon,
        brand: 'Alipay',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Alipay',
        hasExpiry: false,
      }
    case 'wechat_pay':
      return {
        icon,
        brand: 'WeChat Pay',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'WeChat Pay',
        hasExpiry: false,
      }
    case 'mobilepay':
      return {
        icon,
        brand: 'MobilePay',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'MobilePay',
        hasExpiry: false,
      }
    case 'swish':
      return {
        icon,
        brand: 'Swish',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Swish',
        hasExpiry: false,
      }
    case 'twint':
      return {
        icon,
        brand: 'Twint',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Twint',
        hasExpiry: false,
      }
    case 'amazon_pay':
      return {
        icon,
        brand: 'Amazon Pay',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Amazon Pay',
        hasExpiry: false,
      }
    case 'cashapp':
      return {
        icon,
        brand: 'Cash App',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Cash App',
        hasExpiry: false,
      }
    case 'revolut_pay':
      return {
        icon,
        brand: 'Revolut Pay',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Revolut Pay',
        hasExpiry: false,
      }
    case 'pay_by_bank':
      return {
        icon,
        brand: 'Pay by Bank',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Pay by Bank',
        hasExpiry: false,
      }
    case 'multibanco':
      return {
        icon,
        brand: 'Multibanco',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Multibanco',
        hasExpiry: false,
      }
    case 'boleto':
      return {
        icon,
        brand: 'Boleto',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Boleto',
        hasExpiry: false,
      }
    case 'oxxo':
      return {
        icon,
        brand: 'OXXO',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'OXXO',
        hasExpiry: false,
      }
    case 'konbini':
      return {
        icon,
        brand: 'Konbini',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Konbini',
        hasExpiry: false,
      }
    case 'p24':
      return {
        icon,
        brand: 'Przelewy24',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Przelewy24',
        hasExpiry: false,
      }
    case 'promptpay':
      return {
        icon,
        brand: 'PromptPay',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'PromptPay',
        hasExpiry: false,
      }
    case 'paynow':
      return {
        icon,
        brand: 'PayNow',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'PayNow',
        hasExpiry: false,
      }
    case 'fpx':
      return {
        icon,
        brand: 'FPX',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'FPX',
        hasExpiry: false,
      }
    case 'grabpay':
      return {
        icon,
        brand: 'GrabPay',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'GrabPay',
        hasExpiry: false,
      }
    case 'klarna':
      return {
        icon,
        brand: 'Klarna',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Klarna',
        hasExpiry: false,
      }
    case 'afterpay_clearpay':
      return {
        icon,
        brand: 'Afterpay',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Afterpay',
        hasExpiry: false,
      }
    case 'affirm':
      return {
        icon,
        brand: 'Affirm',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Affirm',
        hasExpiry: false,
      }
    case 'alma':
      return {
        icon,
        brand: 'Alma',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Alma',
        hasExpiry: false,
      }
    case 'billie':
      return {
        icon,
        brand: 'Billie',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Billie',
        hasExpiry: false,
      }
    case 'zip':
      return {
        icon,
        brand: 'Zip',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Zip',
        hasExpiry: false,
      }
    case 'blik':
      return {
        icon,
        brand: 'BLIK',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'BLIK',
        hasExpiry: false,
      }
    case 'kr_card':
      return {
        icon,
        brand: 'Korean Card',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Korean Card',
        hasExpiry: false,
      }
    case 'satispay':
      return {
        icon,
        brand: 'Satispay',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Satispay',
        hasExpiry: false,
      }
    case 'interac_present':
      return {
        icon,
        brand: 'Interac Present',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Interac Present',
        hasExpiry: false,
      }
    case 'card_present':
      return {
        icon,
        brand: 'Card Present',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Card Present',
        hasExpiry: false,
      }
    case 'crypto':
      return {
        icon,
        brand: 'Crypto',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Crypto',
        hasExpiry: false,
      }
    case 'customer_balance':
      return {
        icon,
        brand: 'Customer Balance',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'Customer Balance',
        hasExpiry: false,
      }
    case 'paypal':
      return {
        icon,
        brand: 'PayPal',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'PayPal',
        hasExpiry: false,
      }
    case 'pix':
      return {
        icon,
        brand: 'PIX',
        last4: '',
        expMonth: 0,
        expYear: 0,
        displayName: 'PIX',
        hasExpiry: false,
      }
    default:
      return {
        icon,
        brand: 'Unknown',
        last4: '****',
        expMonth: 0,
        expYear: 0,
        displayName: 'Unknown Payment Method',
        hasExpiry: false,
      }
  }
}
