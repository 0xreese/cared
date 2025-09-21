'use client'

import type { FallbackProps } from 'react-error-boundary'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Home } from 'lucide-react'

import { Button } from '@cared/ui/components/button'

export function ErrorFallback({ error }: FallbackProps) {
  const router = useRouter()
  const [countdown, setCountdown] = useState(3)
  const [dots, setDots] = useState('.')

  useEffect(() => {
    console.error('error:', error)
  }, [error])

  // Handle click event for returning to homepage
  const handleGoHome = () => {
    router.push('/')
  }

  // Handle click event for going back to previous page
  const handleGoBack = () => {
    router.back()
  }

  // Countdown timer for automatic redirection to homepage
  useEffect(() => {
    if (countdown <= 0) {
      router.push('/')
      return
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1)
    }, 1000)

    return () => clearTimeout(timer)
  }, [countdown, router])

  // Ellipsis animation effect
  useEffect(() => {
    const ellipsisTimer = setInterval(() => {
      setDots((prev) => {
        if (prev.length >= 3) return '.'
        return prev + '.'
      })
    }, 500)

    return () => clearInterval(ellipsisTimer)
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-bold">Something went wrong</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          We encountered an issue and are working to resolve it
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex justify-center gap-2">
          <Button onClick={handleGoBack} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Button onClick={handleGoHome}>
            <Home className="h-4 w-4" />
            Home
          </Button>
        </div>

        <div className="text-center text-sm text-gray-500 dark:text-gray-400">
          Redirecting to homepage in {countdown} seconds <span className="inline-block w-4 text-left">{dots}</span>
        </div>
      </div>
    </div>
  )
}
