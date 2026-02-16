import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

const BASE = '/home/james/hackathons/blockchain-wiki/src/content/docs'
const OUT = '/home/james/hackathons/blockchain-wiki/src/data/graph.json'

// All content sections to scan
const SECTIONS = [
  { dir: 'fundamentals', prefix: '/fundamentals' },
  { dir: 'ethereum', prefix: '/ethereum' },
]

// Category colors
const CATEGORY_COLORS = {
  // Fundamentals categories
  'fundamentals/cryptography': '#818cf8',
  'fundamentals/data-structures': '#67e8f9',
  'fundamentals/zero-knowledge': '#c084fc',
  'fundamentals/concepts': '#a3e635',
  // Ethereum categories
  'ethereum/cryptography': '#a78bfa',
  'ethereum/data-structures': '#22d3ee',
  'ethereum/accounts': '#fbbf24',
  'ethereum/transaction-lifecycle': '#34d399',
  'ethereum/consensus': '#f87171',
  'ethereum/advanced': '#f472b6',
}

const CATEGORY_LABELS = {
  'fundamentals/cryptography': '密碼學（通用）',
  'fundamentals/data-structures': '資料結構（通用）',
  'fundamentals/zero-knowledge': '零知識證明',
  'fundamentals/concepts': '通用概念',
  'ethereum/cryptography': '密碼學（ETH）',
  'ethereum/data-structures': '資料結構（ETH）',
  'ethereum/accounts': '帳戶與交易',
  'ethereum/transaction-lifecycle': '交易流程',
  'ethereum/consensus': '區塊與共識',
  'ethereum/advanced': '進階主題',
}

// Collect all nodes
const nodes = []
const validIds = new Set()

for (const section of SECTIONS) {
  const sectionDir = join(BASE, section.dir)
  if (!existsSync(sectionDir)) continue

  const categories = readdirSync(sectionDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)

  for (const cat of categories) {
    const catDir = join(sectionDir, cat)
    const files = readdirSync(catDir).filter(f => f.endsWith('.md'))
    const catKey = `${section.dir}/${cat}`

    for (const file of files) {
      const slug = file.replace('.md', '')
      const filePath = join(catDir, file)
      const content = readFileSync(filePath, 'utf-8')

      const titleMatch = content.match(/^title:\s*"(.+)"$/m)
      const title = titleMatch ? titleMatch[1] : slug

      const id = `${section.prefix}/${cat}/${slug}/`
      validIds.add(id)
      nodes.push({
        id,
        label: title,
        category: catKey,
        color: CATEGORY_COLORS[catKey] || '#94a3b8',
      })
    }
  }
}

// Collect edges by scanning markdown links
const edges = []
const edgeSet = new Set()

for (const section of SECTIONS) {
  const sectionDir = join(BASE, section.dir)
  if (!existsSync(sectionDir)) continue

  const categories = readdirSync(sectionDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)

  for (const cat of categories) {
    const catDir = join(sectionDir, cat)
    const files = readdirSync(catDir).filter(f => f.endsWith('.md'))

    for (const file of files) {
      const slug = file.replace('.md', '')
      const sourceId = `${section.prefix}/${cat}/${slug}/`
      const content = readFileSync(join(catDir, file), 'utf-8')

      // Find all markdown links to internal paths (both /ethereum/ and /fundamentals/)
      const linkRegex = /\[([^\]]+)\]\((\/(ethereum|fundamentals)\/[^)]+)\)/g
      let match
      while ((match = linkRegex.exec(content)) !== null) {
        const targetId = match[2]
        if (validIds.has(targetId) && targetId !== sourceId) {
          const edgeKey = [sourceId, targetId].sort().join('|')
          if (!edgeSet.has(edgeKey)) {
            edgeSet.add(edgeKey)
            edges.push({ source: sourceId, target: targetId })
          }
        }
      }
    }
  }
}

const graph = {
  nodes,
  edges,
  categories: Object.entries(CATEGORY_LABELS).map(([key, label]) => ({
    key,
    label,
    color: CATEGORY_COLORS[key],
  })),
}

writeFileSync(OUT, JSON.stringify(graph, null, 2))
console.log(`Graph: ${nodes.length} nodes, ${edges.length} edges`)
console.log(`Sections: ${SECTIONS.map(s => s.dir).join(', ')}`)
console.log(`Categories: ${Object.keys(CATEGORY_LABELS).join(', ')}`)
