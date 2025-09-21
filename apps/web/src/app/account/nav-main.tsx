'use client'

import {
  Activity,
  Bot,
  Brain,
  CircleDollarSign,
  Key,
  ShieldCheck,
  UserRound,
  Wallet,
} from 'lucide-react'

import { NavMain } from '@/components/app-sidebar/nav-main'

const items = [
  {
    title: 'Credits',
    url: '/credits',
    icon: CircleDollarSign,
    items: [
      {
        title: 'Usage',
        url: '/usage',
      },
    ],
  },
  {
    title: 'Wallet',
    url: '/wallet',
    icon: Wallet,
  },
  {
    title: 'Models',
    url: '/models',
    icon: Brain,
  },
  {
    title: 'API Keys',
    url: '/api-keys',
    icon: Key,
  },
  {
    title: 'Profile',
    url: '/profile',
    icon: UserRound,
  },
  {
    title: 'Security',
    url: '/security',
    icon: ShieldCheck,
  },
  {
    title: 'Applications',
    url: '/applications',
    icon: Bot,
  },
  {
    title: 'Tracing',
    url: '/tracing',
    icon: Activity,
  },
]

export function AccountNavMain() {
  return <NavMain items={items} baseUrl="/account" />
}
