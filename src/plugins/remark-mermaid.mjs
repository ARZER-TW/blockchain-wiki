import { visit } from 'unist-util-visit'

/**
 * Remark plugin: convert ```mermaid code blocks into raw <div class="mermaid">
 * BEFORE Expressive Code processes them. This way the diagram content stays
 * clean and Mermaid.js can render it client-side.
 */
export function remarkMermaid() {
  return (tree) => {
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'mermaid') return
      parent.children[index] = {
        type: 'html',
        value: `<div class="mermaid">\n${node.value}\n</div>`,
      }
    })
  }
}
