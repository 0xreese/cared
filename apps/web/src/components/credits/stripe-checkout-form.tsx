'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'

import { Spinner } from '@cared/ui/components/spinner'

import { env } from '@/env'
import {
  useCreateCreditsOnetimeCheckout,
  useCredits,
  useListCreditsOrders,
} from '@/hooks/use-credits'

const stripePromise = loadStripe(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '')

export function StripeCheckoutForm({
  organizationId,
  credits,
  onSuccess,
  onCancel: _,
}: {
  organizationId?: string
  credits: number
  onSuccess?: () => void
  onCancel?: () => void
}) {
  const createOnetimeCheckout = useCreateCreditsOnetimeCheckout(organizationId)
  const { refetchCredits } = useCredits(organizationId)
  const { refetchCreditsOrders } = useListCreditsOrders(organizationId)

  const [isLoading, setIsLoading] = useState(false)

  const fetchClientSecret = useCallback(async () => {
    setIsLoading(true)
    try {
      const { sessionClientSecret } = await createOnetimeCheckout(credits)
      return sessionClientSecret
    } finally {
      setIsLoading(false)
    }
  }, [credits, createOnetimeCheckout])

  const onComplete = useCallback(() => {
    void refetchCredits()
    void refetchCreditsOrders()
    onSuccess?.()
  }, [onSuccess, refetchCredits, refetchCreditsOrders])

  return (
    <div className="relative">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner className="text-muted-foreground" />
        </div>
      )}
      <EmbeddedCheckoutProvider
        stripe={stripePromise}
        options={{
          fetchClientSecret,
          onComplete,
        }}
      >
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  )
}

export function useCheckStripeCheckoutSessionReturnUrl(organizationId?: string) {
  const router = useRouter()
  const { refetchCreditsOrders } = useListCreditsOrders(organizationId)

  useEffect(() => {
    void stripePromise.then((stripe) => {
      if (!stripe) {
        return
      }

      const sessionId = new URLSearchParams(window.location.search).get('onetimeCheckoutSessionId')

      if (sessionId) {
        void refetchCreditsOrders()

        const url = new URL(window.location.toString())
        url.search = ''
        router.replace(url.toString())
      }
    })
  }, [refetchCreditsOrders, router])
}
