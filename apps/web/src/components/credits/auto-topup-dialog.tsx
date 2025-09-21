'use client'

import type Stripe from 'stripe'
import { useEffect, useState } from 'react'
import { CreditCardIcon, PlusIcon } from 'lucide-react'

import { Button } from '@cared/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@cared/ui/components/dialog'
import { Label } from '@cared/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@cared/ui/components/select'
import { Separator } from '@cared/ui/components/separator'
import { Switch } from '@cared/ui/components/switch'

import { NumberInput } from '@/components/number-input'
import { useCredits, useUpdateAutoRechargeCreditsSettings } from '@/hooks/use-credits'
import {
  useDefaultPaymentMethodId,
  useListPaymentMethods,
  useUpdateDefaultPaymentMethod,
} from '@/hooks/use-stripe'
import { PaymentMethodDialog } from './payment-method-dialog'

export function AutoTopupDialog({
  organizationId,
  open,
  onOpenChange,
}: {
  organizationId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { credits } = useCredits(organizationId)
  const defaultPaymentMethodId = useDefaultPaymentMethodId(organizationId)
  const { paymentMethods } = useListPaymentMethods(organizationId)
  const updateAutoRechargeSettings = useUpdateAutoRechargeCreditsSettings(organizationId)
  const updateDefaultPaymentMethod = useUpdateDefaultPaymentMethod(organizationId)

  const [isAutoTopupEnabled, setIsAutoTopupEnabled] = useState(true)
  const [autoRechargeThreshold, setAutoRechargeThreshold] = useState(10)
  const [autoRechargeAmount, setAutoRechargeAmount] = useState(50)
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string>('')
  const [showPaymentMethodDialog, setShowPaymentMethodDialog] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    const firstPaymentMethodId = paymentMethods?.[0]?.id
    if (!selectedPaymentMethodId && (defaultPaymentMethodId ?? firstPaymentMethodId)) {
      setSelectedPaymentMethodId(defaultPaymentMethodId ?? firstPaymentMethodId!)
    }
  }, [defaultPaymentMethodId, paymentMethods, selectedPaymentMethodId])

  const fee = Math.max(autoRechargeAmount * 0.05, 0.8)
  const totalAmount = autoRechargeAmount + fee

  useEffect(() => {
    setShowPaymentMethodDialog(false)
    setIsUpdating(false)
  }, [open])

  useEffect(() => {
    setIsAutoTopupEnabled(!!credits.metadata.autoRechargeEnabled)
    setAutoRechargeThreshold(credits.metadata.autoRechargeThreshold ?? 10)
    setAutoRechargeAmount(credits.metadata.autoRechargeAmount ?? 50)
  }, [open, credits])

  const isDirty =
    isAutoTopupEnabled !== !!credits.metadata.autoRechargeEnabled ||
    (isAutoTopupEnabled &&
      (autoRechargeThreshold !== credits.metadata.autoRechargeThreshold ||
        autoRechargeAmount !== credits.metadata.autoRechargeAmount ||
        selectedPaymentMethodId !== defaultPaymentMethodId))

  const handleUpdateSettings = async () => {
    setIsUpdating(true)
    try {
      if (isAutoTopupEnabled) {
        // Update existing auto-recharge settings
        await Promise.all([
          // eslint-disable-next-line @typescript-eslint/await-thenable
          autoRechargeThreshold > 0 &&
            autoRechargeAmount > 0 &&
            updateAutoRechargeSettings(true, autoRechargeThreshold, autoRechargeAmount),
          // eslint-disable-next-line @typescript-eslint/await-thenable
          selectedPaymentMethodId && updateDefaultPaymentMethod(selectedPaymentMethodId),
        ])
      } else {
        // Disable auto-recharge when disabled
        await updateAutoRechargeSettings(false)
      }
      onOpenChange(false)
    } finally {
      setIsUpdating(false)
    }
  }

  const handlePaymentMethodAdded = () => {
    setShowPaymentMethodDialog(false)
  }

  const formatPaymentMethod = (pm: Stripe.PaymentMethod) => {
    if (pm.type === 'card' && pm.card) {
      const card = pm.card
      return `${card.brand.toUpperCase()} •••• ${card.last4}`
    }
    return pm.type
  }

  const handleCloseAutoTopupDialog = () => {
    onOpenChange(false)
  }

  const formatCredits = (amount: number) => {
    return amount.toFixed(2)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[95vh] px-0 flex flex-col">
        <DialogHeader className="px-6">
          <DialogTitle>Auto Top-Up</DialogTitle>
          <DialogDescription>
            Automatically top-up your credits when your balance falls below the threshold. Cared
            charges a 5% ($0.80 minimum) fee per recharge.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-topup-enabled">Enable Auto Top-Up</Label>
              <Switch
                id="auto-topup-enabled"
                checked={isAutoTopupEnabled}
                onCheckedChange={setIsAutoTopupEnabled}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Toggle to enable or disable automatic credit top-up.
            </p>
          </div>
          {isAutoTopupEnabled && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="threshold">
                  Auto Top-Up Threshold{' '}
                  <span className="text-muted-foreground text-xs">
                    (Minimum of $5 and maximum of $2500)
                  </span>
                </Label>
                <NumberInput
                  id="threshold"
                  value={autoRechargeThreshold}
                  onChange={setAutoRechargeThreshold}
                  min={5}
                  max={2500}
                  step={1}
                  placeholder="Enter threshold amount"
                />
                <p className="text-sm text-muted-foreground">
                  When your balance falls below this amount, we'll automatically top-up your
                  account.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">
                  Top-Up Amount{' '}
                  <span className="text-muted-foreground text-xs">
                    (Minimum of $5 and maximum of $2500)
                  </span>
                </Label>
                <NumberInput
                  id="amount"
                  value={autoRechargeAmount}
                  onChange={setAutoRechargeAmount}
                  min={5}
                  max={2500}
                  step={1}
                  placeholder="Enter recharge amount"
                />
                <p className="text-sm text-muted-foreground">
                  This amount will be added to your account each time auto top-up is triggered.
                </p>
              </div>

              <div className="space-y-2 p-3 bg-muted rounded-lg">
                <div className="flex justify-between text-sm">
                  <span>Top-Up Amount:</span>
                  <span>${formatCredits(autoRechargeAmount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Processing Fee:</span>
                  <span>${formatCredits(fee)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-medium">
                  <span>Total per Recharge:</span>
                  <span>${formatCredits(totalAmount)}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Payment Gateway</Label>
                <div className="flex gap-2">
                  <Button variant="default" size="sm">
                    <CreditCardIcon className="h-4 w-4" />
                    Stripe
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Currently only Stripe is supported for auto top-up payments.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Payment Method</Label>
                <div className="flex gap-2">
                  <Select
                    value={selectedPaymentMethodId}
                    onValueChange={setSelectedPaymentMethodId}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select a payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods?.map((pm) => (
                        <SelectItem key={pm.id} value={pm.id}>
                          {formatPaymentMethod(pm)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={() => setShowPaymentMethodDialog(true)}>
                    <PlusIcon className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Choose a payment method for automatic top-ups. Click + to add a new payment
                  method.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseAutoTopupDialog}>
              Cancel
            </Button>
            <Button onClick={handleUpdateSettings} disabled={!isDirty || isUpdating}>
              {isUpdating ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>

      <PaymentMethodDialog
        organizationId={organizationId}
        open={showPaymentMethodDialog}
        onOpenChange={setShowPaymentMethodDialog}
        onSuccess={handlePaymentMethodAdded}
      />
    </Dialog>
  )
}
