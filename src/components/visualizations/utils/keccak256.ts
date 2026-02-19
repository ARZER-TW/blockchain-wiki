// Minimal Keccak-256 implementation for browser use
// (SubtleCrypto doesn't support Keccak, only SHA)

const RC: readonly bigint[] = [
  0x0001n, 0x8082n, 0x808an, 0x80008000n,
  0x808bn, 0x80000001n, 0x80008081n, 0x8009n,
  0x008an, 0x0088n, 0x80008009n, 0x8000000an,
  0x8000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
]

const ROT: readonly bigint[] = [
  0n,1n,62n,28n,27n,36n,44n,6n,55n,20n,
  3n,10n,43n,25n,39n,41n,45n,15n,21n,8n,
  18n,2n,61n,56n,14n,
]

const PI: readonly number[] = [
  0,10,20,5,15,16,1,11,21,6,
  7,17,2,12,22,23,8,18,3,13,
  14,24,9,19,4,
]

function rotl64(x: bigint, n: bigint): bigint {
  const mask = (1n << 64n) - 1n
  return ((x << n) | (x >> (64n - n))) & mask
}

function keccakF(state: bigint[]): void {
  for (let round = 0; round < 24; round++) {
    const C = Array.from({ length: 5 }, (_, x) =>
      state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20]
    )
    const D = C.map((_, x) =>
      C[(x + 4) % 5] ^ rotl64(C[(x + 1) % 5], 1n)
    )
    for (let i = 0; i < 25; i++) state[i] ^= D[i % 5]

    const B: bigint[] = new Array(25).fill(0n)
    for (let i = 0; i < 25; i++) B[PI[i]] = rotl64(state[i], ROT[i])

    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        state[y * 5 + x] = B[y * 5 + x] ^ (~B[y * 5 + (x + 1) % 5] & B[y * 5 + (x + 2) % 5])
      }
    }
    state[0] ^= RC[round]
  }
}

export function keccak256(input: Uint8Array): string {
  const rate = 136
  const padLen = rate - (input.length % rate)
  const padded = new Uint8Array(input.length + padLen)
  padded.set(input)
  padded[input.length] = 0x01
  padded[padded.length - 1] |= 0x80

  const state: bigint[] = new Array(25).fill(0n)
  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n
      for (let b = 0; b < 8; b++) {
        lane |= BigInt(padded[offset + i * 8 + b]) << BigInt(b * 8)
      }
      state[i] ^= lane
    }
    keccakF(state)
  }

  const output = new Uint8Array(32)
  for (let i = 0; i < 4; i++) {
    let lane = state[i]
    for (let b = 0; b < 8; b++) {
      output[i * 8 + b] = Number(lane & 0xffn)
      lane >>= 8n
    }
  }

  return bytesToHex(output)
}

export function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.replace(/^0x/, '')
  const bytes = new Uint8Array(cleaned.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}
