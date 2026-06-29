type DiffToken = {
  type: 'equal' | 'delete' | 'insert'
  text: string
}

function tokenize(text: string): string[] {
  const tokens: string[] = []
  const pattern = /(\s+|[^\s\u4e00-\u9fff]+|[\u4e00-\u9fff])/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    tokens.push(match[0])
  }

  return tokens.length > 0 ? tokens : [text]
}

function buildLcsTable(left: string[], right: string[]): number[][] {
  const rows = left.length + 1
  const cols = right.length + 1
  const table = Array.from({ length: rows }, () => Array<number>(cols).fill(0))

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      if (left[i - 1] === right[j - 1]) {
        table[i][j] = table[i - 1][j - 1] + 1
      } else {
        table[i][j] = Math.max(table[i - 1][j], table[i][j - 1])
      }
    }
  }

  return table
}

function diffTokens(leftText: string, rightText: string): DiffToken[] {
  const left = tokenize(leftText)
  const right = tokenize(rightText)
  const table = buildLcsTable(left, right)
  const tokens: DiffToken[] = []

  let i = left.length
  let j = right.length

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && left[i - 1] === right[j - 1]) {
      tokens.unshift({ type: 'equal', text: left[i - 1] })
      i -= 1
      j -= 1
    } else if (j > 0 && (i === 0 || table[i][j - 1] >= table[i - 1][j])) {
      tokens.unshift({ type: 'insert', text: right[j - 1] })
      j -= 1
    } else {
      tokens.unshift({ type: 'delete', text: left[i - 1] })
      i -= 1
    }
  }

  return mergeAdjacent(tokens)
}

function mergeAdjacent(tokens: DiffToken[]): DiffToken[] {
  const merged: DiffToken[] = []

  for (const token of tokens) {
    const last = merged[merged.length - 1]
    if (last && last.type === token.type) {
      last.text += token.text
    } else {
      merged.push({ ...token })
    }
  }

  return merged
}

interface InlineTextDiffProps {
  templateText: string
  contractText: string
}

export function InlineTextDiff({ templateText, contractText }: InlineTextDiffProps) {
  const tokens = diffTokens(templateText, contractText)

  return (
    <div className="inline-diff">
      {tokens.map((token, index) => {
        if (token.type === 'equal') {
          return (
            <span key={index} className="inline-equal">
              {token.text}
            </span>
          )
        }

        if (token.type === 'delete') {
          return (
            <span key={index} className="inline-delete">
              {token.text}
            </span>
          )
        }

        return (
          <span key={index} className="inline-insert">
            {token.text}
          </span>
        )
      })}
    </div>
  )
}
