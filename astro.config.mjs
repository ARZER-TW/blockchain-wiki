// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

import react from '@astrojs/react';

export default defineConfig({
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
  },
  integrations: [starlight({
    title: 'Blockchain Wiki',
    components: {
      TableOfContents: './src/overrides/TableOfContents.astro',
      MarkdownContent: './src/overrides/MarkdownContent.astro',
    },
    description: 'Interactive blockchain learning wiki with Ethereum deep dives',
    social: [
      { icon: 'github', label: 'GitHub', href: 'https://github.com/ARZER-TW/blockchain-wiki' },
    ],
    head: [
      {
        tag: 'link',
        attrs: {
          rel: 'stylesheet',
          href: 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css',
        },
      },
      {
        tag: 'script',
        attrs: {
          type: 'module',
          src: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs',
        },
      },
      {
        tag: 'script',
        content: `
          document.addEventListener('DOMContentLoaded', () => {
            if (window.mermaid) {
              window.mermaid.initialize({ startOnLoad: true, theme: 'dark' });
            }
          });
          document.addEventListener('astro:page-load', () => {
            if (window.mermaid) {
              window.mermaid.run();
            }
          });
        `,
      },
    ],
    customCss: [
      './src/styles/custom.css',
    ],
    defaultLocale: 'root',
    locales: {
      root: { label: '繁體中文', lang: 'zh-TW' },
    },
    sidebar: [
      { label: '知識圖譜', slug: 'graph' },
      { label: '學習路徑', slug: 'paths' },
      {
        label: 'Ethereum',
        items: [
          {
            label: '密碼學基礎',
            autogenerate: { directory: 'ethereum/cryptography' },
          },
          {
            label: '資料結構',
            autogenerate: { directory: 'ethereum/data-structures' },
          },
          {
            label: '帳戶與交易',
            autogenerate: { directory: 'ethereum/accounts' },
          },
          {
            label: '交易流程',
            autogenerate: { directory: 'ethereum/transaction-lifecycle' },
          },
          {
            label: '區塊與共識',
            autogenerate: { directory: 'ethereum/consensus' },
          },
          {
            label: '進階主題',
            autogenerate: { directory: 'ethereum/advanced' },
          },
        ],
      },
    ],
  }), react()],
})