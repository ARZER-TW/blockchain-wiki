#!/usr/bin/env node
/**
 * P3 Content Restructure Script
 *
 * 1. Copy 5 pure fundamental notes to fundamentals/
 * 2. Update frontmatter tags
 * 3. Update all internal links across ALL notes
 * 4. Remove ethereum/ copies of the 5 moved notes
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DOCS = path.join(__dirname, '..', 'src', 'content', 'docs')

// === LINK MAPPING: old path -> new path ===
// For the 5 pure fundamental notes being moved
const LINK_MAP = {
  '/ethereum/cryptography/elliptic-curve-cryptography/': '/fundamentals/cryptography/elliptic-curve-cryptography/',
  '/ethereum/cryptography/hash-function-overview/': '/fundamentals/cryptography/hash-function-overview/',
  '/ethereum/cryptography/public-key-cryptography/': '/fundamentals/cryptography/public-key-cryptography/',
  '/ethereum/cryptography/csprng/': '/fundamentals/cryptography/csprng/',
  '/ethereum/data-structures/merkle-tree/': '/fundamentals/data-structures/merkle-tree/',
}

// For the 14 hybrid notes - these will have BOTH a fundamentals/ and ethereum/ version
// Links to these should keep pointing to ethereum/ (the ETH-specific version)
// The fundamentals/ versions are NEW additions, not replacements

// === FILE OPERATIONS ===

function getAllMdFiles(dir) {
  const files = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...getAllMdFiles(fullPath))
    } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
      files.push(fullPath)
    }
  }
  return files
}

function updateFrontmatterTags(content, oldTag, newTag) {
  return content.replace(
    /^(---\n[\s\S]*?tags:\s*\[)([\s\S]*?)(\][\s\S]*?---)/m,
    (match, pre, tags, post) => {
      const updatedTags = tags.replace(oldTag, newTag)
      return `${pre}${updatedTags}${post}`
    }
  )
}

function updateLinks(content) {
  let updated = content
  for (const [oldPath, newPath] of Object.entries(LINK_MAP)) {
    // Replace markdown link paths
    updated = updated.replaceAll(oldPath, newPath)
  }
  return updated
}

// === MAIN ===

console.log('[P3] Starting content restructure...\n')

// Step 1: Ensure fundamentals/ directories exist
const fundDirs = [
  'fundamentals/cryptography',
  'fundamentals/data-structures',
  'fundamentals/zero-knowledge',
  'fundamentals/concepts',
]
for (const dir of fundDirs) {
  fs.mkdirSync(path.join(DOCS, dir), { recursive: true })
}
console.log('[OK] Fundamentals directories created')

// Step 2: Copy 5 pure fundamental notes and update their frontmatter
const PURE_MOVES = [
  { from: 'ethereum/cryptography/elliptic-curve-cryptography.md', to: 'fundamentals/cryptography/elliptic-curve-cryptography.md' },
  { from: 'ethereum/cryptography/hash-function-overview.md', to: 'fundamentals/cryptography/hash-function-overview.md' },
  { from: 'ethereum/cryptography/public-key-cryptography.md', to: 'fundamentals/cryptography/public-key-cryptography.md' },
  { from: 'ethereum/cryptography/csprng.md', to: 'fundamentals/cryptography/csprng.md' },
  { from: 'ethereum/data-structures/merkle-tree.md', to: 'fundamentals/data-structures/merkle-tree.md' },
]

for (const { from, to } of PURE_MOVES) {
  const srcPath = path.join(DOCS, from)
  const dstPath = path.join(DOCS, to)

  let content = fs.readFileSync(srcPath, 'utf-8')

  // Update frontmatter tags
  content = updateFrontmatterTags(content, 'ethereum', 'fundamentals')

  // Update internal links within the file
  content = updateLinks(content)

  fs.writeFileSync(dstPath, content)
  console.log(`[COPY] ${from} -> ${to}`)
}

// Step 3: Delete original ethereum/ copies of the 5 moved notes
for (const { from } of PURE_MOVES) {
  const srcPath = path.join(DOCS, from)
  fs.unlinkSync(srcPath)
  console.log(`[DEL]  ${from}`)
}

// Step 4: Update ALL internal links across ALL remaining notes
const allFiles = getAllMdFiles(DOCS)
let updatedCount = 0

for (const filePath of allFiles) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const updated = updateLinks(content)

  if (content !== updated) {
    fs.writeFileSync(filePath, updated)
    updatedCount++
    const rel = path.relative(DOCS, filePath)
    console.log(`[LINK] Updated links in ${rel}`)
  }
}

console.log(`\n[OK] Updated links in ${updatedCount} files`)
console.log(`[OK] 5 pure fundamental notes moved`)
console.log('\n[NEXT] 14 hybrid notes need content splitting (manual/agent work)')

// Step 5: Print summary
console.log('\n=== Current Structure ===')
const fundFiles = getAllMdFiles(path.join(DOCS, 'fundamentals'))
console.log(`fundamentals/: ${fundFiles.length} files`)
const ethFiles = getAllMdFiles(path.join(DOCS, 'ethereum'))
console.log(`ethereum/: ${ethFiles.length} files`)
