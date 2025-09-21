'use client'

import * as React from 'react'
import { useState } from 'react'
import Link from 'next/link'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod/v4'

import { authClient } from '@cared/auth/client'
import { Button } from '@cared/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@cared/ui/components/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@cared/ui/components/form'
import { Input } from '@cared/ui/components/input'
import { Separator } from '@cared/ui/components/separator'
import { CircleSpinner } from '@cared/ui/components/spinner'

import { EmailVerificationPrompt } from '@/components/email-verification-prompt'
import { useAuthRedirect } from '@/lib/auth-utils'

// Forgot password form schema
const forgotPasswordSchema = z.object({
  email: z.email('Please enter a valid email address'),
})

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>

/**
 * Forgot password component that allows users to request a password reset
 */
export function ForgotPassword() {
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const { createAuthUrl } = useAuthRedirect()

  const form = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  })

  const handleRequestPasswordResetSubmit = async (data: ForgotPasswordFormData) => {
    setIsLoading(true)

    try {
      const { error } = await authClient.requestPasswordReset({
        email: data.email,
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })

      if (error) {
        toast.error(error.message ?? error.statusText)
      } else {
        setUserEmail(data.email)
        setIsSuccess(true)
        toast.success('Password reset email sent successfully! Please check your email.')
      }
    } catch {
      toast.error('Failed to send password reset email. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Handles closing the email verification prompt
   */
  const handleClosePrompt = () => {
    setIsSuccess(false)
    form.reset()
  }

  /**
   * Handles resending password reset email
   */
  const handleResendPasswordReset = async (): Promise<boolean> => {
    try {
      const { error } = await authClient.requestPasswordReset({
        email: userEmail,
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })

      if (error) {
        toast.error(error.message ?? error.statusText)
        return false
      }

      toast.success('Password reset email sent successfully! Please check your email.')
      return true
    } catch {
      toast.error('Failed to send password reset email. Please try again.')
      return false
    }
  }

  if (isSuccess) {
    return (
      <EmailVerificationPrompt
        type="password-reset"
        email={userEmail}
        onClose={handleClosePrompt}
        onResend={handleResendPasswordReset}
      />
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 bg-gradient-to-b from-background to-muted/20">
      <div className="w-full max-w-sm">
        <Card className="border-1 shadow-lg rounded-3xl gap-2">
          <CardHeader className="space-y-2 text-center pb-6">
            <CardTitle className="text-2xl">🔑 Forgot password</CardTitle>
            <CardDescription className="text-lg">
              Enter your email to reset your password
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 px-6">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleRequestPasswordResetSubmit)}
                className="space-y-6"
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="Enter your email address"
                          disabled={isLoading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full h-12 rounded-2xl transition-all duration-300"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <CircleSpinner className="w-4 h-4" />
                      <span>Sending...</span>
                    </div>
                  ) : (
                    'Send Reset Link'
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                Remember your password?{' '}
                <Link
                  href={createAuthUrl('/auth/sign-in')}
                  className="text-primary hover:underline font-medium"
                >
                  Sign in
                </Link>
              </p>
            </div>
            <Separator className="my-2" />
            <p className="text-center text-sm text-muted-foreground">Secured by cared 🛡️</p>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
