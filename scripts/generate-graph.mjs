import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

const BASE = '/home/james/hackathons/blockchain-wiki/src/content/docs'
const OUT = '/home/james/hackathons/blockchain-wiki/src/data/graph.json'

const SECTIONS = [
  { dir: 'ethereum', prefix: '/ethereum' },
]

const CATEGORY_COLORS = {
  'ethereum/cryptography': '#a78bfa',
  'ethereum/data-structures': '#22d3ee',
  'ethereum/accounts': '#fbbf24',
  'ethereum/transaction-lifecycle': '#34d399',
  'ethereum/consensus': '#f87171',
  'ethereum/advanced': '#f472b6',
}

const CATEGORY_LABELS = {
  'ethereum/cryptography': '密碼學',
  'ethereum/data-structures': '資料結構',
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
      const content = readFileSync(join(catDir, file), 'utf-8')
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

const linkRegex = /\[([^\]]+)\]\((\/ethereum\/[^)]+)\)/g

function scanFileForEdges(filePath, sourceId) {
  const content = readFileSync(filePath, 'utf-8')
  let match
  linkRegex.lastIndex = 0
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
      scanFileForEdges(join(catDir, file), sourceId)
    }
  }
}

// Only output categories that have at least one node
const usedCategories = new Set(nodes.map(n => n.category))
const categories = Object.entries(CATEGORY_LABELS)
  .filter(([key]) => usedCategories.has(key))
  .map(([key, label]) => ({
    key,
    label,
    color: CATEGORY_COLORS[key],
  }))

const graph = { nodes, edges, categories }

writeFileSync(OUT, JSON.stringify(graph, null, 2))
console.log(`Graph: ${nodes.length} nodes, ${edges.length} edges, ${categories.length} categories`)
