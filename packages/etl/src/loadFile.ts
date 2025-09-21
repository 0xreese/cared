import * as fs from 'node:fs'
import { CSVLoader } from '@langchain/community/document_loaders/fs/csv'
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx'
import { EPubLoader } from '@langchain/community/document_loaders/fs/epub'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { PPTXLoader } from '@langchain/community/document_loaders/fs/pptx'
import { SRTLoader } from '@langchain/community/document_loaders/fs/srt'
import {
  UNSTRUCTURED_API_FILETYPES,
  UnstructuredLoader,
} from '@langchain/community/document_loaders/fs/unstructured'
import { JSONLinesLoader, JSONLoader } from 'langchain/document_loaders/fs/json'
import { TextLoader } from 'langchain/document_loaders/fs/text'
import mime from 'mime'
import { v4 as uuid } from 'uuid'

import type { BaseDocumentLoader } from '@langchain/core/document_loaders/base'
import { env } from './env'

export interface Document {
  content: string
  metadata: Record<string, any>
}

export async function loadFile(
  data: Uint8Array, // file data
  filename: string,
  opts?: {
    type?: string // file extension
    mimeType?: string
    preferUnstructured?: boolean
  },
): Promise<Document[]> {
  let type = opts?.type
  if (!type && opts?.mimeType) {
    type = mime.getExtension(opts.mimeType) ?? undefined
  }
  if (!type) {
    type = filename.split('.').pop()
  }
  if (!type) {
    throw new Error('Could not determine file type')
  }

  let tempFilepath: string | undefined

  let loader: BaseDocumentLoader | undefined
  if (!opts?.preferUnstructured) {
    const blob = new Blob([data], {
      type: mime.getType(type) ?? undefined,
    })

    switch (type) {
      case 'pdf':
        loader = new PDFLoader(blob, {
          splitPages: true,
          pdfjs: () => import('pdfjs-serverless'),
        })
        break
      case 'doc':
      // fallthrough
      case 'docx':
        loader = new DocxLoader(blob, {
          type,
        })
        break
      case 'pptx':
        loader = loader = new PPTXLoader(blob)
        break
      case 'epub': {
        // Write epub data to a temporary file
        tempFilepath = `/tmp/${uuid()}.epub`
        await fs.promises.writeFile(tempFilepath, data)

        loader = new EPubLoader(tempFilepath, {
          splitChapters: true,
        })
        break
      }
      case 'txt':
        loader = new TextLoader(blob)
        break
      case 'json':
        loader = new JSONLoader(blob)
        break
      case 'jsonl':
        loader = new JSONLinesLoader(blob, '')
        break
      case 'csv':
        loader = new CSVLoader(blob)
        break
      case 'srt':
        loader = new SRTLoader(blob)
        break
    }
  }

  if (!loader && UNSTRUCTURED_API_FILETYPES.includes('.' + type)) {
    loader = new UnstructuredLoader(
      {
        buffer: Buffer.from(data),
        fileName: filename,
      },
      {
        apiKey: env.UNSTRUCTURED_API_KEY,
        apiUrl: env.UNSTRUCTURED_API_URL,
        chunkingStrategy: 'by_title',
        combineUnderNChars: 2000,
        maxCharacters: 2000,
        strategy: 'hi_res',
      },
    )
  }

  if (!loader) {
    throw new Error(`Unsupported file type: ${type}`)
  }

  const docs = await loader.load()

  if (tempFilepath) {
    await fs.promises.unlink(tempFilepath)
  }

  return docs.map((doc) => {
    delete doc.metadata.source
    delete doc.metadata.blobType

    return {
      content: doc.pageContent,
      metadata: doc.metadata,
    }
  })
}
