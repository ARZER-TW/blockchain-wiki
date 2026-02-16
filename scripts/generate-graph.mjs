import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'

const DOCS = '/home/james/hackathons/blockchain-wiki/src/content/docs/ethereum'
const OUT = '/home/james/hackathons/blockchain-wiki/src/data/graph.json'

// Category colors (matching plan: Purple, Cyan, Amber, Emerald, Red, Pink)
const CATEGORY_COLORS = {
  cryptography: '#a78bfa',
  'data-structures': '#22d3ee',
  accounts: '#fbbf24',
  'transaction-lifecycle': '#34d399',
  consensus: '#f87171',
  advanced: '#f472b6',
}

const CATEGORY_LABELS = {
  cryptography: '密碼學基礎',
  'data-structures': '資料結構',
  accounts: '帳戶與交易',
  'transaction-lifecycle': '交易流程',
  consensus: '區塊與共識',
  advanced: '進階主題',
}

// Collect all nodes
const nodes = []
const slugToId = {}

const categories = readdirSync(DOCS, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)

for (const cat of categories) {
  const catDir = join(DOCS, cat)
  const files = readdirSync(catDir).filter(f => f.endsWith('.md'))

  for (const file of files) {
    const slug = file.replace('.md', '')
    const filePath = join(catDir, file)
    const content = readFileSync(filePath, 'utf-8')

    // Extract title from frontmatter
    const titleMatch = content.match(/^title:\s*"(.+)"$/m)
    const title = titleMatch ? titleMatch[1] : slug

    const id = `/ethereum/${cat}/${slug}/`
    slugToId[id] = id
    nodes.push({
      id,
      label: title,
      category: cat,
      color: CATEGORY_COLORS[cat],
    })
  }
}

// Build a set of valid node IDs for quick lookup
const validIds = new Set(nodes.map(n => n.id))

// Collect edges by scanning markdown links
const edges = []
const edgeSet = new Set()

for (const cat of categories) {
  const catDir = join(DOCS, cat)
  const files = readdirSync(catDir).filter(f => f.endsWith('.md'))

  for (const file of files) {
    const slug = file.replace('.md', '')
    const sourceId = `/ethereum/${cat}/${slug}/`
    const content = readFileSync(join(catDir, file), 'utf-8')

    // Find all markdown links to internal paths
    const linkRegex = /\[([^\]]+)\]\((\/ethereum\/[^)]+)\)/g
    let match
    while ((match = linkRegex.exec(content)) !== null) {
      const targetId = match[2]
      if (validIds.has(targetId) && targetId !== sourceId) {
        // Deduplicate: only keep one edge per pair (undirected)
        const edgeKey = [sourceId, targetId].sort().join('|')
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey)
          edges.push({ source: sourceId, target: targetId })
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
console.log('Categories:', categories.join(', '))
