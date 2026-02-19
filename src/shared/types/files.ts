export interface FileItem {
  id: string
  name: string
  kind: 'Document' | 'Image' | 'Audio' | 'Archive' | 'Note'
  sizeLabel: string
  sizeBytes: number
  createdAtMs: number
  owner: string
  mime?: string
  hasInlineData: boolean
  dataBase64?: string
  paperUri?: string
  paperTitle?: string
  paperCategory?: string
}
