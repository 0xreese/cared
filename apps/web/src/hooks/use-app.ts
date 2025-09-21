import { useCallback, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { useSuspenseQuery } from '@tanstack/react-query'

import { useWorkspaces } from '@/hooks/use-workspace'
import { orpc } from '@/lib/orpc'
import { stripIdPrefix } from '@/lib/utils'

export function useAllApps() {
  const {
    data: { apps },
  } = useSuspenseQuery(orpc.app.list.queryOptions())

  return apps
}

export function useApps({
  organizationId,
  workspaceId,
}: {
  organizationId?: string
  workspaceId?: string
}) {
  const apps = useAllApps()
  const workspacesByOrg = useWorkspaces(organizationId)

  return useMemo(() => {
    if (organizationId) {
      const workspaces = new Set(workspacesByOrg.map((w) => w.id))
      return apps.filter((app) => workspaces.has(app.app.workspaceId))
    } else if (workspaceId) {
      return apps.filter((app) => app.app.workspaceId === workspaceId)
    } else {
      return []
    }
  }, [organizationId, workspaceId, apps, workspacesByOrg])
}

export function useAppsByCategories({
  workspaceId,
  categories,
}: {
  workspaceId: string
  categories: Set<string>
}) {
  const apps = useApps({ workspaceId })

  return useMemo(
    () => apps.filter((app) => app.categories.some((c) => categories.has(c.id))),
    [apps, categories],
  )
}

export function useAppsByTags({ workspaceId, tags }: { workspaceId: string; tags: Set<string> }) {
  const apps = useApps({ workspaceId })

  return useMemo(() => apps.filter((app) => app.tags.some((t) => tags.has(t))), [apps, tags])
}

export function replaceRouteWithAppId(route: string, id: string) {
  return route.replace(/^\/app\/[^/]+/, `/app/${stripIdPrefix(id)}`)
}

export function useReplaceRouteWithAppId() {
  const pathname = usePathname()
  return useCallback((id: string) => replaceRouteWithAppId(pathname, id), [pathname])
}
