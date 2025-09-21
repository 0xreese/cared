'use client'

import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { BotIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod/v4'

import { Button } from '@cared/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@cared/ui/components/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@cared/ui/components/form'
import { Input } from '@cared/ui/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@cared/ui/components/select'
import { Textarea } from '@cared/ui/components/textarea'

import { ModelSelect } from '@/components/model-select'
import { orpc } from '@/lib/orpc'
import { stripIdPrefix } from '@/lib/utils'

// Schema for app form values
const createAppSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name cannot exceed 255 characters'),
  description: z.string().max(1000, 'Description cannot exceed 1000 characters').optional(),
  type: z.enum(['single-agent', 'multiple-agents']),
  languageModel: z.string().min(1, 'Language model is required'),
  embeddingModel: z.string().min(1, 'Embedding model is required'),
  imageModel: z.string().min(1, 'Image model is required'),
})

type CreateAppFormValues = z.infer<typeof createAppSchema>

export function CreateAppDialog({
  workspaceId,
  menu,
  trigger,
  onSuccess,
}: {
  workspaceId: string
  menu?: (props: { trigger: (props: { children: ReactNode }) => ReactNode }) => ReactNode
  trigger?: ReactNode
  onSuccess?: () => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const queryClient = useQueryClient()

  // Get models data for selection
  const { data: modelsData } = useSuspenseQuery(orpc.model.listProvidersModels.queryOptions())

  // Get default models data
  const { data: defaultModelsData } = useSuspenseQuery(orpc.model.listDefaultModels.queryOptions())

  // Process model data with memoization to improve performance
  const { languageModelItems, embeddingModelItems, imageModelItems } = useMemo(() => {
    // Transform model data structure to match the required group[] type
    const processModelsToGroups = (models: any[] | undefined) => {
      if (!models) return []

      // Convert each provider into a group object
      return models.map((provider) => ({
        label: provider.name,
        items: provider.models.map((model: { name: string; id: string }) => ({
          label: model.name,
          value: model.id,
        })),
      }))
    }

    // Process different types of model data
    const languageModelItems = processModelsToGroups(modelsData.models.language)
    const embeddingModelItems = processModelsToGroups(modelsData.models.textEmbedding)
    const imageModelItems = processModelsToGroups(modelsData.models.image)

    return {
      languageModelItems,
      embeddingModelItems,
      imageModelItems,
    }
  }, [modelsData.models])

  // Compute default model values with memoization
  const defaultValues = useMemo(() => {
    // Find the first available model value from the processed groups
    const getFirstModelValue = (
      groups: { label: string; items: { label: string; value: string }[] }[],
    ) => {
      for (const group of groups) {
        if (group.items.length > 0) {
          return group.items[0]!.value
        }
      }
      return ''
    }

    // Get first available model from each type
    const firstLanguageModel = getFirstModelValue(languageModelItems)
    const firstEmbeddingModel = getFirstModelValue(embeddingModelItems)
    const firstImageModel = getFirstModelValue(imageModelItems)

    // Use API-provided default models or fallback to first available models
    const defaultLanguageModel =
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      defaultModelsData.defaultModels.app.languageModel || firstLanguageModel
    const defaultEmbeddingModel =
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      defaultModelsData.defaultModels.app.embeddingModel || firstEmbeddingModel
    const defaultImageModel =
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      defaultModelsData.defaultModels.app.imageModel || firstImageModel

    return {
      name: '',
      description: '',
      type: 'single-agent' as const,
      languageModel: defaultLanguageModel,
      embeddingModel: defaultEmbeddingModel,
      imageModel: defaultImageModel,
    }
  }, [
    defaultModelsData.defaultModels,
    languageModelItems,
    embeddingModelItems,
    imageModelItems,
  ])

  // Set up form with validation
  const form = useForm<CreateAppFormValues>({
    resolver: zodResolver(createAppSchema),
    defaultValues,
  })

  // Create app mutation
  const createAppMutation = useMutation(
    orpc.app.create.mutationOptions({
      onSuccess: (data) => {
        toast.success(`App "${data.app.name}" created successfully`)
        setOpen(false)
        void queryClient.invalidateQueries(orpc.app.list.queryOptions())

        // Call onSuccess callback if provided, otherwise navigate to the new app page
        if (onSuccess) {
          onSuccess()
        } else {
          router.push(`/app/${stripIdPrefix(data.app.id)}`)
        }
      },
      onError: (error) => {
        console.error('Failed to create app:', error)
        toast.error(`Failed to create app: ${error.message}`)
      },
    }),
  )

  // Handle form submission
  async function onSubmit(values: CreateAppFormValues) {
    // Trim name and description and update form values
    const trimmedName = values.name.trim()
    const trimmedDescription = values.description?.trim() ?? ''

    // Update form with trimmed values
    form.setValue('name', trimmedName)
    form.setValue('description', trimmedDescription)

    // Validate form after updating values
    return await form.trigger().then((isValid) => {
      if (!isValid) return

      // Continue with form submission if valid
      // Create metadata object, only including models that differ from defaults
      const metadata: Record<string, any> = {
        description: trimmedDescription,
      }

      // Only add models to metadata when they differ from default models
      if (values.languageModel !== defaultModelsData.defaultModels.app.languageModel) {
        metadata.languageModel = values.languageModel
      }

      if (values.embeddingModel !== defaultModelsData.defaultModels.app.embeddingModel) {
        metadata.embeddingModel = values.embeddingModel
      }

      if (values.imageModel !== defaultModelsData.defaultModels.app.imageModel) {
        metadata.imageModel = values.imageModel
      }

      createAppMutation.mutate({
        workspaceId,
        name: trimmedName,
        metadata,
      })
    })
  }

  const Menu = menu

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {Menu && (
        <Menu trigger={({ children }) => <DialogTrigger asChild>{children}</DialogTrigger>} />
      )}
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Create New App</DialogTitle>
          <DialogDescription>
            Create a new AI agent application. Configure basic settings here and add more details
            later.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1">
            <div className="overflow-y-auto pr-1 flex-1">
              <div className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-12 mx-2">
                {/* Left column - Basic Information */}
                <div className="space-y-4">
                  <div className="mb-2 text-sm font-medium">Basic Information</div>

                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input placeholder="My AI App" {...field} />
                        </FormControl>
                        <FormDescription>The name of your application</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="A brief description of what your app does..."
                            className="h-20"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Explain the purpose and functionality of your app
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>App Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select app type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="single-agent">
                              <div className="flex items-center">
                                <BotIcon className="h-4 w-4 mr-2" />
                                <span>Single Agent</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="multiple-agents">
                              <div className="flex items-center">
                                <div className="relative mr-2">
                                  <BotIcon className="h-4 w-4" />
                                  <BotIcon
                                    className="h-4 w-4 absolute -top-1 -right-1 text-muted-foreground"
                                    style={{ transform: 'scale(0.7)' }}
                                  />
                                </div>
                                <span>Multiple Agents</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Choose whether your app will use a single agent or multiple agents
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Right column - Model Selection */}
                <div className="space-y-4">
                  <div className="mb-2 text-sm font-medium">Model Selection</div>

                  <ModelSelect
                    name="languageModel"
                    label="Language Model"
                    description="The language model for text generation"
                    groups={languageModelItems}
                    control={form.control}
                  />

                  <ModelSelect
                    name="embeddingModel"
                    label="Embedding Model"
                    description="Used for embedding memories and knowledge"
                    groups={embeddingModelItems}
                    control={form.control}
                  />

                  <ModelSelect
                    name="imageModel"
                    label="Image Model"
                    description="Used for image generation and understanding"
                    groups={imageModelItems}
                    control={form.control}
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="flex-shrink-0 pt-6 mt-4 border-t">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
                disabled={createAppMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createAppMutation.isPending || !form.formState.isValid}
                className="ml-2"
              >
                {createAppMutation.isPending ? 'Creating...' : 'Create App'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
