import type { JSX } from 'react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react'

import { Button } from '@cared/ui/components/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@cared/ui/components/table'
import { cn } from '@cared/ui/lib/utils'

import type { ColumnDef, ExpandedState, Row } from '@tanstack/react-table'
import { copyTextToClipboard } from '@/lib/clipboard'

const MAX_STRING_LENGTH_FOR_LINK_DETECTION = 1500
const MAX_CELL_DISPLAY_CHARS = 2000
const SMALL_ARRAY_THRESHOLD = 5
const ARRAY_PREVIEW_ITEMS = 3
const OBJECT_PREVIEW_KEYS = 2
const MONO_TEXT_CLASSES = 'font-mono text-xs break-words'
const PREVIEW_TEXT_CLASSES = 'italic text-gray-500 dark:text-gray-400'

function renderStringWithLinks(text: string): React.ReactNode {
  if (text.length >= MAX_STRING_LENGTH_FOR_LINK_DETECTION) {
    return text
  }

  const urlRegex = /https?:\/\/[^\s/$.?#].[^\s]*/i
  const localUrlRegex = new RegExp(urlRegex.source, 'gi')
  const parts = text.split(localUrlRegex)
  const matches = text.match(localUrlRegex) || []

  const result: React.ReactNode[] = []
  let matchIndex = 0

  for (const item of parts) {
    if (item) {
      result.push(item)
    }

    if (matchIndex < matches.length) {
      const url = matches[matchIndex]
      result.push(
        <a
          key={`link-${matchIndex}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:opacity-80"
          onClick={(e) => e.stopPropagation()} // no row expansion when clicking links
        >
          {url}
        </a>,
      )
      matchIndex++
    }
  }

  return result
}

export function getValueType(value: unknown): JsonTableRow['type'] {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return 'array'
  return typeof value as JsonTableRow['type']
}

function renderArrayValue(arr: unknown[]): JSX.Element {
  if (arr.length === 0) {
    return <span className={PREVIEW_TEXT_CLASSES}>empty list</span>
  }

  if (arr.length <= SMALL_ARRAY_THRESHOLD) {
    // Show inline values for small arrays
    const displayItems = arr
      .map((item) => {
        const itemType = getValueType(item)
        if (itemType === 'string') return `"${String(item)}"`
        if (itemType === 'object' && item !== null) {
          const obj = item as Record<string, unknown>
          const keys = Object.keys(obj)
          if (keys.length === 0) return '{}'
          if (keys.length <= OBJECT_PREVIEW_KEYS) {
            const keyPreview = keys.map((k) => `"${k}": ...`).join(', ')
            return `{${keyPreview}}`
          } else {
            return `{"${keys[0]}": ...}`
          }
        }
        if (itemType === 'array') return '...'
        return String(item)
      })
      .join(', ')
    return <span className={PREVIEW_TEXT_CLASSES}>[{displayItems}]</span>
  } else {
    // Show truncated values for large arrays
    const preview = arr
      .slice(0, ARRAY_PREVIEW_ITEMS)
      .map((item) => {
        const itemType = getValueType(item)
        if (itemType === 'string') return `"${String(item)}"`
        if (itemType === 'object' || itemType === 'array') return '...'
        return String(item)
      })
      .join(', ')
    return (
      <span className={PREVIEW_TEXT_CLASSES}>
        [{preview}, ...{arr.length - ARRAY_PREVIEW_ITEMS} more]
      </span>
    )
  }
}

function renderObjectValue(obj: Record<string, unknown>): JSX.Element {
  const keys = Object.keys(obj)
  if (keys.length === 0) {
    return <span className={PREVIEW_TEXT_CLASSES}>empty object</span>
  }
  return <span className={PREVIEW_TEXT_CLASSES}>{keys.length} items</span>
}

export function getValueStringLength(value: unknown): number {
  if (typeof value === 'string') {
    return value.length
  }
  try {
    return JSON.stringify(value).length
  } catch {
    return String(value).length
  }
}

function getTruncatedValue(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value
  }

  const truncated = value.substring(0, maxChars)
  const lastSpaceIndex = truncated.lastIndexOf(' ')

  // Try to truncate at word boundary if possible
  if (lastSpaceIndex > maxChars * 0.8) {
    return truncated.substring(0, lastSpaceIndex) + '...'
  }

  return truncated + '...'
}

function getCopyValue(value: unknown): string {
  if (typeof value === 'string') {
    return value // Return string without quotes
  }
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return String(value)
  }
}

export const ValueCell = memo(
  ({
    row,
    expandedCells,
    toggleCellExpansion,
  }: {
    row: Row<JsonTableRow>
    expandedCells: Set<string>
    toggleCellExpansion: (cellId: string) => void
  }) => {
    const { value, type } = row.original
    const cellId = `${row.id}-value`
    const isCellExpanded = expandedCells.has(cellId)
    const [showCopySuccess, setShowCopySuccess] = useState(false)

    const handleCopy = async (e: React.MouseEvent) => {
      e.stopPropagation()
      const copyValue = getCopyValue(value)

      try {
        await copyTextToClipboard(copyValue)
        setShowCopySuccess(true)
        setTimeout(() => setShowCopySuccess(false), 1500)
      } catch {
        // Copy failed silently
      }
    }

    const getDisplayValue = () => {
      switch (type) {
        case 'string': {
          const stringValue = String(value)
          const needsTruncation = stringValue.length > MAX_CELL_DISPLAY_CHARS
          const displayValue =
            needsTruncation && !isCellExpanded
              ? getTruncatedValue(stringValue, MAX_CELL_DISPLAY_CHARS)
              : stringValue

          return {
            content: (
              <span className="whitespace-pre-line text-green-600 dark:text-green-400">
                &quot;{renderStringWithLinks(displayValue)}&quot;
              </span>
            ),
            needsTruncation,
          }
        }
        case 'number':
          return {
            content: <span className="text-blue-600 dark:text-blue-400">{String(value)}</span>,
            needsTruncation: false,
          }
        case 'boolean':
          return {
            content: <span className="text-orange-600 dark:text-orange-400">{String(value)}</span>,
            needsTruncation: false,
          }
        case 'null':
          return {
            content: <span className="italic text-gray-500 dark:text-gray-400">null</span>,
            needsTruncation: false,
          }
        case 'undefined':
          return {
            content: <span className="text-gray-500 dark:text-gray-400">undefined</span>,
            needsTruncation: false,
          }
        case 'array': {
          const arrayValue = value as unknown[]
          // Arrays always show previews, never truncate
          return {
            content: renderArrayValue(arrayValue),
            needsTruncation: false,
          }
        }
        case 'object': {
          const objectValue = value as Record<string, unknown>
          // Objects always show previews, never truncate
          return {
            content: renderObjectValue(objectValue),
            needsTruncation: false,
          }
        }
        default: {
          const stringValue = String(value)
          const needsTruncation = stringValue.length > MAX_CELL_DISPLAY_CHARS
          const displayValue =
            needsTruncation && !isCellExpanded
              ? getTruncatedValue(stringValue, MAX_CELL_DISPLAY_CHARS)
              : stringValue

          return {
            content: <span className="text-gray-600 dark:text-gray-400">{displayValue}</span>,
            needsTruncation,
          }
        }
      }
    }

    const { content, needsTruncation } = getDisplayValue()

    return (
      <div className={`${MONO_TEXT_CLASSES} group relative max-w-full`}>
        {content}
        {needsTruncation && !row.original.hasChildren && (
          <div
            className="inline cursor-pointer opacity-50"
            onClick={(e) => {
              e.stopPropagation()
              toggleCellExpansion(cellId)
            }}
          >
            {isCellExpanded
              ? '\n...collapse'
              : `\n...expand (${getValueStringLength(value) - MAX_CELL_DISPLAY_CHARS} more characters)`}
          </div>
        )}

        {/* Copy button - appears on hover */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-0 top-1/2 h-5 w-5 -translate-y-1/2 border bg-background/80 p-0.5 opacity-0 shadow-sm transition-opacity duration-200 hover:bg-background group-hover:opacity-100"
          onClick={handleCopy}
          title="Copy value"
          aria-label="Copy cell value"
        >
          {showCopySuccess ? (
            <Check className="h-2.5 w-2.5 text-green-600" />
          ) : (
            <Copy className="h-2.5 w-2.5" />
          )}
        </Button>
      </div>
    )
  },
)

ValueCell.displayName = 'ValueCell'

export interface JsonTableRow {
  id: string
  key: string
  value: unknown
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null' | 'undefined'
  hasChildren: boolean
  level: number
  subRows?: JsonTableRow[]
  // For lazy loading of sub-row table data
  rawChildData?: unknown
  childrenGenerated?: boolean
}

const INDENTATION_PER_LEVEL = 16
const INDENTATION_BASE = 8
const BUTTON_WIDTH = 16
const MARGIN_LEFT_1 = 4
const CELL_PADDING_X = 8 // px-2

export function PrettyJsonTable({
  data,
  expandAllRef,
  onExpandStateChange,
  noBorder = false,
  expanded,
  onExpandedChange,
  onLazyLoadChildren,
  onForceUpdate,
  smartDefaultsLevel,
  expandedCells,
  toggleCellExpansion,
}: {
  data: JsonTableRow[]
  expandAllRef?: React.RefObject<(() => void) | null>
  onExpandStateChange?: (allExpanded: boolean) => void
  noBorder?: boolean
  expanded: ExpandedState
  onExpandedChange: (updater: ExpandedState | ((prev: ExpandedState) => ExpandedState)) => void
  onLazyLoadChildren?: (rowId: string) => void
  onForceUpdate?: () => void
  smartDefaultsLevel?: number | null
  expandedCells: Set<string>
  toggleCellExpansion: (cellId: string) => void
}) {
  const columns: ColumnDef<JsonTableRow, unknown>[] = [
    {
      accessorKey: 'key',
      header: 'Path',
      size: 35,
      cell: ({ row }) => {
        // we need to calculate the indentation here for a good line break
        // because of the padding, we don't know when to break the line otherwise
        const indentationWidth = row.original.level * INDENTATION_PER_LEVEL + INDENTATION_BASE
        const buttonWidth = row.original.hasChildren ? BUTTON_WIDTH : 0
        const availableTextWidth = `calc(100% - ${indentationWidth + buttonWidth + CELL_PADDING_X + MARGIN_LEFT_1}px)`

        return (
          <div className="px-1 flex items-start break-words">
            <div
              className="flex flex-shrink-0 items-center justify-end"
              style={{ width: `${indentationWidth}px` }}
            >
              {row.original.hasChildren && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRowExpansion(row, onLazyLoadChildren, expandedCells, toggleCellExpansion)
                  }}
                  className="h-4 w-4 p-0"
                >
                  {row.getIsExpanded() ? (
                    <ChevronDown className="h-3! w-3!" />
                  ) : (
                    <ChevronRight className="h-3! w-3!" />
                  )}
                </Button>
              )}
            </div>
            <span
              className={`ml-1 ${MONO_TEXT_CLASSES} font-medium`}
              style={{ maxWidth: availableTextWidth }}
            >
              {row.original.key}
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: 'value',
      header: 'Value',
      size: 65,
      cell: ({ row }) => (
        <ValueCell
          row={row}
          expandedCells={expandedCells}
          toggleCellExpansion={toggleCellExpansion}
        />
      ),
    },
  ]

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSubRows: (row) => row.subRows,
    getRowId: (row) => convertRowIdToKeyPath(row.id),
    state: {
      expanded,
    },
    onExpandedChange: onExpandedChange,
    enableColumnResizing: false,
    autoResetExpanded: false,
  })

  const allRowsExpanded = useMemo(() => {
    const allRows = table.getRowModel().flatRows
    const expandableRows = allRows.filter((row) => row.original.hasChildren)
    return expandableRows.length > 0 && expandableRows.every((row) => row.getIsExpanded())
    // expanded is required for the collapse button to work
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, expanded])

  // Notify parent of expand state changes
  useEffect(() => {
    onExpandStateChange?.(allRowsExpanded)
  }, [allRowsExpanded, onExpandStateChange])

  const expandRowsWithLazyLoading = useCallback(
    (rowFilter: (rows: Row<JsonTableRow>[]) => Row<JsonTableRow>[], shouldCollapse = false) => {
      if (shouldCollapse) {
        onExpandedChange({})
        return
      }

      const allRows = table.getRowModel().flatRows
      const expandableRows = allRows.filter((row) => row.original.hasChildren)
      const targetRows = rowFilter(expandableRows)

      const rowsNeedingParsing = targetRows.filter(
        (row) => row.original.rawChildData && !row.original.childrenGenerated,
      )

      if (rowsNeedingParsing.length > 0) {
        const generatedRowIds: string[] = []

        rowsNeedingParsing.forEach((row) => {
          generateAllChildrenRecursively(row.original, (rowId) => {
            generatedRowIds.push(rowId)
          })
        })

        if (generatedRowIds.length > 0) {
          onLazyLoadChildren?.(generatedRowIds.join(','))
        }

        onForceUpdate?.()
        // setTimeout re-renders table once new data is available
        setTimeout(() => {
          const newExpanded: ExpandedState = {}
          const updatedAllRows = table.getRowModel().flatRows
          const updatedExpandableRows = updatedAllRows.filter((row) => row.original.hasChildren)
          const updatedTargetRows = rowFilter(updatedExpandableRows)

          updatedTargetRows.forEach((row) => {
            newExpanded[row.id] = true
          })

          onExpandedChange(newExpanded)
        }, 0)
      } else {
        // No lazy loading needed, just set expansion state
        const newExpanded: ExpandedState = {}
        targetRows.forEach((row) => {
          newExpanded[row.id] = true
        })
        onExpandedChange(newExpanded)
      }
    },
    [table, onExpandedChange, onLazyLoadChildren, onForceUpdate],
  )

  const handleToggleExpandAll = useCallback(() => {
    expandRowsWithLazyLoading(
      (expandableRows) => expandableRows, // All expandable rows
      allRowsExpanded, // Should collapse if already expanded
    )
  }, [allRowsExpanded, expandRowsWithLazyLoading])

  useEffect(() => {
    if (expandAllRef) {
      expandAllRef.current = handleToggleExpandAll
    }
  }, [expandAllRef, handleToggleExpandAll])

  useEffect(() => {
    if (smartDefaultsLevel != null && smartDefaultsLevel > 0) {
      expandRowsWithLazyLoading((expandableRows) =>
        expandableRows.filter((row) => row.depth < smartDefaultsLevel),
      )
    }
  }, [smartDefaultsLevel, expandRowsWithLazyLoading])

  return (
    <div className={cn('w-full', !noBorder && 'rounded-sm border')}>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className="h-8 bg-transparent px-2 py-1"
                  style={{ width: `${header.column.columnDef.size}%` }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              onClick={() =>
                handleRowExpansion(row, onLazyLoadChildren, expandedCells, toggleCellExpansion)
              }
              className={
                row.original.hasChildren ||
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                (!row.original.hasChildren &&
                  row.original.type !== 'array' &&
                  row.original.type !== 'object' &&
                  getValueStringLength(row.original.value) > MAX_CELL_DISPLAY_CHARS)
                  ? 'cursor-pointer'
                  : ''
              }
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className="whitespace-normal px-2 py-1"
                  style={{ width: `${cell.column.columnDef.size}%` }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function handleRowExpansion(
  row: Row<JsonTableRow>,
  onLazyLoadChildren?: (rowId: string) => void,
  expandedCells?: Set<string>,
  toggleCellExpansion?: (cellId: string) => void,
) {
  // row expansion takes precedence over cell expansion
  if (row.original.hasChildren) {
    const originalRow = row.original
    if (originalRow.rawChildData && !originalRow.childrenGenerated) {
      onLazyLoadChildren?.(originalRow.id)
    }
    row.toggleExpanded()
    return
  }

  // does the row have children, then expand row
  const cellId = `${row.id}-value`
  const { value } = row.original
  const valueStringLength = getValueStringLength(value)
  const needsCellExpansion = valueStringLength > MAX_CELL_DISPLAY_CHARS

  if (needsCellExpansion && expandedCells && toggleCellExpansion) {
    toggleCellExpansion(cellId)
  }
}

export function convertRowIdToKeyPath(rowId: string): string {
  return rowId.replace(/-/g, '.')
}

function generateAllChildrenRecursively(
  row: JsonTableRow,
  onRowGenerated?: (rowId: string) => void,
): void {
  if (row.rawChildData && !row.childrenGenerated) {
    const children = generateChildRows(row)
    row.subRows = children
    row.childrenGenerated = true

    // this row now has generated children for state preservation (expand all)
    onRowGenerated?.(row.id)

    children.forEach((child) => {
      generateAllChildrenRecursively(child, onRowGenerated)
    })
  }
}

export function generateChildRows(row: JsonTableRow): JsonTableRow[] {
  if (!row.rawChildData || row.childrenGenerated) {
    return row.subRows || []
  }

  const children = transformJsonToTableData(
    row.rawChildData,
    row.key,
    row.level + 1,
    row.id,
    false, // Don't use lazy loading for children
  )

  return children
}

export function transformJsonToTableData(
  json: unknown,
  parentKey = '',
  level = 0,
  parentId = '',
  lazy = false,
): JsonTableRow[] {
  const rows: JsonTableRow[] = []

  if (typeof json !== 'object' || json === null) {
    return [
      {
        id: parentId || '0',
        key: parentKey || 'root',
        value: json,
        type: getValueType(json),
        hasChildren: false,
        level,
      },
    ]
  }

  const entries = Array.isArray(json)
    ? json.map((item, index) => [index.toString(), item])
    : Object.entries(json)

  entries.forEach(([key, value]) => {
    const id = parentId ? `${parentId}-${key}` : key
    const valueType = getValueType(value)
    const childrenExist = hasChildren(value, valueType)

    const row: JsonTableRow = {
      id,
      key,
      value,
      type: valueType,
      hasChildren: childrenExist,
      level,
      childrenGenerated: false,
    }

    if (childrenExist) {
      if (lazy && level === 0) {
        // For lazy loading, store raw data instead of processing children
        row.rawChildData = value
        row.subRows = [] // Empty initially
      } else {
        // Normal processing or nested children
        const children = transformJsonToTableData(value, key, level + 1, id, lazy)
        row.subRows = children
        row.childrenGenerated = true
      }
    }

    rows.push(row)
  })

  return rows
}

export function hasChildren(value: unknown, valueType: JsonTableRow['type']): boolean {
  return (
    (valueType === 'object' && Object.keys(value as Record<string, unknown>).length > 0) ||
    (valueType === 'array' && Array.isArray(value) && value.length > 0)
  )
}

export function getRowChildren(row: JsonTableRow): JsonTableRow[] {
  if (row.subRows && row.subRows.length > 0) {
    return row.subRows
  }
  if (row.rawChildData) {
    // Prevent infinite recursion by limiting depth; 25 levels of nesting should make a reasonable assumption
    if (row.level > 25) {
      return []
    }
    return transformJsonToTableData(
      row.rawChildData,
      row.key,
      row.level + 1,
      row.id,
      false, // Don't lazy load for child generation
    )
  }
  return []
}
