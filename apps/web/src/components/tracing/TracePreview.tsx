'use client'

import type { JSONValue } from 'ai'
import { useState } from 'react'
import { formatDistance } from 'date-fns'
import { Check, Copy } from 'lucide-react'

import { Badge } from '@cared/ui/components/badge'
import { Button } from '@cared/ui/components/button'
import { Tabs, TabsList, TabsTrigger } from '@cared/ui/components/tabs'

import type { TraceWithDetails } from '@langfuse/core'
import {
  Tabs as TabsBar,
  TabsContent as TabsBarContent,
  TabsList as TabsBarList,
  TabsTrigger as TabsBarTrigger,
} from '@/components/tabs'
import { IOPreview } from './IOPreview'
import { ItemBadge } from './ItemBadge'
import { PrettyJsonView } from './PrettyJsonView'

export function TracePreview({ trace }: { trace: TraceWithDetails }) {
  const [copied, setCopied] = useState(false)
  const [selectedTab, setSelectedTab] = useState<'preview' | 'scores'>('preview')
  const [currentView, setCurrentView] = useState<'pretty' | 'json'>('pretty')

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }

  const copyTraceId = () => {
    void copyToClipboard(trace.id)
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Trace Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <ItemBadge type="TRACE" showLabel={true} />
            <span className="font-medium">{trace.name}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={copyTraceId}
              className="h-6 px-2 gap-1 text-xs"
            >
              <>
                {copied ? <Check className="h-3! w-3!" /> : <Copy className="h-3! w-3!" />}
                ID
              </>
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">
            {formatDistance(new Date(trace.timestamp), new Date(), { addSuffix: true })}
            <span className="mx-1">•</span>
            {new Date(trace.timestamp).toLocaleString()}
          </div>

          <div className="flex flex-wrap gap-2">
            {trace.latency > 0 && (
              <Badge variant="outline">Latency: {trace.latency.toFixed(2)}s</Badge>
            )}
            {trace.totalCost > 0 && (
              <Badge variant="outline" className="flex items-center gap-1">
                <span>Cost: ${trace.totalCost.toFixed(6)}</span>
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Content Tabs */}
      <TabsBar
        value={selectedTab}
        onValueChange={(value) => setSelectedTab(value as 'preview' | 'scores')}
        className="min-h-0 flex-1 flex flex-col"
      >
        <TabsBarList>
          <TabsBarTrigger value="preview">Preview</TabsBarTrigger>
          <TabsBarTrigger value="scores">Scores</TabsBarTrigger>

          {selectedTab.includes('preview') && (
            <Tabs
              className="ml-auto h-fit"
              value={currentView}
              onValueChange={(value) => {
                setCurrentView(value as 'pretty' | 'json')
              }}
            >
              <TabsList className="h-fit py-0.5">
                <TabsTrigger value="pretty" className="h-fit px-1 text-xs">
                  Formatted
                </TabsTrigger>
                <TabsTrigger value="json" className="h-fit px-1 text-xs">
                  JSON
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </TabsBarList>

        <TabsBarContent value="preview" className="min-h-0 flex-1 flex flex-col">
          <div className="mb-2 flex max-h-full min-h-0 w-full flex-col gap-2 overflow-y-auto">
            {/* Input/Output */}
            <div className="space-y-2">
              {trace.input && trace.output ? (
                <IOPreview
                  input={trace.input as JSONValue}
                  output={trace.output as JSONValue}
                  currentView={currentView}
                />
              ) : null}
            </div>

            {/* Metadata */}
            {trace.metadata ? (
              <PrettyJsonView title="Metadata" json={trace.metadata} currentView={currentView} />
            ) : null}
          </div>
        </TabsBarContent>

        <TabsBarContent value="scores" className="flex-1 mt-4">
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <div className="text-center">
              <div className="text-lg font-medium mb-2">Coming Soon</div>
              <div className="text-sm">This feature is under development</div>
            </div>
          </div>
        </TabsBarContent>
      </TabsBar>
    </div>
  )
}
