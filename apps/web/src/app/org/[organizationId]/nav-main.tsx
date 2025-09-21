'use client'

import { Activity, Boxes, Brain, CircleDollarSign, Key, Settings2, Users } from 'lucide-react'

import { NavMain } from '@/components/app-sidebar/nav-main'

const items = [
  {
    title: 'Workspaces',
    url: '/workspaces',
    icon: Boxes,
  },
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
    title: 'Members',
    url: '/members',
    icon: Users,
  },
  {
    title: 'Tracing',
    url: '/tracing',
    icon: Activity,
  },
  {
    title: 'Settings',
    url: '/settings',
    icon: Settings2,
  },
]

export function OrganizationNavMain({ baseUrl }: { baseUrl: string }) {
  return <NavMain items={items} baseUrl={baseUrl} />
}
