import { useEffect, useMemo, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import type { PDFPageProxy } from 'pdfjs-dist'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { DiffOverlay } from './DiffOverlay'
import type { ChangeItem, TemplateAnchorMode } from '../types/compare'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

interface PageMetrics {
  pdfWidth: number
  pdfHeight: number
}

interface PdfViewerProps {
  title: string
  fileUrl: string
  side: 'template' | 'contract'
  changes: ChangeItem[]
  activeChangeId: string | null
  scrollToPage: number | null
  templateAnchorMode?: TemplateAnchorMode
  onChangeSelect?: (changeId: string) => void
}

function shouldShowHighlight(
  change: ChangeItem,
  side: 'template' | 'contract',
  templateAnchorMode: TemplateAnchorMode,
  activeChangeId: string | null,
): boolean {
  // 合同侧删除光标 / 模版侧插入光标：按锚点显示模式
  const isSideAnchor =
    (side === 'contract' && change.type === 'delete') ||
    (side === 'template' && change.type === 'insert')
  if (isSideAnchor) {
    if (templateAnchorMode === 'always') return true
    return change.id === activeChangeId
  }
  return true
}

export function PdfViewer({
  title,
  fileUrl,
  side,
  changes,
  activeChangeId,
  scrollToPage,
  templateAnchorMode = 'always',
  onChangeSelect,
}: PdfViewerProps) {
  const [numPages, setNumPages] = useState(0)
  const [pageWidth, setPageWidth] = useState(480)
  const [pageMetrics, setPageMetrics] = useState<Map<number, PageMetrics>>(new Map())

  useEffect(() => {
    const updateWidth = () => {
      const container = document.querySelector(`.pdf-pane[data-side="${side}"]`)
      if (container) {
        setPageWidth(Math.min(container.clientWidth - 32, 520))
      }
    }
    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [side])

  useEffect(() => {
    if (!activeChangeId && scrollToPage === null) return

    const scrollToTarget = () => {
      if (activeChangeId) {
        const changeEl = document.getElementById(`${side}-change-${activeChangeId}`)
        if (changeEl) {
          changeEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
          return true
        }
      }
      if (scrollToPage !== null) {
        const el = document.getElementById(`${side}-page-${scrollToPage + 1}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          return true
        }
      }
      return false
    }

    if (scrollToTarget()) return

    // 删除/插入锚点可能在选中后才挂载，下一帧再试一次
    const raf = requestAnimationFrame(() => {
      scrollToTarget()
    })
    return () => cancelAnimationFrame(raf)
  }, [scrollToPage, side, activeChangeId])

  const pageChanges = useMemo(() => {
    const map = new Map<number, ChangeItem[]>()
    for (const change of changes) {
      if (change.type === 'equal') continue
      if (
        !shouldShowHighlight(change, side, templateAnchorMode, activeChangeId)
      ) {
        continue
      }
      const info = side === 'template' ? change.template : change.contract
      if (!info) continue
      const list = map.get(info.page) ?? []
      list.push(change)
      map.set(info.page, list)
    }
    return map
  }, [changes, side, templateAnchorMode, activeChangeId])

  const handlePageLoad = (pageNumber: number, page: PDFPageProxy) => {
    const viewport = page.getViewport({ scale: 1 })
    setPageMetrics((prev) => {
      const next = new Map(prev)
      next.set(pageNumber, { pdfWidth: viewport.width, pdfHeight: viewport.height })
      return next
    })
  }

  return (
    <div className="pdf-pane" data-side={side}>
      <h3>{title}</h3>
      <Document
        file={fileUrl}
        onLoadSuccess={({ numPages: pages }) => setNumPages(pages)}
        loading={<div className="pdf-loading">PDF 加载中…</div>}
        error={<div className="pdf-error">PDF 加载失败</div>}
      >
        {Array.from({ length: numPages }, (_, index) => {
          const pageNumber = index + 1
          const pageIndex = index
          const highlights = pageChanges.get(pageIndex) ?? []
          const metrics = pageMetrics.get(pageNumber)

          return (
            <div key={pageNumber} id={`${side}-page-${pageNumber}`} className="pdf-page-wrap">
              <div className="pdf-page-inner">
                <Page
                  pageNumber={pageNumber}
                  width={pageWidth}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  onLoadSuccess={(page) => handlePageLoad(pageNumber, page)}
                />
                {metrics &&
                  highlights.map((change) => {
                    const info = side === 'template' ? change.template : change.contract
                    if (!info || info.bboxes.length === 0) return null
                    const [x0, y0, x1, y1] = info.bboxes[0]
                    const markerStyle = {
                      left: `${(x0 / metrics.pdfWidth) * 100}%`,
                      top: `${(y0 / metrics.pdfHeight) * 100}%`,
                      width: `${Math.max(((x1 - x0) / metrics.pdfWidth) * 100, 0.4)}%`,
                      height: `${Math.max(((y1 - y0) / metrics.pdfHeight) * 100, 0.8)}%`,
                    }

                    return (
                      <div key={change.id}>
                        <div
                          id={`${side}-change-${change.id}`}
                          className="diff-scroll-marker"
                          style={markerStyle}
                          aria-hidden
                        />
                        <DiffOverlay
                          bboxes={info.bboxes}
                          side={side}
                          pdfWidth={metrics.pdfWidth}
                          pdfHeight={metrics.pdfHeight}
                          active={change.id === activeChangeId}
                          changeType={change.type}
                          interactive={!!onChangeSelect}
                          onSelect={() => onChangeSelect?.(change.id)}
                        />
                      </div>
                    )
                  })}
              </div>
              <span className="page-label">第 {pageNumber} 页</span>
            </div>
          )
        })}
      </Document>
    </div>
  )
}
