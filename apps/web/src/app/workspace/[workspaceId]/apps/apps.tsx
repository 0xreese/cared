'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { useSuspenseQuery } from '@tanstack/react-query'
import { BotIcon, FilterIcon, PlusIcon, SearchIcon, TagIcon, XIcon } from 'lucide-react'

import { Badge } from '@cared/ui/components/badge'
import { Button } from '@cared/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@cared/ui/components/card'
import { Input } from '@cared/ui/components/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@cared/ui/components/select'
import { Separator } from '@cared/ui/components/separator'

import { CreateAppDialog } from '@/components/create-app-dialog'
import { RemoteImage } from '@/components/image'
import { useApps } from '@/hooks/use-app'
import { orpc } from '@/lib/orpc'
import { addIdPrefix, stripIdPrefix } from '@/lib/utils'
import defaultLogo from '@/public/images/agent.png'

// Constant for all categories filter value
const ALL_CATEGORIES = 'all'

export function Apps() {
  const router = useRouter()

  const { workspaceId: workspaceIdNoPrefix } = useParams<{ workspaceId: string }>()
  const workspaceId = addIdPrefix(workspaceIdNoPrefix, 'workspace')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>(ALL_CATEGORIES)

  const apps = useApps({
    workspaceId,
  })

  // Get all categories
  const { data: categoriesData } = useSuspenseQuery(orpc.app.listCategories.queryOptions())

  // Search and filter functionality
  const filteredApps = apps.filter((appData) => {
    const matchesSearch =
      searchTerm === '' ||
      appData.app.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      appData.app.metadata.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      appData.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesCategory =
      selectedCategory === ALL_CATEGORIES ||
      appData.categories.some((category) => category.id === selectedCategory)

    return matchesSearch && matchesCategory
  })

  return (
    <div className="container mx-auto py-6 px-4 sm:px-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-12">
        <div>
          <h1 className="text-3xl font-bold tracking-tight truncate">Apps</h1>
          <p className="text-muted-foreground mt-2">Manage and deploy your AI agent applications</p>
        </div>
        <CreateAppDialog
          workspaceId={workspaceId}
          trigger={
            <Button>
              <PlusIcon />
              New App
            </Button>
          }
        />
      </div>

      {/* Search and filter section */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search apps..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-64">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger>
              <div className="flex items-center">
                <FilterIcon className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filter by category">
                  {selectedCategory === ALL_CATEGORIES ? 'All categories' : selectedCategory}
                </SelectValue>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={ALL_CATEGORIES} className="flex items-center">
                  <div className="flex items-center">
                    <XIcon className="mr-2 h-4 w-4" />
                    All categories
                  </div>
                </SelectItem>
                <Separator className="my-1" />
                <SelectLabel className="text-muted-foreground">Categories</SelectLabel>
                {categoriesData.categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filteredApps.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-8 text-center">
            <BotIcon className="h-12 w-12 text-muted-foreground mb-4" />
            {apps.length === 0 ? (
              <>
                <h3 className="text-lg font-medium">No Apps</h3>
                <p className="text-sm text-muted-foreground mt-2 mb-6">
                  You haven't created any apps yet. Click the button below to get started.
                </p>
                <CreateAppDialog
                  workspaceId={workspaceId}
                  trigger={
                    <Button>
                      <PlusIcon />
                      New App
                    </Button>
                  }
                />
              </>
            ) : (
              <>
                <h3 className="text-lg font-medium">No Matching Apps</h3>
                <p className="text-sm text-muted-foreground mt-2 mb-6">
                  Try using different search criteria or clear your filters.
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchTerm('')
                    setSelectedCategory(ALL_CATEGORIES)
                  }}
                >
                  Clear Filters
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {filteredApps.map((appData) => (
            <Card
              key={appData.app.id}
              className="relative overflow-hidden cursor-pointer"
              onClick={() => {
                router.push(`/app/${stripIdPrefix(appData.app.id)}`)
              }}
            >
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start gap-2">
                  <CardTitle className="truncate">{appData.app.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    <div className="relative h-16 w-16 rounded-md overflow-hidden">
                      {appData.app.metadata.imageUrl ? (
                        <RemoteImage
                          src={appData.app.metadata.imageUrl}
                          alt={appData.app.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <Image src={defaultLogo} alt="App Logo" fill className="object-cover" />
                      )}
                    </div>
                  </div>
                </div>
                {appData.app.metadata.description && (
                  <CardDescription className="line-clamp-2">
                    {appData.app.metadata.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="pb-3">
                <div className="flex items-center text-xs text-muted-foreground">
                  <span className="font-medium mr-2">Type:</span>
                  <span>
                    {appData.app.type === 'single-agent' ? 'Single Agent' : 'Multiple Agents'}
                  </span>
                </div>
                <div className="flex items-center text-xs text-muted-foreground mt-1">
                  <span className="font-medium mr-2">Text:</span>
                  <span className="truncate">{appData.app.metadata.languageModel}</span>
                </div>
              </CardContent>
              {(appData.categories.length > 0 || appData.tags.length > 0) && (
                <>
                  <Separator />
                  <CardFooter className="pt-3">
                    <div className="flex flex-wrap gap-2">
                      {appData.categories.map((category) => (
                        <Badge
                          key={category.id}
                          variant="secondary"
                          className="cursor-pointer"
                          onClick={() => setSelectedCategory(category.id)}
                        >
                          {category.name}
                        </Badge>
                      ))}
                      {appData.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="flex items-center gap-1 cursor-pointer"
                          onClick={() => setSearchTerm(tag)}
                        >
                          <TagIcon className="h-3 w-3" />
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </CardFooter>
                </>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
