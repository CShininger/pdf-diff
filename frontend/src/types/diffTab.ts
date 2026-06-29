export type DiffTab = 'python-diff' | 'java-diff' | 'golang-diff'

export const DIFF_TABS: { id: DiffTab; label: string }[] = [
  { id: 'python-diff', label: 'Python Diff' },
  { id: 'java-diff', label: 'Java Diff' },
  { id: 'golang-diff', label: 'Golang Diff' },
]
