interface ComingSoonPanelProps {
  engine: string
}

export function ComingSoonPanel({ engine }: ComingSoonPanelProps) {
  return (
    <section className="coming-soon-panel">
      <h2>{engine} 引擎</h2>
      <p>该 Diff 引擎正在开发中，敬请期待。</p>
    </section>
  )
}
