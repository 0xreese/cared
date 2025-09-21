'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { LucideAlertCircle, LucideEye, LucideEyeOff, LucideKey } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod/v4'

import { authClient } from '@cared/auth/client'
import { Alert, AlertDescription } from '@cared/ui/components/alert'
import { Button } from '@cared/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@cared/ui/components/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@cared/ui/components/form'
import { Input } from '@cared/ui/components/input'

import {
  PasswordStrengthIndicator,
  validatePasswordStrength,
} from '@/components/password-strength-indicator'
import { useAccounts } from '@/hooks/use-session'

// Change password form schema with password strength validation
const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
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
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword'],
  })

type ChangePasswordFormData = z.infer<typeof changePasswordSchema>

interface ChangePasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Change password dialog component that allows users to change their password
 * If no credential account exists, redirects to forgot password flow
 */
export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const router = useRouter()
  const { accounts } = useAccounts()
  const [isLoading, setIsLoading] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')

  // Check if user has a credential account (email/password authentication)
  const hasCredentialAccount = accounts.some((account) => account.providerId === 'credential')

  const form = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  /**
   * Handles redirect to forgot password flow when no credential account exists
   */
  const handleRedirectToForgotPassword = () => {
    onOpenChange(false)
    router.push('/auth/forgot-password')
  }

  /**
   * Handles change password form submission
   * @param data - Form data containing current password, new password and confirmation
   */
  const handleChangePasswordSubmit = async (data: ChangePasswordFormData) => {
    setIsLoading(true)

    try {
      const { error } = await authClient.changePassword({
        newPassword: data.newPassword,
        currentPassword: data.currentPassword,
        revokeOtherSessions: true,
      })

      if (error) {
        toast.error(error.message ?? error.statusText)
      } else {
        toast.success('Password changed successfully! Other sessions have been revoked.')
        form.reset()
        setNewPassword('')
        onOpenChange(false)
      }
    } catch (error) {
      console.error('Failed to change password:', error)
      toast.error('Failed to change password. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Handles dialog close and form reset
   */
  const handleClose = () => {
    form.reset()
    setNewPassword('')
    onOpenChange(false)
  }

  // If no credential account exists, show message and redirect button
  if (!hasCredentialAccount) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LucideKey className="h-5 w-5" />
              Set Password
            </DialogTitle>
            <DialogDescription>
              You don't have a password set for your account yet. Use the forgot password flow to
              set your first password.
            </DialogDescription>
          </DialogHeader>

          <Alert>
            <LucideAlertCircle className="h-4 w-4" />
            <AlertDescription>
              Since you don't have a password set, you'll need to use the forgot password flow to
              set your first password. This ensures your email is verified and your account is
              properly linked.
            </AlertDescription>
          </Alert>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="button" onClick={handleRedirectToForgotPassword}>
              Go to Forgot Password
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LucideKey className="h-5 w-5" />
            Change Password
          </DialogTitle>
          <DialogDescription>
            Enter your current password and choose a new one. Other sessions will be revoked for
            security.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleChangePasswordSubmit)} className="space-y-4">
            {/* Current Password Field */}
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showCurrentPassword ? 'text' : 'password'}
                        placeholder="Enter your current password"
                        disabled={isLoading}
                        {...field}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        disabled={isLoading}
                      >
                        {showCurrentPassword ? (
                          <LucideEyeOff className="h-4 w-4" />
                        ) : (
                          <LucideEye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* New Password Field */}
            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showNewPassword ? 'text' : 'password'}
                        placeholder="Enter your new password"
                        disabled={isLoading}
                        {...field}
                        onChange={(e) => {
                          field.onChange(e)
                          setNewPassword(e.target.value)
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        disabled={isLoading}
                      >
                        {showNewPassword ? (
                          <LucideEyeOff className="h-4 w-4" />
                        ) : (
                          <LucideEye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </FormControl>
                  <PasswordStrengthIndicator password={newPassword} />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Confirm Password Field */}
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm New Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="Confirm your new password"
                        disabled={isLoading}
                        {...field}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        disabled={isLoading}
                      >
                        {showConfirmPassword ? (
                          <LucideEyeOff className="h-4 w-4" />
                        ) : (
                          <LucideEye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} className="min-w-[100px]">
                {isLoading ? 'Changing...' : 'Change Password'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
