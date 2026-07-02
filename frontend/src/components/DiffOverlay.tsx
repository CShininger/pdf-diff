import type { MouseEvent } from 'react'
import type { ChangeType } from '../types/compare'

interface DiffOverlayProps {
  bboxes: number[][]
  side: 'template' | 'contract'
  pdfWidth: number
  pdfHeight: number
  active?: boolean
  changeType?: ChangeType
  interactive?: boolean
  onSelect?: () => void
}

const SIDE_COLORS = {
  template: 'rgba(248, 113, 113, 0.45)',
  contract: 'rgba(74, 222, 128, 0.45)',
} as const

const ANCHOR_COLOR = 'rgba(59, 130, 246, 0.35)'
const ANCHOR_STROKE = '#2563eb'

export function DiffOverlay({
  bboxes,
  side,
  pdfWidth,
  pdfHeight,
  active,
  changeType,
  interactive = false,
  onSelect,
}: DiffOverlayProps) {
  if (bboxes.length === 0 || pdfWidth <= 0 || pdfHeight <= 0) return null

  const isAnchor = changeType === 'insert' && side === 'template'
  const handleSelect = interactive
    ? (event: MouseEvent) => {
        event.stopPropagation()
        onSelect?.()
      }
    : undefined

  return (
    <svg
      className={`diff-overlay${interactive ? ' diff-overlay--interactive' : ''}`}
      viewBox={`0 0 ${pdfWidth} ${pdfHeight}`}
      preserveAspectRatio="none"
      aria-hidden={!interactive}
    >
      {bboxes.map((bbox, index) => {
        const [x0, y0, x1, y1] = bbox
        const height = Math.max(y1 - y0, 4)
        const width = Math.max(x1 - x0, isAnchor ? 3 : 1)

        if (isAnchor) {
          return (
            <g key={index}>
              <rect
                x={x0}
                y={y0}
                width={width}
                height={height}
                fill={ANCHOR_COLOR}
                stroke={ANCHOR_STROKE}
                strokeWidth={active ? 2 : 1.5}
                strokeDasharray="3 2"
                onClick={handleSelect}
              />
              {active && (
                <text
                  x={x0 + width + 4}
                  y={y0 + height / 2 + 3}
                  fontSize={10}
                  fill={ANCHOR_STROKE}
                  fontWeight="600"
                >
                  插入点
                </text>
              )}
            </g>
          )
        }

        return (
          <rect
            key={index}
            x={x0}
            y={y0}
            width={width}
            height={height}
            fill={SIDE_COLORS[side]}
            stroke={active ? (side === 'template' ? '#dc2626' : '#16a34a') : 'transparent'}
            strokeWidth={active ? 1.5 : 0}
            onClick={handleSelect}
          />
        )
      })}
    </svg>
  )
}
