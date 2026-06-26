interface DiffOverlayProps {
  bboxes: number[][]
  side: 'template' | 'contract'
  pdfWidth: number
  pdfHeight: number
  active?: boolean
}

const SIDE_COLORS = {
  template: 'rgba(248, 113, 113, 0.45)',
  contract: 'rgba(74, 222, 128, 0.45)',
} as const

export function DiffOverlay({ bboxes, side, pdfWidth, pdfHeight, active }: DiffOverlayProps) {
  if (bboxes.length === 0 || pdfWidth <= 0 || pdfHeight <= 0) return null

  return (
    <svg
      className="diff-overlay"
      viewBox={`0 0 ${pdfWidth} ${pdfHeight}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {bboxes.map((bbox, index) => {
        const [x0, y0, x1, y1] = bbox
        const height = Math.max(y1 - y0, 4)
        return (
          <rect
            key={index}
            x={x0}
            y={y0}
            width={x1 - x0}
            height={height}
            fill={SIDE_COLORS[side]}
            stroke={active ? (side === 'template' ? '#dc2626' : '#16a34a') : 'transparent'}
            strokeWidth={active ? 1.5 : 0}
          />
        )
      })}
    </svg>
  )
}
