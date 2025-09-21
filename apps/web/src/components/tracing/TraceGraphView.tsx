'use client'

import { useCallback, useMemo } from 'react'
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'

import type { Edge, Node } from '@xyflow/react'

import '@xyflow/react/dist/style.css'

import { cn } from '@cared/ui/lib/utils'

import type { ObservationsView, TraceWithDetails } from '@langfuse/core'

// Discriminated union for graph nodes
type GraphNode =
  | ({ nodeType: 'trace' } & TraceWithDetails & { children: GraphNode[] })
  | ({ nodeType: 'observation' } & ObservationsView & { children: GraphNode[] })

interface TraceGraphViewProps {
  trace: TraceWithDetails
  observations: ObservationsView[]
  selected?: string
  onSelect?: (id: string) => void
}

export function TraceGraphView({ trace, observations, selected, onSelect }: TraceGraphViewProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  // Build graph data from trace and observations
  const graphData = useMemo(() => {
    const nodes: Node[] = []
    const edges: Edge[] = []

    // Convert trace to GraphNode
    const traceNode: GraphNode = {
      nodeType: 'trace',
      ...trace,
      children: [],
    }

    // Build unified tree structure following TraceTree logic
    const buildUnifiedTree = (): GraphNode => {
      // Create a map of observations by ID for efficient lookup
      const observationMap = new Map<string, ObservationsView>()
      observations.forEach((obs) => {
        observationMap.set(obs.id, obs)
      })

      // Find root observations (those whose parentObservationId doesn't exist in the observations list)
      const rootObservations = observations.filter(
        (obs) => !obs.parentObservationId || !observationMap.has(obs.parentObservationId),
      )

      // Build tree structure recursively
      const buildTree = (parentId: string): GraphNode[] => {
        return observations
          .filter((obs) => obs.parentObservationId === parentId)
          .map((obs) => ({
            nodeType: 'observation' as const,
            ...obs,
            children: buildTree(obs.id),
          }))
      }

      // Add children to trace node
      traceNode.children = rootObservations.map((obs) => ({
        nodeType: 'observation' as const,
        ...obs,
        children: buildTree(obs.id),
      }))

      // Sort all children recursively by start time if available, otherwise by id
      const sortChildren = (nodes: GraphNode[]): GraphNode[] => {
        return nodes
          .sort((a, b) => {
            // Only sort observations, not trace nodes
            if (a.nodeType === 'trace' || b.nodeType === 'trace') {
              return a.id.localeCompare(b.id)
            }

            // Sort by start time if both have start times
            if (a.startTime && b.startTime) {
              return new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
            }
            // If only one has start time, prioritize the one with start time
            if (a.startTime && !b.startTime) return -1
            if (!a.startTime && b.startTime) return 1
            // If neither has start time, sort by id as fallback
            return a.id.localeCompare(b.id)
          })
          .map((node) => ({
            ...node,
            children: sortChildren(node.children),
          }))
      }

      // Sort the trace node's children
      traceNode.children = sortChildren(traceNode.children)

      return traceNode
    }

    // Add nodes recursively
    const addNodes = (graphNode: GraphNode, parentId: string | null, level = 0) => {
      const nodeId = graphNode.id
      const x = level * 200
      const y = nodes.length * 100

      // Extract display properties based on node type
      const displayName =
        graphNode.nodeType === 'trace'
          ? (graphNode.name ?? 'Untitled Trace')
          : (graphNode.name ?? 'Untitled Observation')

      const displayType = graphNode.nodeType === 'trace' ? 'TRACE' : graphNode.type

      const displayLevel = graphNode.nodeType === 'trace' ? 'DEFAULT' : graphNode.level

      nodes.push({
        id: nodeId,
        type: graphNode.nodeType === 'trace' ? 'trace' : 'observation',
        position: { x, y },
        data: {
          label: displayName,
          type: displayType,
          level: displayLevel,
          isSelected: selected === nodeId,
          nodeType: graphNode.nodeType,
        },
      })

      // Add edge from parent if not root
      if (parentId) {
        edges.push({
          id: `${parentId}-${nodeId}`,
          source: parentId,
          target: nodeId,
          sourceHandle: 'right',
          targetHandle: 'left',
          type: 'default',
          markerEnd: {
            type: 'arrowclosed',
            width: 20,
            height: 20,
          },
        })
      }

      // Add children
      graphNode.children.forEach((child) => {
        addNodes(child, nodeId, level + 1)
      })
    }

    const unifiedTree = buildUnifiedTree()
    addNodes(unifiedTree, null)

    return { nodes, edges }
  }, [trace, observations, selected])

  // Update nodes and edges when graph data changes
  useMemo(() => {
    setNodes(graphData.nodes)
    setEdges(graphData.edges)
  }, [graphData, setNodes, setEdges])

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onSelect?.(node.id)
    },
    [onSelect],
  )

  const getNodeTypeColor = (type: string) => {
    switch (type) {
      case 'GENERATION':
        return 'bg-purple-100 border-purple-300 text-purple-800'
      case 'SPAN':
        return 'bg-blue-100 border-blue-300 text-blue-800'
      case 'EVENT':
        return 'bg-green-100 border-green-300 text-green-800'
      case 'TOOL':
        return 'bg-orange-100 border-orange-300 text-orange-800'
      case 'RETRIEVER':
        return 'bg-teal-100 border-teal-300 text-teal-800'
      case 'EMBEDDING':
        return 'bg-yellow-100 border-yellow-300 text-yellow-800'
      case 'TRACE':
        return 'bg-gray-100 border-gray-300 text-gray-800'
      default:
        return 'bg-gray-100 border-gray-300 text-gray-800'
    }
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'ERROR':
        return 'border-red-500'
      case 'WARNING':
        return 'border-yellow-500'
      default:
        return 'border-gray-400'
    }
  }

  interface NodeData {
    label: string
    type: string
    level: string
    isSelected: boolean
    nodeType: 'trace' | 'observation'
  }

  const nodeTypes = {
    // Trace node type - larger, more prominent styling
    trace: ({ data }: { data: NodeData }) => (
      <div
        className={cn(
          'px-2 py-1 rounded-sm border-1 text-sm font-bold min-w-[140px] text-center relative',
          'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-400 text-blue-900',
          getLevelColor(data.level),
          data.isSelected && 'border-2',
        )}
      >
        <Handle type="source" position={Position.Right} id="right" style={{ background: '#555' }} />
        <Handle type="target" position={Position.Left} id="left" style={{ background: '#555' }} />
        {data.label}
      </div>
    ),
    // Observation node type - smaller, more subtle styling
    observation: ({ data }: { data: NodeData }) => (
      <div
        className={cn(
          'px-2 py-1 rounded-sm border-1 text-xs font-medium min-w-[120px] text-center relative',
          getNodeTypeColor(data.type),
          getLevelColor(data.level),
          data.isSelected && 'border-2',
        )}
      >
        <Handle type="source" position={Position.Right} id="right" style={{ background: '#555' }} />
        <Handle type="target" position={Position.Left} id="left" style={{ background: '#555' }} />
        {data.label}
      </div>
    ),
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        No observations to display
      </div>
    )
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
      >
        <Background />
        <Controls showInteractive={false} position="top-right" />
      </ReactFlow>
    </div>
  )
}
