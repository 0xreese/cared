'use client'

import * as React from 'react'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
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

import {
  PasswordStrengthIndicator,
  validatePasswordStrength,
} from '@/components/password-strength-indicator'
import { useAuthRedirect } from '@/lib/auth-utils'

// Reset password form schema with password strength validation
const resetPasswordSchema = z
  .object({
    newPassword: z.string().superRefine((password, ctx) => {
      const validation = validatePasswordStrength(password)
      if (!validation.success && validation.error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: validation.error.message,
        })
      }
    }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  })

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>

/**
 * Reset password component that allows users to set a new password
 */
export function ResetPassword() {
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [password, setPassword] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [tokenError, setTokenError] = useState<string | null>(null)

  const router = useRouter()
  const searchParams = useSearchParams()
  const { createAuthUrl } = useAuthRedirect()

  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
  })

  // Check for token in URL params on component mount
  useEffect(() => {
    const tokenParam = searchParams.get('token')
    const errorParam = searchParams.get('error')

    if (errorParam === 'INVALID_TOKEN') {
      setTokenError('Invalid or expired reset token. Please request a new password reset.')
    } else if (tokenParam) {
      setToken(tokenParam)
    } else {
      setTokenError('No reset token found. Please check your email for the reset link.')
    }
  }, [searchParams])

  /**
   * Handles reset password form submission
   * @param data - Form data containing new password and confirmation
   */
  const handleResetPasswordSubmit = async (data: ResetPasswordFormData) => {
    if (!token) {
      toast.error('No reset token found. Please request a new password reset.')
      return
    }

    setIsLoading(true)

    try {
      const { error } = await authClient.resetPassword({
        newPassword: data.newPassword,
        token,
      })

      if (error) {
        toast.error(error.message ?? error.statusText)
      } else {
        setIsSuccess(true)
        toast.success('Password reset successfully! You can now sign in with your new password.')
      }
    } catch {
      toast.error('Failed to reset password. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Show error state if token is invalid or missing
  if (tokenError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4 bg-gradient-to-b from-background to-muted/20">
        <div className="w-full max-w-sm">
          <Card className="border-1 shadow-lg rounded-3xl gap-2">
            <CardHeader className="space-y-2 text-center pb-6">
              <CardTitle className="text-2xl">❌ Invalid Token</CardTitle>
              <CardDescription className="text-lg">
                Password reset link is invalid or expired
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 text-center">
              <p className="text-muted-foreground">{tokenError}</p>
              <Button
                variant="outline"
                className="w-full h-12 rounded-2xl transition-all duration-300"
                onClick={() => router.push('/auth/forgot-password')}
              >
                Request New Reset
              </Button>
            </CardContent>
            <CardFooter className="flex flex-col gap-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  Remember your password?{' '}
                  <Link href="/auth/sign-in" className="text-primary hover:underline font-medium">
                    Sign in
                  </Link>
                </p>
              </div>
              <Separator />
              <p className="text-center text-sm text-muted-foreground">Secured by cared 🛡️</p>
            </CardFooter>
          </Card>
        </div>
      </div>
    )
  }

  // Show success state after password reset
  if (isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4 bg-gradient-to-b from-background to-muted/20">
        <div className="w-full max-w-sm">
          <Card className="border-1 shadow-lg rounded-3xl gap-2">
            <CardHeader className="space-y-2 text-center pb-6">
              <CardTitle className="text-2xl">✅ Password Reset Successfully</CardTitle>
              <CardDescription className="text-lg">Your password has been updated</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 px-6 text-center">
              <p className="text-muted-foreground">
                You can now sign in to your account using your new password.
              </p>
              <Button
                variant="outline"
                className="w-full h-12 rounded-2xl transition-all duration-300"
                onClick={() => router.push('/auth/sign-in')}
              >
                Sign In
              </Button>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Separator className="my-2" />
              <p className="text-center text-sm text-muted-foreground">Secured by cared 🛡️</p>
            </CardFooter>
          </Card>
        </div>
      </div>
    )
  }

  // Show loading state while checking token
  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4 bg-gradient-to-b from-background to-muted/20">
        <div className="w-full max-w-sm">
          <Card className="border-1 shadow-lg rounded-3xl gap-2">
            <CardContent className="space-y-6 px-6 py-12 text-center">
              <CircleSpinner className="w-8 h-8 mx-auto" />
              <p className="text-muted-foreground">Verifying reset token...</p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 bg-gradient-to-b from-background to-muted/20">
      <div className="w-full max-w-sm">
        <Card className="border-1 shadow-lg rounded-3xl gap-2">
          <CardHeader className="space-y-2 text-center pb-6">
            <CardTitle className="text-2xl">🔑 Reset Password</CardTitle>
            <CardDescription className="text-lg">Enter your new password</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 px-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleResetPasswordSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Enter your new password"
                          disabled={isLoading}
                          {...field}
                          onChange={(e) => {
                            field.onChange(e)
                            setPassword(e.target.value)
                          }}
                        />
                      </FormControl>
                      <PasswordStrengthIndicator password={password} />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Confirm your new password"
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
                      <span>Resetting...</span>
                    </div>
                  ) : (
                    'Reset Password'
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
