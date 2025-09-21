'use client'

import { ChevronDownIcon, ChevronUpIcon, EditIcon, Trash2Icon } from 'lucide-react'
import { zuji } from 'zuji'

import type {
  EmbeddingModelInfo,
  ImageModelInfo,
  LanguageModelInfo,
  ProviderId,
  SpeechModelInfo,
  TranscriptionModelInfo,
} from '@cared/providers'
import { Button } from '@cared/ui/components/button'
import { CircleSpinner } from '@cared/ui/components/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@cared/ui/components/table'
import { cn } from '@cared/ui/lib/utils'

import type { EditableModel } from './model-item-edit'
import { TextTooltip } from '@/components/tooltip'
import { CopyModelId } from './copy-model-id'

export function ModelItemView({
  index,
  providerId: _,
  model,
  isSystem,
  isSearching,
  isSaving,
  isRemoving,
  isMovingUp,
  isMovingDown,
  onEdit,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  copyToClipboard,
}: {
  index: number
  providerId: ProviderId
  model: EditableModel
  isSystem?: boolean
  isSearching: boolean
  isSaving: boolean
  isRemoving: boolean
  isMovingUp: boolean
  isMovingDown: boolean
  onEdit: () => void
  onRemove: () => Promise<void>
  onMoveUp: () => Promise<void>
  onMoveDown: () => Promise<void>
  canMoveUp: boolean
  canMoveDown: boolean
  copyToClipboard: (value: string) => void
}) {
  // Disable all operations when any action is in progress
  const isDisabled = isSaving || isRemoving || isMovingUp || isMovingDown

  return (
    <div className="border rounded-lg p-4 my-2 flex flex-col gap-2">
      <div className="flex justify-between items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="font-medium">{model.model.name || `Model #${index + 1}`}</span>
          {model.isNew && (
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">New</span>
          )}
          {model.model.deprecated && (
            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
              Deprecated
            </span>
          )}
          {model.model.retired && (
            <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">Retired</span>
          )}
          {model.model.chargeable && (
            <TextTooltip
              content={
                <div className="space-y-2">
                  <p>
                    Usage of this model will consume Cared credits when no API keys are configured
                  </p>
                </div>
              }
            >
              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                Chargeable
              </span>
            </TextTooltip>
          )}
        </div>

        {Boolean(model.isSystem) === Boolean(isSystem) && (
          <div className="flex items-center gap-2">
            {/* Sort buttons - positioned at the leftmost side */}
            {!isSearching && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-6"
                  onClick={onMoveUp}
                  disabled={isDisabled || !canMoveUp}
                  title="Move up"
                >
                  {isMovingUp ? (
                    <CircleSpinner className="size-3" />
                  ) : (
                    <ChevronUpIcon className="size-3" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-6"
                  onClick={onMoveDown}
                  disabled={isDisabled || !canMoveDown}
                  title="Move down"
                >
                  {isMovingDown ? (
                    <CircleSpinner className="size-3" />
                  ) : (
                    <ChevronDownIcon className="size-3" />
                  )}
                </Button>
              </div>
            )}

            {/* Edit and Remove buttons */}
            <Button
              variant="outline"
              size="icon"
              className="size-6"
              onClick={onEdit}
              disabled={isDisabled}
            >
              <EditIcon className="size-3" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-6"
              onClick={onRemove}
              disabled={isDisabled}
            >
              {isRemoving ? (
                <CircleSpinner className="size-3" />
              ) : (
                <Trash2Icon className="size-3" />
              )}
            </Button>
          </div>
        )}
      </div>

      <CopyModelId modelId={model.model.id} copyToClipboard={copyToClipboard} />

      {model.model.description && (
        <blockquote className="my-2 border-l-1 pl-4 text-sm text-muted-foreground">
          {model.model.description}
        </blockquote>
      )}

      {/* Render model-specific view based on type */}
      {model.type === 'language' && (
        <LanguageModelItemView model={model.model as LanguageModelInfo} />
      )}
      {model.type === 'image' && <ImageModelItemView model={model.model as ImageModelInfo} />}
      {model.type === 'speech' && <SpeechModelItemView model={model.model as SpeechModelInfo} />}
      {model.type === 'transcription' && (
        <TranscriptionModelItemView model={model.model as TranscriptionModelInfo} />
      )}
      {model.type === 'textEmbedding' && (
        <EmbeddingModelItemView model={model.model as EmbeddingModelInfo} />
      )}
    </div>
  )
}

// Language Model Item View
function LanguageModelItemView({ model }: { model: LanguageModelInfo }) {
  return (
    <div className="text-sm text-muted-foreground space-y-1">
      <div className="flex flex-wrap gap-x-4">
        {model.contextWindow && (
          <div>
            Context length:{' '}
            <span className="font-mono font-medium text-foreground">
              {zuji(model.contextWindow, 'compact-decimal')}
            </span>
          </div>
        )}
        {model.maxOutputTokens && (
          <div>
            Max output length:{' '}
            <span className="font-mono font-medium text-foreground">
              {zuji(model.maxOutputTokens, 'compact-decimal')}
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4">
        {model.inputTokenPrice && (
          <div>
            Input:{' '}
            <span className="font-mono font-medium text-foreground">
              {zuji(model.inputTokenPrice, 'standard-currency-usd')}/M
            </span>{' '}
            tokens
          </div>
        )}
        {model.outputTokenPrice && (
          <div>
            Output:{' '}
            <span className="font-mono font-medium text-foreground">
              {zuji(model.outputTokenPrice, 'standard-currency-usd')}/M
            </span>{' '}
            tokens
          </div>
        )}
      </div>
      {Boolean(
        model.cachedInputTokenPrice ||
          (model.cacheInputTokenPrice && typeof model.cacheInputTokenPrice === 'string'),
      ) && (
        <div className="flex flex-wrap gap-x-4">
          {model.cachedInputTokenPrice && (
            <div>
              {model.cacheInputTokenPrice ? 'Cache read' : 'Cache'}:{' '}
              <span className="font-mono font-medium text-foreground">
                {zuji(model.cachedInputTokenPrice, 'standard-currency-usd')}/M
              </span>{' '}
              tokens
            </div>
          )}
          {model.cacheInputTokenPrice && typeof model.cacheInputTokenPrice === 'string' && (
            <div>
              Cache write:{' '}
              <span className="font-mono font-medium text-foreground">
                {zuji(model.cacheInputTokenPrice, 'standard-currency-usd')}/M
              </span>{' '}
              tokens
            </div>
          )}
        </div>
      )}
      {model.cacheInputTokenPrice && typeof model.cacheInputTokenPrice !== 'string' && (
        <div>
          Cache write:
          <CacheInputTokenPriceTable cacheInputTokenPrice={model.cacheInputTokenPrice} />
        </div>
      )}
    </div>
  )
}

// Image Model Item View
function ImageModelItemView({ model }: { model: ImageModelInfo }) {
  return (
    <div className="text-sm text-muted-foreground space-y-1">
      {Boolean(model.imageInputTokenPrice || model.imageOutputTokenPrice) && (
        <div className="flex flex-wrap gap-x-4">
          {model.imageInputTokenPrice && (
            <div>
              Image input:{' '}
              <span className="font-mono font-medium text-foreground">
                {zuji(model.imageInputTokenPrice, 'standard-currency-usd')}/M
              </span>{' '}
              tokens
            </div>
          )}
          {model.imageOutputTokenPrice && (
            <div>
              Image output:{' '}
              <span className="font-mono font-medium text-foreground">
                {zuji(model.imageOutputTokenPrice, 'standard-currency-usd')}/M
              </span>{' '}
              tokens
            </div>
          )}
        </div>
      )}
      {model.textInputTokenPrice && (
        <div>
          Text input:{' '}
          <span className="font-mono font-medium text-foreground">
            {zuji(model.textInputTokenPrice, 'standard-currency-usd')}/M
          </span>{' '}
          tokens
        </div>
      )}
      {Boolean(model.textCachedInputTokenPrice || model.imageCachedInputTokenPrice) && (
        <div className="flex flex-wrap gap-x-4">
          {model.textCachedInputTokenPrice && (
            <div>
              Text cache:{' '}
              <span className="font-mono font-medium text-foreground">
                {zuji(model.textCachedInputTokenPrice, 'standard-currency-usd')}/M
              </span>{' '}
              tokens
            </div>
          )}
          {model.imageCachedInputTokenPrice && (
            <div>
              Image cache:{' '}
              <span className="font-mono font-medium text-foreground">
                {zuji(model.imageCachedInputTokenPrice, 'standard-currency-usd')}/M
              </span>{' '}
              tokens
            </div>
          )}
        </div>
      )}
      {model.pricePerImage && (
        <div
          className={cn(
            (model.imageInputTokenPrice ||
              model.imageOutputTokenPrice ||
              model.textInputTokenPrice ||
              model.textCachedInputTokenPrice ||
              model.imageCachedInputTokenPrice) &&
              typeof model.pricePerImage !== 'string' &&
              'mt-2',
          )}
        >
          Price per image:{' '}
          {typeof model.pricePerImage === 'string' ? (
            <span className="font-mono font-medium text-foreground">
              {zuji(model.pricePerImage, 'standard-currency-usd')}
            </span>
          ) : (
            <PricePerImageTable pricePerImage={model.pricePerImage} />
          )}
        </div>
      )}
    </div>
  )
}

// Speech Model Item View
function SpeechModelItemView({ model }: { model: SpeechModelInfo }) {
  return (
    <div className="text-sm text-muted-foreground space-y-1">
      <div className="flex flex-wrap gap-x-4">
        {model.maxInputTokens && (
          <div>
            Max input length:{' '}
            <span className="font-mono font-medium text-foreground">
              {zuji(model.maxInputTokens, 'compact-decimal')}
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4">
        {model.textTokenPrice && (
          <div>
            Text tokens:{' '}
            <span className="font-mono font-medium text-foreground">
              {zuji(model.textTokenPrice, 'standard-currency-usd')}/M
            </span>{' '}
            tokens
          </div>
        )}
        {model.audioTokenPrice && (
          <div>
            Audio tokens:{' '}
            <span className="font-mono font-medium text-foreground">
              {zuji(model.audioTokenPrice, 'standard-currency-usd')}/M
            </span>{' '}
            tokens
          </div>
        )}
      </div>
    </div>
  )
}

// Transcription Model Item View
function TranscriptionModelItemView({ model }: { model: TranscriptionModelInfo }) {
  return (
    <div className="text-sm text-muted-foreground space-y-1">
      <div className="flex flex-wrap gap-x-4">
        {model.audioTokenPrice && (
          <div>
            Audio tokens:{' '}
            <span className="font-mono font-medium text-foreground">
              {zuji(model.audioTokenPrice, 'standard-currency-usd')}/M
            </span>{' '}
            tokens
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4">
        {model.textInputTokenPrice && (
          <div>
            Text input:{' '}
            <span className="font-mono font-medium text-foreground">
              {zuji(model.textInputTokenPrice, 'standard-currency-usd')}/M
            </span>{' '}
            tokens
          </div>
        )}
        {model.textOutputTokenPrice && (
          <div>
            Text output:{' '}
            <span className="font-mono font-medium text-foreground">
              {zuji(model.textOutputTokenPrice, 'standard-currency-usd')}/M
            </span>{' '}
            tokens
          </div>
        )}
      </div>
    </div>
  )
}

// Embedding Model Item View
function EmbeddingModelItemView({ model }: { model: EmbeddingModelInfo }) {
  return (
    <div className="text-sm text-muted-foreground space-y-1">
      {(model.tokenPrice || model.dimensions) && (
        <div className="flex flex-wrap gap-x-4">
          {model.tokenPrice && (
            <div>
              Token price:{' '}
              <span className="font-mono font-medium text-foreground">
                {zuji(model.tokenPrice, 'standard-currency-usd')}/M
              </span>{' '}
              tokens
            </div>
          )}
          {model.dimensions && (
            <div>
              Dimensions:{' '}
              {typeof model.dimensions === 'number' ? (
                <span className="font-mono font-medium text-foreground">
                  {zuji(model.dimensions, 'standard-integer')}
                </span>
              ) : (
                model.dimensions.map((dim, index) => (
                  <span
                    key={index}
                    className="font-mono font-medium text-foreground mr-1 last:mr-0"
                  >
                    {zuji(dim, 'standard-integer')}{' '}
                  </span>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Price per image table component that handles both data structures
function PricePerImageTable({
  pricePerImage,
}: {
  pricePerImage: [string, string][] | [string, [string, string][]][]
}) {
  // Check if it's a nested structure (quality -> size -> price)
  const isNested = pricePerImage.some((item) => Array.isArray(item[1]))

  if (isNested) {
    // Handle nested structure: quality -> size -> price
    const nestedPricePerImage = pricePerImage as [string, [string, string][]][]

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Quality</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Price</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {nestedPricePerImage.map(([quality, sizePriceArray]) =>
            sizePriceArray.map(([size, price], index) => (
              <TableRow key={`${quality}-${size}`}>
                <TableCell className={index === 0 ? 'font-medium' : 'text-muted-foreground'}>
                  {index === 0 ? quality : ''}
                </TableCell>
                <TableCell>{size}</TableCell>
                <TableCell className="font-mono font-medium text-foreground">
                  {zuji(price, 'standard-currency-usd')}
                </TableCell>
              </TableRow>
            )),
          )}
        </TableBody>
      </Table>
    )
  } else {
    // Handle simple structure: quality -> price
    const simplePricePerImage = pricePerImage as [string, string][]

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Quality</TableHead>
            <TableHead>Price</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {simplePricePerImage.map(([quality, price]) => (
            <TableRow key={quality}>
              <TableCell>{quality}</TableCell>
              <TableCell className="font-mono font-medium text-foreground">
                {zuji(price, 'standard-currency-usd')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }
}

// Cache input token price table component for TTL to price mapping
function CacheInputTokenPriceTable({
  cacheInputTokenPrice,
}: {
  cacheInputTokenPrice: [string, string][]
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>TTL</TableHead>
          <TableHead>Price</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cacheInputTokenPrice.map(([ttl, price]) => (
          <TableRow key={ttl}>
            <TableCell>{ttl}</TableCell>
            <TableCell>
              <span className="font-mono font-medium text-foreground">
                {zuji(price, 'standard-currency-usd')}/M
              </span>{' '}
              tokens
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
