'use client'

import { useEffect } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

import { Button } from '@cared/ui/components/button'
import { InputCommandShortcut } from '@cared/ui/components/input-command'
import { Tooltip, TooltipContent, TooltipTrigger } from '@cared/ui/components/tooltip'

import type { TraceWithDetails } from '@langfuse/core'

interface TraceNavigationProps {
  traces: TraceWithDetails[]
  currentTraceId: string
  onNavigate: (traceId: string) => void
}

export function TraceNavigation({ traces, currentTraceId, onNavigate }: TraceNavigationProps) {
  const currentIndex = traces.findIndex((trace) => trace.id === currentTraceId)
  const previousTrace = currentIndex > 0 ? traces[currentIndex - 1] : undefined
  const nextTrace = currentIndex < traces.length - 1 ? traces[currentIndex + 1] : undefined

  // Keyboard shortcuts for buttons k and j
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger keyboard shortcuts if the user is typing in an input
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement && event.target.getAttribute('role') === 'textbox')
      ) {
        return
      }
      // Don't trigger shortcuts if modifier keys are pressed (e.g., Cmd+K for universal search)
      if (event.metaKey || event.ctrlKey) {
        return
      }

      if (event.key === 'k' && previousTrace) {
        onNavigate(previousTrace.id)
      } else if (event.key === 'j' && nextTrace) {
        onNavigate(nextTrace.id)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [previousTrace, nextTrace, onNavigate])

  if (traces.length <= 1) {
    return null
  }

  return (
    <div className="flex flex-row gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            type="button"
            className="p-2"
            disabled={!previousTrace}
            onClick={() => {
              if (previousTrace) {
                onNavigate(previousTrace.id)
              }
            }}
          >
            <ChevronUp className="h-4 w-4" />
            <span className="h-4 w-4 rounded-sm bg-primary/80 text-xs text-primary-foreground shadow-sm">
              K
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <span>Navigate up</span>
          <InputCommandShortcut className="ml-2 rounded-sm bg-muted p-1 px-2">
            k
          </InputCommandShortcut>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            type="button"
            className="p-2"
            disabled={!nextTrace}
            onClick={() => {
              if (nextTrace) {
                onNavigate(nextTrace.id)
              }
            }}
          >
            <ChevronDown className="h-4 w-4" />
            <span className="h-4 w-4 rounded-sm bg-primary/80 text-xs text-primary-foreground shadow-sm">
              J
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <span>Navigate down</span>
          <InputCommandShortcut className="ml-2 rounded-sm bg-muted p-1 px-2">
            j
          </InputCommandShortcut>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
