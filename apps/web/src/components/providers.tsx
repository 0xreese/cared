'use client'

import type { ReactNode } from 'react'
import { useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AuthUIProvider } from '@daveyplate/better-auth-ui'
import { PrivyProvider } from '@privy-io/react-auth'
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana'
import { Provider as JotaiProvider } from 'jotai'
import { useTheme } from 'next-themes'

import { authClient } from '@cared/auth/client'

import type { PrivyClientConfig } from '@privy-io/react-auth'
import { Logo } from '@/components/logo'
import { ThemeProvider } from '@/components/theme'
import { env } from '@/env'
import { usePrivyJwtAuth } from '@/hooks/use-privy'
import { RPCReactProvider } from '@/lib/orpc'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <InnerProviders>{children}</InnerProviders>
    </ThemeProvider>
  )
}

function InnerProviders({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { resolvedTheme } = useTheme()

  const privyConfig = useMemo(() => {
    return {
      appearance: {
        theme: resolvedTheme === 'dark' ? 'dark' : 'light',
        accentColor: '#676FFF',
        logo: <Logo />,
        walletChainType: 'ethereum-and-solana',
        walletList: [
          'phantom',
          'metamask',
          'okx_wallet',
          'wallet_connect',
          'coinbase_wallet',
          'binance',
          'uniswap',
          'rainbow',
          'zerion',
          'rabby_wallet',
          'safe',
          'backpack',
        ],
        showWalletLoginFirst: true,
      },
      loginMethods: ['wallet'], // NOTE: just a placeholder to avoid the "You must enable at least one login method" error
      walletConnectCloudProjectId: env.NEXT_PUBLIC_REOWN_PROJECT_ID,
      externalWallets: {
        solana: {
          connectors: toSolanaWalletConnectors({
            shouldAutoConnect: true,
          }),
        },
        coinbaseWallet: {
          connectionOptions: 'all',
        },
      },
      embeddedWallets: {
        ethereum: {
          createOnLogin: 'all-users',
        },
        solana: {
          createOnLogin: 'all-users',
        },
        extendedCalldataDecoding: true,
      },
    } as PrivyClientConfig
  }, [resolvedTheme])

  return (
    <AuthUIProvider
      // @ts-ignore
      authClient={authClient}
      /* eslint-disable-next-line @typescript-eslint/unbound-method */
      navigate={router.push}
      /* eslint-disable-next-line @typescript-eslint/unbound-method */
      replace={router.replace}
      onSessionChange={() => router.refresh()}
      Link={Link}
      signUp={false}
      credentials={false}
      providers={['google', 'twitter', 'discord', 'github']}
    >
      <RPCReactProvider>
        <JotaiProvider>
          <PrivyProvider appId={env.NEXT_PUBLIC_PRIVY_APP_ID} config={privyConfig}>
            <PrivyJwtAuth />
            {children}
          </PrivyProvider>
        </JotaiProvider>
      </RPCReactProvider>
    </AuthUIProvider>
  )
}

function PrivyJwtAuth() {
  usePrivyJwtAuth()

  return null
}
