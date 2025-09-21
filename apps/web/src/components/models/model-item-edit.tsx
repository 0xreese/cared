'use client'

import React, { useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import hash from 'stable-hash'

import type { UpdateModelArgs } from '@cared/api'
import type { ModelFullId, ModelType, ProviderId } from '@cared/providers'
import { updateModelArgsSchema } from '@cared/api/types'
import { modelFullId, splitModelFullId } from '@cared/providers'
import { Button } from '@cared/ui/components/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@cared/ui/components/form'
import { Label } from '@cared/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@cared/ui/components/select'
import { CircleSpinner } from '@cared/ui/components/spinner'
import { Switch } from '@cared/ui/components/switch'

import { Input } from '@/components/input'
import { NumberInput, OptionalNumberInput } from '@/components/number-input'
import { OptionalPriceInput } from '@/components/price-input'

export type EditableModel = {
  id: ModelFullId
  isSystem?: boolean
  isEditing: boolean
  isNew?: boolean
} & UpdateModelArgs

// Helper function to get default values for a model type
export function getDefaultValuesForModelType(
  providerId: ProviderId,
  type: ModelType,
): UpdateModelArgs {
  const baseDefaults = {
    id: `${providerId}:` as ModelFullId,
    name: '',
    description: '',
    deprecated: false,
    retired: false,
    chargeable: false,
  }

  switch (type) {
    case 'language':
      return {
        type,
        model: {
          ...baseDefaults,
          contextWindow: undefined,
          maxOutputTokens: undefined,
          inputTokenPrice: undefined,
          cachedInputTokenPrice: undefined,
          cacheInputTokenPrice: undefined,
          outputTokenPrice: undefined,
        },
      }
    case 'image':
      return {
        type,
        model: {
          ...baseDefaults,
          imageInputTokenPrice: undefined,
          imageCachedInputTokenPrice: undefined,
          imageOutputTokenPrice: undefined,
          textInputTokenPrice: undefined,
          textCachedInputTokenPrice: undefined,
          pricePerImage: undefined,
        },
      }
    case 'speech':
      return {
        type,
        model: {
          ...baseDefaults,
          maxInputTokens: undefined,
          textTokenPrice: undefined,
          audioTokenPrice: undefined,
        },
      }
    case 'transcription':
      return {
        type,
        model: {
          ...baseDefaults,
          audioTokenPrice: undefined,
          textInputTokenPrice: undefined,
          textOutputTokenPrice: undefined,
        },
      }
    case 'textEmbedding':
      return {
        type,
        model: {
          ...baseDefaults,
          tokenPrice: undefined,
          dimensions: undefined,
        },
      }
  }
}

export function ModelItemEdit({
  index: _,
  providerId,
  model,
  isSystem,
  isSaving,
  isRemoving,
  isSorting,
  onCancel,
  onSave,
  onRemove,
  cache,
  setCache,
}: {
  index: number
  providerId: ProviderId
  model: EditableModel
  isSystem?: boolean
  isSaving: boolean
  isRemoving: boolean
  isSorting: boolean
  onCancel: () => void
  onSave: (formData: UpdateModelArgs) => Promise<void>
  onRemove: () => Promise<void>
  cache?: any
  setCache: (cacheFn: (prevCache?: any) => any) => void
}) {
  const modelCache = !cache
    ? {
        type: model.type,
        model: model.model,
      }
    : cache

  const form = useForm<UpdateModelArgs>({
    resolver: zodResolver(updateModelArgsSchema),
    defaultValues: modelCache,
  })

  useEffect(() => {
    const { unsubscribe } = form.watch((value) => {
      value = structuredClone(value)
      setCache((cache) => (hash(value) !== hash(cache) ? value : cache))
    })
    return () => unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])

  const handleSave = async () => {
    if (await form.trigger()) {
      const formData = form.getValues()
      await onSave(formData)
    } else {
      console.error(form.formState.errors)
    }
  }

  const handleCancel = () => {
    onCancel()
  }

  // Disable form inputs when saving, removing, or sorting
  const isFormDisabled = isSaving || isRemoving || isSorting

  return (
    <div className="border rounded-lg p-4 my-2 bg-muted/50">
      <Form {...form}>
        <form className="space-y-4">
          <h4 className="font-medium">{modelCache.model.name || 'New Model'}</h4>

          {/* Common fields for all model types */}

          <FormField
            control={form.control}
            name="model.id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Model ID</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Enter model ID (e.g., gpt-4, claude-3-sonnet)"
                    {...field}
                    value={splitModelFullId(field.value).modelId}
                    onChange={(modelId) => field.onChange(modelFullId(providerId, modelId))}
                    disabled={isFormDisabled}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="model.name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="Enter model name" {...field} disabled={isFormDisabled} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="model.description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Enter model description"
                    {...field}
                    disabled={isFormDisabled}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex flex-wrap items-center gap-4">
            <FormField
              control={form.control}
              name="model.deprecated"
              render={({ field }) => (
                <FormItem className="flex items-center space-x-2">
                  <FormLabel>Deprecated</FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isFormDisabled}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="model.retired"
              render={({ field }) => (
                <FormItem className="flex items-center space-x-2">
                  <FormLabel>Retired</FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isFormDisabled}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {isSystem && (
              <FormField
                control={form.control}
                name="model.chargeable"
                render={({ field }) => (
                  <FormItem className="flex items-center space-x-2">
                    <FormLabel>Chargeable</FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isFormDisabled}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
          </div>

          {/* Render model-specific edit form based on type */}
          {model.type === 'language' && (
            <LanguageModelItemEdit
              form={form}
              isFormDisabled={isFormDisabled}
              originalCacheInputTokenPrice={modelCache.model.cacheInputTokenPrice}
            />
          )}
          {model.type === 'image' && (
            <ImageModelItemEdit
              form={form}
              isFormDisabled={isFormDisabled}
              originalPricePerImage={modelCache.model.pricePerImage}
            />
          )}
          {model.type === 'speech' && (
            <SpeechModelItemEdit form={form} isFormDisabled={isFormDisabled} />
          )}
          {model.type === 'transcription' && (
            <TranscriptionModelItemEdit form={form} isFormDisabled={isFormDisabled} />
          )}
          {model.type === 'textEmbedding' && (
            <EmbeddingModelItemEdit
              form={form}
              isFormDisabled={isFormDisabled}
              originalDimensions={modelCache.model.dimensions}
            />
          )}

          <div className="flex items-center justify-end pt-4">
            <div className="flex items-center gap-2">
              {!model.isNew && (
                <Button
                  variant="outline"
                  size="icon"
                  className="size-6"
                  onClick={handleCancel}
                  disabled={isFormDisabled}
                >
                  <XIcon className="size-3" />
                </Button>
              )}
              <Button
                size="icon"
                className="size-6"
                onClick={(e) => {
                  e.preventDefault()
                  void handleSave()
                }}
                disabled={isFormDisabled}
              >
                {isSaving ? <CircleSpinner className="size-3" /> : <CheckIcon className="size-3" />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-6"
                onClick={onRemove}
                disabled={isFormDisabled}
              >
                {isRemoving ? (
                  <CircleSpinner className="size-3" />
                ) : (
                  <Trash2Icon className="size-3" />
                )}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  )
}

// Language Model Item Edit
function LanguageModelItemEdit({
  form,
  isFormDisabled,
  originalCacheInputTokenPrice,
}: {
  form: any
  isFormDisabled: boolean
  originalCacheInputTokenPrice?: string | [string, string][]
}) {
  const currentCacheInputTokenPrice = form.watch('model.cacheInputTokenPrice')

  type CachePriceStructureType = 'simple' | 'ttl-price'

  // Determine the current structure type
  const getCachePriceStructureType = (
    value?: string | [string, string][],
  ): CachePriceStructureType => {
    if (!value) return 'simple'
    if (typeof value === 'string') return 'simple'
    return 'ttl-price'
  }

  const [currentCacheStructureType, setCurrentCacheStructureType] = useState(
    getCachePriceStructureType(originalCacheInputTokenPrice),
  )
  useEffect(() => {
    setCurrentCacheStructureType(getCachePriceStructureType(originalCacheInputTokenPrice))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalCacheInputTokenPrice])

  // Handle structure type change
  const handleCacheStructureTypeChange = (newType: CachePriceStructureType) => {
    setCurrentCacheStructureType(newType)

    const originalStructureType = getCachePriceStructureType(originalCacheInputTokenPrice)
    switch (newType) {
      case 'simple':
        form.setValue(
          'model.cacheInputTokenPrice',
          originalStructureType === 'simple' ? originalCacheInputTokenPrice : undefined,
        )
        break
      case 'ttl-price':
        form.setValue(
          'model.cacheInputTokenPrice',
          originalStructureType === 'ttl-price' ? originalCacheInputTokenPrice : [],
        )
        break
    }
  }

  const cacheInputTokenPriceError = form.formState.errors?.model?.cacheInputTokenPrice

  return (
    <>
      <FormField
        control={form.control}
        name="model.contextWindow"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Context Length (Optional)</FormLabel>
            <FormControl>
              <OptionalNumberInput
                placeholder="Enter context window size"
                value={field.value}
                onChange={field.onChange}
                min={1}
                step={1}
                disabled={isFormDisabled}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="model.maxOutputTokens"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Max Output Length (Optional)</FormLabel>
            <FormControl>
              <OptionalNumberInput
                placeholder="Enter max output tokens"
                value={field.value}
                onChange={field.onChange}
                min={1}
                step={1}
                disabled={isFormDisabled}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="model.inputTokenPrice"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Input Price $/M Tokens (Optional)</FormLabel>
            <FormControl>
              <OptionalPriceInput
                placeholder="Enter input token price (e.g., 0.015)"
                {...field}
                disabled={isFormDisabled}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="model.outputTokenPrice"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Output Price $/M Tokens (Optional)</FormLabel>
            <FormControl>
              <OptionalPriceInput
                placeholder="Enter output token price (e.g., 0.06)"
                {...field}
                disabled={isFormDisabled}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="model.cachedInputTokenPrice"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Cache Read Price $/M Tokens (Optional)</FormLabel>
            <FormControl>
              <OptionalPriceInput
                placeholder="Enter cached input token price (e.g., 0.0003)"
                {...field}
                disabled={isFormDisabled}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Cache Input Token Price Structure Selection */}
      <div className="space-y-2">
        <Label htmlFor="model.cacheInputTokenPrice">Cache Write Price $/M Tokens (Optional)</Label>
        <Select value={currentCacheStructureType} onValueChange={handleCacheStructureTypeChange}>
          <SelectTrigger disabled={isFormDisabled}>
            <SelectValue placeholder="Select price structure type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="simple">Price</SelectItem>
            <SelectItem value="ttl-price">TTL × Price</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Dynamic Price Fields based on selected structure */}
      {currentCacheStructureType === 'simple' ? (
        <FormField
          control={form.control}
          name="model.cacheInputTokenPrice"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <OptionalPriceInput
                  placeholder="Enter cache input token price (e.g., 0.003)"
                  {...field}
                  disabled={isFormDisabled}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : (
        <div className="space-y-4">
          {cacheInputTokenPriceError && (
            <p className="text-[0.8rem] font-medium text-destructive">Invalid price</p>
          )}

          <div className="flex items-center justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const current = form.getValues('model.cacheInputTokenPrice') || []
                const newValue = [...current, ['', '']]
                form.setValue('model.cacheInputTokenPrice', newValue)
              }}
              disabled={isFormDisabled}
            >
              Add TTL
            </Button>
          </div>

          {/* eslint-disable-next-line @typescript-eslint/no-unnecessary-condition */}
          {((currentCacheInputTokenPrice as [string, string][]) || []).map(
            ([ttl, price], index) => (
              <div
                key={`${ttl}-${index}`}
                className="flex items-center gap-2 p-3 border rounded-lg"
              >
                <Input
                  placeholder="TTL (e.g., 1h, 24h, 7d)"
                  value={ttl}
                  onChange={(value) => {
                    const current = form.getValues('model.cacheInputTokenPrice') || []
                    const newValue = [...current]
                    newValue[index] = [value, price]
                    form.setValue('model.cacheInputTokenPrice', newValue)
                  }}
                  onBlur={() => undefined}
                  disabled={isFormDisabled}
                  className="flex-1"
                />
                <Input
                  placeholder="Price (e.g., 0.003)"
                  value={price}
                  onChange={(value) => {
                    const current = form.getValues('model.cacheInputTokenPrice') || []
                    const newValue = [...current]
                    newValue[index] = [ttl, value]
                    form.setValue('model.cacheInputTokenPrice', newValue)
                  }}
                  onBlur={() => undefined}
                  disabled={isFormDisabled}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const current = form.getValues('model.cacheInputTokenPrice') || []
                    const newValue = current.filter((_: any, i: number) => i !== index)
                    form.setValue('model.cacheInputTokenPrice', newValue)
                  }}
                  disabled={isFormDisabled}
                  className="shrink-0"
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            ),
          )}

          {!currentCacheInputTokenPrice ||
          (currentCacheInputTokenPrice as [string, string][]).length === 0 ? (
            <div className="text-sm text-muted-foreground text-center">
              Click "Add TTL" to add items.
            </div>
          ) : null}
        </div>
      )}
    </>
  )
}

// Image Model Item Edit
function ImageModelItemEdit({
  form,
  isFormDisabled,
  originalPricePerImage,
}: {
  form: any
  isFormDisabled: boolean
  originalPricePerImage?: string | [string, string][] | [string, [string, string][]][]
}) {
  const currentPricePerImage = form.watch('model.pricePerImage')

  type PriceStructureType = 'simple' | 'quality-price' | 'quality-size-price'

  // Determine the current structure type
  const getPriceStructureType = (
    value?: string | [string, string][] | [string, [string, string][]][],
  ): PriceStructureType => {
    if (!value) return 'simple'
    if (typeof value === 'string') return 'simple'
    if (Array.isArray(value) && value.length > 0 && Array.isArray(value[0]?.[1])) {
      return 'quality-size-price'
    }
    return 'quality-price'
  }

  const [currentPriceStructureType, setCurrentPriceStructureType] = useState(
    getPriceStructureType(originalPricePerImage),
  )
  useEffect(() => {
    setCurrentPriceStructureType(getPriceStructureType(originalPricePerImage))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalPricePerImage])

  // Handle structure type change
  const handleStructureTypeChange = (newType: PriceStructureType) => {
    setCurrentPriceStructureType(newType)

    const originalStructureType = getPriceStructureType(originalPricePerImage)
    switch (newType) {
      case 'simple':
        form.setValue(
          'model.pricePerImage',
          originalStructureType === 'simple' ? originalPricePerImage : undefined,
        )
        break
      case 'quality-price':
        form.setValue(
          'model.pricePerImage',
          originalStructureType === 'quality-price' ? originalPricePerImage : [],
        )
        break
      case 'quality-size-price':
        form.setValue(
          'model.pricePerImage',
          originalStructureType === 'quality-size-price' ? originalPricePerImage : [],
        )
        break
    }
  }

  // Helper functions for managing dynamic fields
  const addQualityPriceItem = () => {
    const current = form.getValues('model.pricePerImage') || []
    const newValue = [...current, ['', '']]
    form.setValue('model.pricePerImage', newValue)
  }

  const removeQualityPriceItem = (index: number) => {
    const current = form.getValues('model.pricePerImage') || []
    const newValue = current.filter((_: any, i: number) => i !== index)
    form.setValue('model.pricePerImage', newValue)
  }

  const updateQualityPriceItem = (index: number, newQuality: string, price: string) => {
    const current = form.getValues('model.pricePerImage') || []
    const newValue = [...current]
    newValue[index] = [newQuality, price]
    form.setValue('model.pricePerImage', newValue)
  }

  const addQualitySizePriceItem = () => {
    const current = form.getValues('model.pricePerImage') || []
    const newValue = [...current, ['', [['', '']]]]
    form.setValue('model.pricePerImage', newValue)
  }

  const removeQualitySizePriceItem = (index: number) => {
    const current = form.getValues('model.pricePerImage') || []
    const newValue = current.filter((_: any, i: number) => i !== index)
    form.setValue('model.pricePerImage', newValue)
  }

  const addSizeToQuality = (qualityIndex: number) => {
    const current = form.getValues('model.pricePerImage') || []
    const quality = current[qualityIndex]
    if (quality && Array.isArray(quality[1])) {
      const sizes = quality[1] as [string, string][]
      const newSizes = [...sizes, ['', '']]
      const newValue = [...current]
      newValue[qualityIndex] = [quality[0], newSizes]
      form.setValue('model.pricePerImage', newValue)
    }
  }

  const removeSizeFromQuality = (qualityIndex: number, sizeIndex: number) => {
    const current = form.getValues('model.pricePerImage') || []
    const quality = current[qualityIndex]
    if (quality && Array.isArray(quality[1])) {
      const sizes = quality[1] as [string, string][]
      const newSizes = sizes.filter((_: any, i: number) => i !== sizeIndex)
      const newValue = [...current]
      newValue[qualityIndex] = [quality[0], newSizes]
      form.setValue('model.pricePerImage', newValue)
    }
  }

  const updateQualitySizePriceItem = (
    qualityIndex: number,
    newQuality: string,
    sizeIndex: number,
    newSize: string,
    price: string,
  ) => {
    const current = form.getValues('model.pricePerImage') || []
    const quality = current[qualityIndex]
    if (quality && Array.isArray(quality[1])) {
      const sizes = quality[1] as [string, string][]
      const newSizes = [...sizes]
      newSizes[sizeIndex] = [newSize, price]
      const newValue = [...current]
      newValue[qualityIndex] = [newQuality, newSizes]
      form.setValue('model.pricePerImage', newValue)
    }
  }

  const pricePerImageError = form.formState.errors?.model?.pricePerImage

  return (
    <>
      <FormField
        control={form.control}
        name="model.imageInputTokenPrice"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Image Input Price $/M Tokens (Optional)</FormLabel>
            <FormControl>
              <OptionalPriceInput
                placeholder="Enter image input token price"
                {...field}
                disabled={isFormDisabled}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="model.imageCachedInputTokenPrice"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Image Cache Price $/M Tokens (Optional)</FormLabel>
            <FormControl>
              <OptionalPriceInput
                placeholder="Enter image cached input token price"
                {...field}
                disabled={isFormDisabled}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="model.imageOutputTokenPrice"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Image Output Price $/M Tokens (Optional)</FormLabel>
            <FormControl>
              <OptionalPriceInput
                placeholder="Enter image output token price"
                {...field}
                disabled={isFormDisabled}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="model.textInputTokenPrice"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Text Input Price $/M Tokens (Optional)</FormLabel>
            <FormControl>
              <OptionalPriceInput
                placeholder="Enter text input token price"
                {...field}
                disabled={isFormDisabled}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="model.textCachedInputTokenPrice"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Text Cache Price $/M Tokens (Optional)</FormLabel>
            <FormControl>
              <OptionalPriceInput
                placeholder="Enter text cached input token price"
                {...field}
                disabled={isFormDisabled}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Price Per Image Structure Selection */}
      <div className="space-y-2">
        <Label htmlFor="model.pricePerImage">Price $ Per Image (Optional)</Label>
        <Select value={currentPriceStructureType} onValueChange={handleStructureTypeChange}>
          <SelectTrigger disabled={isFormDisabled}>
            <SelectValue placeholder="Select price structure type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="simple">Price</SelectItem>
            <SelectItem value="quality-price">Quality × Price</SelectItem>
            <SelectItem value="quality-size-price">Quality × Size × Price</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Dynamic Price Fields based on selected structure */}
      {currentPriceStructureType === 'simple' ? (
        <FormField
          control={form.control}
          name="model.pricePerImage"
          render={({ field: _field }) => (
            <FormItem>
              <FormControl>
                <OptionalPriceInput
                  placeholder="Enter price per image (e.g., 0.04)"
                  {..._field}
                  disabled={isFormDisabled}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : (
        pricePerImageError && (
          <p className="text-[0.8rem] font-medium text-destructive">Invalid price</p>
        )
      )}

      {currentPriceStructureType === 'quality-price' && (
        <div className="space-y-4">
          <div className="flex items-center justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addQualityPriceItem}
              disabled={isFormDisabled}
            >
              Add Quality
            </Button>
          </div>

          {/* eslint-disable-next-line @typescript-eslint/no-unnecessary-condition */}
          {((currentPricePerImage as [string, string][]) || []).map(([quality, price], index) => (
            <div
              key={`${quality}-${index}`}
              className="flex items-center gap-2 p-3 border rounded-lg"
            >
              <Input
                placeholder="Quality (e.g., Standard, HD)"
                value={quality}
                onChange={(value) => updateQualityPriceItem(index, value, price)}
                onBlur={() => undefined}
                disabled={isFormDisabled}
                className="flex-1"
              />
              <Input
                placeholder="Price (e.g., 0.04)"
                value={price}
                onChange={(value) => updateQualityPriceItem(index, quality, value)}
                onBlur={() => undefined}
                disabled={isFormDisabled}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => removeQualityPriceItem(index)}
                disabled={isFormDisabled}
                className="shrink-0"
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          ))}

          {!currentPricePerImage || (currentPricePerImage as [string, string][]).length === 0 ? (
            <div className="text-sm text-muted-foreground text-center">
              Click "Add Quality" to add items.
            </div>
          ) : null}
        </div>
      )}

      {currentPriceStructureType === 'quality-size-price' && (
        <div className="space-y-4">
          <div className="flex items-center justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addQualitySizePriceItem}
              disabled={isFormDisabled}
            >
              Add Quality
            </Button>
          </div>

          {/* eslint-disable-next-line @typescript-eslint/no-unnecessary-condition */}
          {((currentPricePerImage as [string, [string, string][]][]) || []).map(
            ([quality, sizePriceArray], qualityIndex) => (
              <div key={`${quality}-${qualityIndex}`} className="space-y-3 p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Quality (e.g., Standard, HD)"
                    value={quality}
                    onChange={(newQuality) => {
                      const current = form.getValues('model.pricePerImage') || []
                      const newValue = [...current]
                      newValue[qualityIndex] = [newQuality, sizePriceArray]
                      form.setValue('model.pricePerImage', newValue)
                    }}
                    onBlur={() => undefined}
                    disabled={isFormDisabled}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addSizeToQuality(qualityIndex)}
                    disabled={isFormDisabled}
                  >
                    Add Size
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => removeQualitySizePriceItem(qualityIndex)}
                    disabled={isFormDisabled}
                    className="shrink-0"
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>

                {sizePriceArray.map(([size, price], sizeIndex) => (
                  <div
                    key={`${quality}-${size}-${sizeIndex}`}
                    className="flex items-center gap-2 ml-4"
                  >
                    <Input
                      placeholder="Size (e.g., 1024x1024)"
                      value={size}
                      onChange={(newSize) =>
                        updateQualitySizePriceItem(qualityIndex, quality, sizeIndex, newSize, price)
                      }
                      onBlur={() => undefined}
                      disabled={isFormDisabled}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Price (e.g., 0.04)"
                      value={price}
                      onChange={(newPrice) =>
                        updateQualitySizePriceItem(qualityIndex, quality, sizeIndex, size, newPrice)
                      }
                      onBlur={() => undefined}
                      disabled={isFormDisabled}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => removeSizeFromQuality(qualityIndex, sizeIndex)}
                      disabled={isFormDisabled}
                      className="shrink-0"
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ),
          )}

          {!currentPricePerImage ||
          (currentPricePerImage as [string, [string, string][]][]).length === 0 ? (
            <div className="text-sm text-muted-foreground text-center">
              Click "Add Quality" to add items.
            </div>
          ) : null}
        </div>
      )}
    </>
  )
}

// Speech Model Item Edit
function SpeechModelItemEdit({ form, isFormDisabled }: { form: any; isFormDisabled: boolean }) {
  return (
    <>
      <FormField
        control={form.control}
        name="model.maxInputTokens"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Max Input Tokens (Optional)</FormLabel>
            <FormControl>
              <OptionalNumberInput
                placeholder="Enter max input tokens"
                value={field.value}
                onChange={field.onChange}
                min={1}
                step={1}
                disabled={isFormDisabled}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="model.textTokenPrice"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Text Price $/M Tokens (Optional)</FormLabel>
            <FormControl>
              <OptionalPriceInput
                placeholder="Enter text token price"
                {...field}
                disabled={isFormDisabled}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="model.audioTokenPrice"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Audio Price $/M Tokens (Optional)</FormLabel>
            <FormControl>
              <OptionalPriceInput
                placeholder="Enter audio token price"
                {...field}
                disabled={isFormDisabled}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  )
}

// Transcription Model Item Edit
function TranscriptionModelItemEdit({
  form,
  isFormDisabled,
}: {
  form: any
  isFormDisabled: boolean
}) {
  return (
    <>
      <FormField
        control={form.control}
        name="model.audioTokenPrice"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Audio Price $/M Tokens (Optional)</FormLabel>
            <FormControl>
              <OptionalPriceInput
                placeholder="Enter audio token price"
                {...field}
                disabled={isFormDisabled}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="model.textInputTokenPrice"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Text Input Price $/M Tokens (Optional)</FormLabel>
            <FormControl>
              <OptionalPriceInput
                placeholder="Enter text input token price"
                {...field}
                disabled={isFormDisabled}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="model.textOutputTokenPrice"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Text Output Price $/M Tokens (Optional)</FormLabel>
            <FormControl>
              <OptionalPriceInput
                placeholder="Enter text output token price"
                {...field}
                disabled={isFormDisabled}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  )
}

// Embedding Model Item Edit
function EmbeddingModelItemEdit({
  form,
  isFormDisabled,
  originalDimensions,
}: {
  form: any
  isFormDisabled: boolean
  originalDimensions?: number | number[]
}) {
  const currentDimensions = form.watch('model.dimensions')

  type DimensionsStructureType = 'single' | 'multiple'

  // Determine the current structure type
  const getDimensionsStructureType = (value?: number | number[]): DimensionsStructureType => {
    if (!value) return 'single'
    if (Array.isArray(value)) return 'multiple'
    return 'single'
  }

  const [currentDimensionsStructureType, setCurrentDimensionsStructureType] = useState(
    getDimensionsStructureType(originalDimensions),
  )

  useEffect(() => {
    setCurrentDimensionsStructureType(getDimensionsStructureType(originalDimensions))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalDimensions])

  // Handle structure type change
  const handleDimensionsStructureTypeChange = (newType: DimensionsStructureType) => {
    setCurrentDimensionsStructureType(newType)

    const originalStructureType = getDimensionsStructureType(originalDimensions)
    switch (newType) {
      case 'single':
        form.setValue(
          'model.dimensions',
          originalStructureType === 'single' ? originalDimensions : undefined,
        )
        break
      case 'multiple':
        form.setValue(
          'model.dimensions',
          originalStructureType === 'multiple' ? originalDimensions : [],
        )
        break
    }
  }

  const dimensionsError = form.formState.errors?.model?.dimensions

  return (
    <>
      <FormField
        control={form.control}
        name="model.tokenPrice"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Price $/M Tokens (Optional)</FormLabel>
            <FormControl>
              <OptionalPriceInput
                placeholder="Enter token price (e.g., 0.01)"
                {...field}
                disabled={isFormDisabled}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Dimensions Structure Selection */}
      <div className="space-y-2">
        <Label htmlFor="model.dimensions">Dimensions (Optional)</Label>
        <Select
          value={currentDimensionsStructureType}
          onValueChange={handleDimensionsStructureTypeChange}
        >
          <SelectTrigger disabled={isFormDisabled}>
            <SelectValue placeholder="Select dimensions structure type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="single">Single Dimension</SelectItem>
            <SelectItem value="multiple">Multiple Dimensions</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Dynamic Dimensions Fields based on selected structure */}
      {currentDimensionsStructureType === 'single' ? (
        <FormField
          control={form.control}
          name="model.dimensions"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <OptionalNumberInput
                  placeholder="Enter dimensions (e.g., 1536)"
                  value={field.value}
                  onChange={field.onChange}
                  min={1}
                  step={1}
                  disabled={isFormDisabled}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : (
        <div className="space-y-4">
          {dimensionsError && (
            <p className="text-[0.8rem] font-medium text-destructive">Invalid dimensions</p>
          )}

          <div className="flex items-center justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const current = form.getValues('model.dimensions') || []
                const newValue = [...current, 0]
                form.setValue('model.dimensions', newValue)
              }}
              disabled={isFormDisabled}
            >
              Add Dimension
            </Button>
          </div>

          {/* eslint-disable-next-line @typescript-eslint/no-unnecessary-condition */}
          {((currentDimensions as number[]) || []).map((dimension, index) => (
            <div
              key={`dimension-${index}`}
              className="flex items-center gap-2 p-3 border rounded-lg"
            >
              <NumberInput
                placeholder="Enter dimension (e.g., 1536)"
                value={dimension}
                onChange={(value) => {
                  const current = form.getValues('model.dimensions') || []
                  const newValue = [...current]
                  newValue[index] = value
                  form.setValue('model.dimensions', newValue)
                }}
                min={1}
                step={1}
                disabled={isFormDisabled}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => {
                  const current = form.getValues('model.dimensions') || []
                  const newValue = current.filter((_: number | undefined, i: number) => i !== index)
                  form.setValue('model.dimensions', newValue)
                }}
                disabled={isFormDisabled}
                className="shrink-0"
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          ))}

          {!currentDimensions || (currentDimensions as (number | undefined)[]).length === 0 ? (
            <div className="text-sm text-muted-foreground text-center">
              Click "Add Dimension" to add items.
            </div>
          ) : null}
        </div>
      )}
    </>
  )
}
