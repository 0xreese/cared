import { AlertCircleIcon } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@cared/ui/components/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@cared/ui/components/dialog'

import type { Wallet } from '@/hooks/use-wallets'
import { QrCode } from '@/components/qr-code'
import { WalletAddress } from '@/components/wallet-address'

interface WalletQrDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedWallet: Wallet | null
  copyToClipboard: (value: string) => void
}

export function WalletQrDialog({
  open,
  onOpenChange,
  selectedWallet,
  copyToClipboard,
}: WalletQrDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Wallet Address</DialogTitle>
        </DialogHeader>
        {selectedWallet && (
          <div className="flex flex-col items-center gap-6 py-4">
            <QrCode value={selectedWallet.address} size={200} />
            <div className="text-center">
              <p className="text-sm font-medium mb-2">
                {selectedWallet.type === 'ethereum' ? 'Ethereum' : 'Solana'} Address
              </p>
              <WalletAddress address={selectedWallet.address} copyToClipboard={copyToClipboard} />
            </div>
            <Alert className="border-yellow-500">
              <AlertCircleIcon />
              <AlertTitle>Not a Credits Top-up Address</AlertTitle>
              <AlertDescription>
                If you want to top up your credits, please go to the credits top-up page and choose
                to transfer from this wallet.
              </AlertDescription>
            </Alert>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
