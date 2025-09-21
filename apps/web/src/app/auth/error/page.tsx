'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { Button } from '@cared/ui/components/button'
import { Card } from '@cared/ui/components/card'

// Error messages mapping for different error types
const ERROR_MESSAGES: Record<string, { emoji: string; title: string; description: string }> = {
  access_denied: {
    emoji: '🚫',
    title: 'Access Denied',
    description:
      'You have denied access to the application. Please try again if you want to proceed.',
  },
  invalid_request: {
    emoji: '❌',
    title: 'Invalid Request',
    description: 'The authentication request was invalid. Please try again.',
  },
  internal_server_error: {
    emoji: '⚠️',
    title: 'Server Error',
    description: 'An error occurred on the server. Please try again later.',
  },
  default: {
    emoji: '😕',
    title: 'Authentication Error',
    description: 'An unexpected error occurred during authentication.',
  },
}

export default function AuthErrorPage() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error') ?? 'default'
  const errorDescription = searchParams.get('error_description')

  const errorInfo = (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.default) as {
    emoji: string
    title: string
    description: string
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md p-6">
        <div className="text-center">
          <div className="text-3xl mb-4">{errorInfo.emoji}</div>
          <h1 className="text-2xl font-bold mb-4">{errorInfo.title}</h1>
          <p className="text-gray-600 mb-6">{errorDescription || errorInfo.description}</p>
          <div className="flex justify-center gap-4">
            <Button asChild>
              <Link href="/">Return Home</Link>
            </Button>
            <Button variant="secondary">
              <Link href="/auth/sign-in">Try Again</Link>
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
