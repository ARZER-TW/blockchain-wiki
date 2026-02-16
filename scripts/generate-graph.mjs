import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

const BASE = '/home/james/hackathons/blockchain-wiki/src/content/docs'
const OUT = '/home/james/hackathons/blockchain-wiki/src/data/graph.json'

// All content sections to scan
const SECTIONS = [
  { dir: 'fundamentals', prefix: '/fundamentals' },
  { dir: 'ethereum', prefix: '/ethereum' },
  { dir: 'bitcoin', prefix: '/bitcoin' },
  { dir: 'solana', prefix: '/solana' },
  { dir: 'comparisons', prefix: '/comparisons', flat: true },
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
  // Bitcoin categories
  'bitcoin/cryptography': '#f59e0b',
  'bitcoin/data-structures': '#fb923c',
  'bitcoin/transactions': '#ef4444',
  'bitcoin/consensus': '#dc2626',
  'bitcoin/network': '#b91c1c',
  'bitcoin/advanced': '#f97316',
  // Solana categories
  'solana/cryptography': '#06b6d4',
  'solana/account-model': '#14b8a6',
  'solana/transactions': '#10b981',
  'solana/consensus': '#059669',
  'solana/runtime': '#0d9488',
  'solana/advanced': '#0891b2',
  // Comparisons
  'comparisons': '#e879f9',
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
  'ethereum/advanced': '進階主題（ETH）',
  'bitcoin/cryptography': '密碼學（BTC）',
  'bitcoin/data-structures': '資料結構（BTC）',
  'bitcoin/transactions': '交易（BTC）',
  'bitcoin/consensus': '共識（BTC）',
  'bitcoin/network': '網路（BTC）',
  'bitcoin/advanced': '進階主題（BTC）',
  'solana/cryptography': '密碼學（SOL）',
  'solana/account-model': '帳戶模型（SOL）',
  'solana/transactions': '交易（SOL）',
  'solana/consensus': '共識（SOL）',
  'solana/runtime': '執行環境（SOL）',
  'solana/advanced': '進階主題（SOL）',
  'comparisons': '跨鏈比較',
}

// Collect all nodes
const nodes = []
const validIds = new Set()

for (const section of SECTIONS) {
  const sectionDir = join(BASE, section.dir)
  if (!existsSync(sectionDir)) continue

  if (section.flat) {
    // Flat section (e.g. comparisons): files directly in the directory
    const files = readdirSync(sectionDir).filter(f => f.endsWith('.md'))
    const catKey = section.dir

    for (const file of files) {
      const slug = file.replace('.md', '')
      const content = readFileSync(join(sectionDir, file), 'utf-8')
      const titleMatch = content.match(/^title:\s*"(.+)"$/m)
      const title = titleMatch ? titleMatch[1] : slug

      const id = `${section.prefix}/${slug}/`
      validIds.add(id)
      nodes.push({
        id,
        label: title,
        category: catKey,
        color: CATEGORY_COLORS[catKey] || '#94a3b8',
      })
    }
  } else {
    // Nested section: section/category/slug
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
}

// Collect edges by scanning markdown links
const edges = []
const edgeSet = new Set()

// Link regex matches all internal paths
const linkRegex = /\[([^\]]+)\]\((\/(ethereum|fundamentals|bitcoin|solana|comparisons)\/[^)]+)\)/g

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

  if (section.flat) {
    const files = readdirSync(sectionDir).filter(f => f.endsWith('.md'))
    for (const file of files) {
      const slug = file.replace('.md', '')
      const sourceId = `${section.prefix}/${slug}/`
      scanFileForEdges(join(sectionDir, file), sourceId)
    }
  } else {
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
