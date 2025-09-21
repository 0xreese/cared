'use client'

import * as React from 'react'
import { useState } from 'react'
import Link from 'next/link'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { generateFromEmail } from 'unique-username-generator'
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

import type { SocialProvider } from '@/lib/auth-providers'
import { EmailVerificationPrompt } from '@/components/email-verification-prompt'
import {
  PasswordStrengthIndicator,
  validatePasswordStrength,
} from '@/components/password-strength-indicator'
import { useSessionPublic } from '@/hooks/use-session'
import { allowedProviders } from '@/lib/auth-providers'
import { useAuthRedirect } from '@/lib/auth-utils'
import { BETTER_AUTH_ERROR_MESSAGES } from '@/lib/error'

// Sign-up form schema with password strength validation
const signUpSchema = z.object({
  email: z.email('Please enter a valid email address'),
  password: z.string().superRefine((password, ctx) => {
    const validation = validatePasswordStrength(password)
    if (!validation.success && validation.error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: validation.error.message,
      })
    }
  }),
})

// Sign-in form schema with basic password validation
const signInSchema = z.object({
  email: z.email('Please enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
})

type SignUpFormData = z.infer<typeof signUpSchema>
type SignInFormData = z.infer<typeof signInSchema>

interface SignInUpProps {
  mode: 'sign-in' | 'sign-up'
}

/**
 * Sign-in/Sign-up page component with social login options and email/password form
 * @param mode - The mode of the component: 'sign-in' or 'sign-up'
 */
export function SignInUp({ mode }: SignInUpProps) {
  const [isLoading, setIsLoading] = useState<string>()
  const [password, setPassword] = useState('')
  const [showEmailVerification, setShowEmailVerification] = useState(false)
  const [unverifiedEmail, setUnverifiedEmail] = useState('')

  const { user, isSuccess } = useSessionPublic()
  const { redirectTo, fullRedirectTo, createAuthUrl } = useAuthRedirect()

  // Initialize form based on mode
  const signUpForm = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const signInForm = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  // Use appropriate form based on mode
  const form = mode === 'sign-up' ? signUpForm : signInForm

  if (isSuccess && user) {
    window.location.href = redirectTo
  }

  /**
   * Handles social provider authentication (only for sign-in)
   * @param provider - The social provider to authenticate with
   */
  const handleSocialSignIn = async (provider: SocialProvider) => {
    if (mode !== 'sign-in') return

    setIsLoading(provider)
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: fullRedirectTo,
    })
    if (error) {
      toast.error(error.message ?? error.statusText)
      setIsLoading(undefined)
    }
  }

  /**
   * Handles email/password form submission
   * @param data - Form data containing email and password
   */
  const handleEmailPasswordSubmit = async (data: SignUpFormData | SignInFormData) => {
    setIsLoading('credential')

    if (mode === 'sign-up') {
      const { error } = await authClient.signUp.email({
        name: generateFromEmail(data.email, { stripLeadingDigits: true }),
        email: data.email,
        password: data.password,
        callbackURL: fullRedirectTo,
      })
      setIsLoading(undefined)
      if (error) {
        // Check if the error is related to user already exists
        if (error.message?.includes(BETTER_AUTH_ERROR_MESSAGES.USER_ALREADY_EXISTS)) {
          toast.error('User already exists. Please sign in instead.')
          // Switch to sign-in mode by redirecting
          window.location.href = createAuthUrl('/auth/sign-in')
        } else {
          toast.error(error.message ?? error.statusText)
        }
      } else {
        setUnverifiedEmail(data.email)
        setShowEmailVerification(true)
      }
    } else {
      const { error } = await authClient.signIn.email({
        email: data.email,
        password: data.password,
        rememberMe: true,
        callbackURL: fullRedirectTo,
      })
      setIsLoading(undefined)
      if (error) {
        // Check if the error is related to email not verified
        if (error.message?.includes(BETTER_AUTH_ERROR_MESSAGES.EMAIL_NOT_VERIFIED)) {
          setUnverifiedEmail(data.email)
          setShowEmailVerification(true)
        } else {
          toast.error(error.message ?? error.statusText)
        }
      }
    }
  }

  /**
   * Handles resending verification email
   */
  const handleResendVerification = async (): Promise<boolean> => {
    try {
      const { error } = await authClient.sendVerificationEmail({
        email: unverifiedEmail,
        callbackURL: fullRedirectTo,
      })

      if (error) {
        toast.error(error.message ?? error.statusText)
        return false
      }

      toast.success('Verification email sent successfully! Please check your inbox.')
      return true
    } catch {
      toast.error('Failed to send verification email. Please try again.')
      return false
    }
  }

  const isSignUp = mode === 'sign-up'
  const title = isSignUp ? '🎉 Create your account' : '🎉 Sign in to Cared'
  const description = isSignUp
    ? 'Welcome! Please fill in the details to get started.'
    : 'Welcome! Please sign in to continue.'
  const submitButtonText = isSignUp ? 'Create Account' : 'Sign in with Email'
  const loadingText = isSignUp ? 'Creating account...' : 'Signing in...'

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 bg-gradient-to-b from-background to-muted/20">
      {showEmailVerification && (
        <EmailVerificationPrompt
          type="verification"
          email={unverifiedEmail}
          onClose={() => setShowEmailVerification(false)}
          onResend={handleResendVerification}
        />
      )}

      <div className="w-full max-w-sm">
        <Card className="border-1 shadow-lg rounded-3xl gap-2 px-2">
          <CardHeader className="space-y-2 text-center pb-6">
            <CardTitle className="text-2xl">{title}</CardTitle>
            <CardDescription className="text-lg">{description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 px-6">
            {/* Social login buttons - only show for sign-in */}
            {!isSignUp && (
              <>
                <div className="grid gap-4">
                  {allowedProviders.map(({ icon: Icon, name, provider }) => {
                    return (
                      <Button
                        key={provider}
                        variant="outline"
                        size="lg"
                        className={`flex items-center justify-center gap-3 h-12 transition-all duration-300 rounded-2xl`}
                        disabled={!!isLoading}
                        onClick={() => handleSocialSignIn(provider)}
                      >
                        <div className="w-5 h-5 flex items-center justify-center">
                          {isLoading === provider ? (
                            <CircleSpinner className="text-muted-foreground" />
                          ) : (
                            <Icon variant="color" />
                          )}
                        </div>
                        <span className="font-normal text-base">{name}</span>
                      </Button>
                    )
                  })}
                </div>

                {/* Divider - only show for sign-in */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <Separator className="w-full" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Or continue with
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* Email/Password form */}
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleEmailPasswordSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="Enter your email"
                          disabled={!!isLoading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Password</FormLabel>

                        {/* Show forgot password link only for sign-in */}
                        {!isSignUp && (
                          <div className="text-right">
                            <Link
                              href={createAuthUrl('/auth/forgot-password')}
                              className="text-sm text-primary hover:underline"
                            >
                              Forgot password?
                            </Link>
                          </div>
                        )}
                      </div>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Enter your password"
                          disabled={!!isLoading}
                          {...field}
                          onChange={(e) => {
                            field.onChange(e)
                            setPassword(e.target.value)
                          }}
                        />
                      </FormControl>
                      {/* Show password strength indicator only for sign-up */}
                      {isSignUp && <PasswordStrengthIndicator password={password} />}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full h-12 rounded-2xl transition-all duration-300"
                  disabled={!!isLoading}
                >
                  {isLoading === 'credential' ? (
                    <div className="flex items-center gap-2">
                      <CircleSpinner className="w-4 h-4" />
                      <span>{loadingText}</span>
                    </div>
                  ) : (
                    submitButtonText
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            {/* Toggle between sign-in and sign-up */}
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                <Link
                  href={isSignUp ? createAuthUrl('/auth/sign-in') : createAuthUrl('/auth/sign-up')}
                  className="text-primary hover:underline font-medium"
                >
                  {isSignUp ? 'Sign in' : 'Sign up'}
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
