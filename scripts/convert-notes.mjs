import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { join, basename } from 'path'

const VAULT = '/mnt/c/Users/tl/Desktop/ObsidianVault/Ethereum'
const OUT = '/home/james/hackathons/blockchain-wiki/src/content/docs/ethereum'

// Map: Chinese filename (without .md) -> { slug, category }
const FILE_MAP = {
  // cryptography
  'ECDSA': { slug: 'ecdsa', cat: 'cryptography' },
  'ECRECOVER': { slug: 'ecrecover', cat: 'cryptography' },
  'Keccak-256': { slug: 'keccak-256', cat: 'cryptography' },
  'SHA-256': { slug: 'sha-256', cat: 'cryptography' },
  'secp256k1': { slug: 'secp256k1', cat: 'cryptography' },
  'BLS Signatures': { slug: 'bls-signatures', cat: 'cryptography' },
  'BLS12-381': { slug: 'bls12-381', cat: 'cryptography' },
  'CSPRNG': { slug: 'csprng', cat: 'cryptography' },
  '公鑰密碼學': { slug: 'public-key-cryptography', cat: 'cryptography' },
  '數位簽章概述': { slug: 'digital-signature-overview', cat: 'cryptography' },
  '橢圓曲線密碼學': { slug: 'elliptic-curve-cryptography', cat: 'cryptography' },
  '雜湊函數概述': { slug: 'hash-function-overview', cat: 'cryptography' },

  // data-structures
  'ABI 編碼': { slug: 'abi-encoding', cat: 'data-structures' },
  'Bloom Filter': { slug: 'bloom-filter', cat: 'data-structures' },
  'Merkle Patricia Trie': { slug: 'merkle-patricia-trie', cat: 'data-structures' },
  'Merkle Tree': { slug: 'merkle-tree', cat: 'data-structures' },
  'RLP 編碼': { slug: 'rlp-encoding', cat: 'data-structures' },
  'Receipt Trie': { slug: 'receipt-trie', cat: 'data-structures' },
  'SSZ 編碼': { slug: 'ssz-encoding', cat: 'data-structures' },
  'State Trie': { slug: 'state-trie', cat: 'data-structures' },
  'Storage Trie': { slug: 'storage-trie', cat: 'data-structures' },
  'Transaction Trie': { slug: 'transaction-trie', cat: 'data-structures' },

  // accounts
  'EOA': { slug: 'eoa', cat: 'accounts' },
  '合約帳戶': { slug: 'contract-account', cat: 'accounts' },
  '地址推導': { slug: 'address-derivation', cat: 'accounts' },
  'EIP-55 地址校驗': { slug: 'eip-55', cat: 'accounts' },
  'Nonce': { slug: 'nonce', cat: 'accounts' },
  'Gas': { slug: 'gas', cat: 'accounts' },
  'EIP-155 重放保護': { slug: 'eip-155', cat: 'accounts' },
  'EIP-1559 費用市場': { slug: 'eip-1559', cat: 'accounts' },

  // transaction-lifecycle
  '交易生命週期': { slug: 'transaction-lifecycle', cat: 'transaction-lifecycle' },
  '密鑰生成與帳戶創建': { slug: 'key-generation', cat: 'transaction-lifecycle' },
  '交易構建': { slug: 'transaction-construction', cat: 'transaction-lifecycle' },
  '交易簽名': { slug: 'transaction-signing', cat: 'transaction-lifecycle' },
  '交易廣播與驗證': { slug: 'broadcast-validation', cat: 'transaction-lifecycle' },
  '記憶池': { slug: 'mempool', cat: 'transaction-lifecycle' },
  '區塊生產': { slug: 'block-production', cat: 'transaction-lifecycle' },
  '共識與最終性': { slug: 'consensus-finality', cat: 'transaction-lifecycle' },
  '狀態轉換': { slug: 'state-transition', cat: 'transaction-lifecycle' },

  // consensus
  'Attestation': { slug: 'attestation', cat: 'consensus' },
  'Beacon Chain': { slug: 'beacon-chain', cat: 'consensus' },
  'Casper FFG': { slug: 'casper-ffg', cat: 'consensus' },
  'Ethash': { slug: 'ethash', cat: 'consensus' },
  'LMD GHOST': { slug: 'lmd-ghost', cat: 'consensus' },
  'RANDAO': { slug: 'randao', cat: 'consensus' },
  'Slashing': { slug: 'slashing', cat: 'consensus' },
  'Validators': { slug: 'validators', cat: 'consensus' },
  '區塊 Header': { slug: 'block-header', cat: 'consensus' },
  '區塊結構': { slug: 'block-structure', cat: 'consensus' },

  // advanced
  'EIP-4844 Proto-Danksharding': { slug: 'eip-4844', cat: 'advanced' },
  'KZG Commitments': { slug: 'kzg-commitments', cat: 'advanced' },
  'Precompiled Contracts': { slug: 'precompiled-contracts', cat: 'advanced' },
  'Verkle Trees': { slug: 'verkle-trees', cat: 'advanced' },
  'zkSNARKs 支援': { slug: 'zksnarks', cat: 'advanced' },
}

// Build reverse lookup: name -> full path slug
const SLUG_MAP = {}
for (const [name, info] of Object.entries(FILE_MAP)) {
  SLUG_MAP[name] = `/ethereum/${info.cat}/${info.slug}/`
}
// Also add aliases
SLUG_MAP['Ethereum MOC'] = '/ethereum/'
SLUG_MAP['Ethereum Map of Content'] = '/ethereum/'

function convertWikilinks(content) {
  // [[display|text]] format -> [text](path)
  // [[name]] format -> [name](path)
  return content.replace(/\[\[([^\]]+?)\|([^\]]+?)\]\]/g, (match, target, display) => {
    const path = SLUG_MAP[target]
    if (path) return `[${display}](${path})`
    return display
  }).replace(/\[\[([^\]]+?)\]\]/g, (match, name) => {
    const path = SLUG_MAP[name]
    if (path) return `[${name}](${path})`
    return name
  })
}

function processFile(filePath, name) {
  const info = FILE_MAP[name]
  if (!info) {
    console.log(`[SKIP] No mapping for: ${name}`)
    return
  }

  let content = readFileSync(filePath, 'utf-8')

  // Extract existing frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/)
  let existingFm = {}
  let body = content
  if (fmMatch) {
    body = content.slice(fmMatch[0].length)
    // Parse simple YAML
    const fmText = fmMatch[1]
    const tagsMatch = fmText.match(/tags:\s*\[([^\]]*)\]/)
    if (tagsMatch) existingFm.tags = tagsMatch[1]
    const aliasMatch = fmText.match(/aliases:\s*\[([^\]]*)\]/)
    if (aliasMatch) existingFm.aliases = aliasMatch[1]
  }

  // Extract title from first # heading
  const titleMatch = body.match(/^#\s+(.+)$/m)
  const title = titleMatch ? titleMatch[1] : name

  // Convert wikilinks
  body = convertWikilinks(body)

  // Build new frontmatter
  const newFm = [
    '---',
    `title: "${title}"`,
    `description: "${existingFm.aliases || title}"`,
  ]
  if (existingFm.tags) {
    newFm.push(`tags: [${existingFm.tags}]`)
  }
  newFm.push('---')

  const outPath = join(OUT, info.cat, `${info.slug}.md`)
  writeFileSync(outPath, newFm.join('\n') + '\n' + body)
  console.log(`[OK] ${name} -> ${info.cat}/${info.slug}.md`)
}

// Scan vault directories
const dirs = {
  '密碼學基礎': 'cryptography',
  'Ethereum 資料結構': 'data-structures',
  '帳戶與交易': 'accounts',
  '交易流程': 'transaction-lifecycle',
  '區塊與共識': 'consensus',
  '進階主題': 'advanced',
}

let totalProcessed = 0
for (const [dirName, cat] of Object.entries(dirs)) {
  const dirPath = join(VAULT, dirName)
  const files = readdirSync(dirPath).filter(f => f.endsWith('.md'))
  for (const file of files) {
    const name = file.replace('.md', '')
    processFile(join(dirPath, file), name)
    totalProcessed++
  }
}

console.log(`\nTotal: ${totalProcessed} files processed`)
