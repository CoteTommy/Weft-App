export interface FileItem {
  id: string
  name: string
  kind: 'Document' | 'Image' | 'Audio' | 'Archive' | 'Note'
  sizeLabel: string
  owner: string
  mime?: string
  dataBase64?: string
  paperUri?: string
  paperTitle?: string
  paperCategory?: string
}
