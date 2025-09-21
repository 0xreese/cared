'use client'

import * as React from 'react'
import { useState } from 'react'
import { MailIcon } from 'lucide-react'

import { Button } from '@cared/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@cared/ui/components/card'
import { CircleSpinner } from '@cared/ui/components/spinner'

type EmailPromptType = 'verification' | 'password-reset'

/**
 * Email prompt component that can be used for both email verification and password reset
 * @param type - The type of email prompt ('verification' or 'password-reset')
 * @param email - The email address that needs verification or password reset
 * @param onClose - Callback function to close the prompt
 * @param onResend - Callback function to resend email, should return Promise<boolean> indicating success/failure
 */
export function EmailVerificationPrompt({
  type = 'verification',
  email,
  onClose,
  onResend,
}: {
  type?: EmailPromptType
  email: string
  onClose: () => void
  onResend?: () => Promise<boolean>
}) {
  const [isResending, setIsResending] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)

  /**
   * Resends verification email to the user
   */
  const handleResendVerification = async () => {
    if (!onResend) {
      return
    }

    setIsResending(true)
    try {
      // Call the onResend function which should handle authClient calls and return success/failure
      const success = await onResend()
      if (success) {
        setResendSuccess(true)
      }
    } finally {
      setIsResending(false)
    }
  }

  const isPasswordReset = type === 'password-reset'
  const title = 'Email Verification Required'
  const description = isPasswordReset
    ? "We've sent you a password reset link"
    : 'Please verify your email address before signing in'
  const resendButtonText = isPasswordReset ? 'Resend Reset Email' : 'Resend Verification Email'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
            <MailIcon />
          </div>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            <p className="mb-2">
              We've sent a {isPasswordReset ? 'password reset' : 'verification'} email to{' '}
              <strong>{email}</strong>
            </p>
            <p className="mb-2">
              {isPasswordReset
                ? 'Please check your inbox and click the reset link to continue. The link will expire in 1 hour for security reasons.'
                : 'Please check your inbox and click the verification link to complete your sign-in.'}
            </p>
            <p>If you don't see the email, check your spam folder.</p>
          </div>

          {resendSuccess && (
            <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 border border-green-200">
              ✅ {isPasswordReset ? 'Password reset' : 'Verification'} email sent successfully!
              Please check your inbox.
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col space-y-2">
          <Button
            onClick={handleResendVerification}
            disabled={isResending || resendSuccess}
            className="w-full"
            variant="outline"
          >
            {isResending ? (
              <>
                <CircleSpinner className="mr-2 h-4 w-4" />
                Sending...
              </>
            ) : (
              resendButtonText
            )}
          </Button>

          <Button onClick={onClose} variant="ghost" className="w-full">
            Close
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
